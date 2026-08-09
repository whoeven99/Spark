import prisma from "../../db.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  getGoogleMerchantProduct,
  refreshGoogleAccessToken,
} from "./clients/googleMerchantClient.server";
import {
  findShopByGmcMerchantId,
  getGoogleMerchantCredential,
  setGoogleMerchantCredential,
  setGmcSubscriptionName,
} from "./credentialStore.server";

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com/notifications/v1";
const LOG_PREFIX = "[AdsCatalog][GmcNotify]";

// ─── Webhook URL ──────────────────────────────────────────────────────────────

/**
 * Build the HTTPS callback URL registered with Merchant Notifications API.
 * Requires GMC_WEBHOOK_SECRET and SHOPIFY_APP_URL to be set.
 * Returns null (and logs a warning) when either is missing.
 */
export function getGmcWebhookCallbackUrl(): string | null {
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  const secret = (process.env.GMC_WEBHOOK_SECRET ?? "").trim();
  if (!appUrl || !secret) {
    console.warn(
      `${LOG_PREFIX} GMC_WEBHOOK_SECRET or SHOPIFY_APP_URL not configured – notification subscription skipped`,
    );
    return null;
  }
  return `${appUrl}/webhooks/google-merchant/product-status?token=${encodeURIComponent(secret)}`;
}

// ─── Subscription lifecycle ───────────────────────────────────────────────────

/**
 * Register a PRODUCT_STATUS_CHANGE subscription with Merchant Notifications API.
 * Best-effort: logs warnings but never throws so callers are not blocked.
 */
export async function registerGmcNotificationSubscription(params: {
  shop: string;
  merchantId: string;
  accessToken: string;
}): Promise<void> {
  const callbackUrl = getGmcWebhookCallbackUrl();
  if (!callbackUrl) return;

  const url = `${MERCHANT_API_BASE}/accounts/${encodeURIComponent(params.merchantId)}/notificationsubscriptions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        registeredEvent: "PRODUCT_STATUS_CHANGE",
        targetAccount: `accounts/${params.merchantId}`,
        callBackUri: callbackUrl,
      }),
    });
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} registration network error shop=${params.shop}: ${formatOutboundNetworkError(e)}`,
    );
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(
      `${LOG_PREFIX} registration failed HTTP ${response.status} shop=${params.shop}: ${text.slice(0, 300)}`,
    );
    return;
  }

  const json = (await response.json().catch(() => ({}))) as { name?: string };
  const subscriptionName = json.name ?? "";
  if (subscriptionName) {
    await setGmcSubscriptionName(params.shop, subscriptionName).catch((e) => {
      console.warn(
        `${LOG_PREFIX} failed to persist subscriptionName shop=${params.shop}: ${e instanceof Error ? e.message : String(e)}`,
      );
    });
    console.info(
      `${LOG_PREFIX} registered subscription=${subscriptionName} shop=${params.shop}`,
    );
  }
}

/**
 * Delete an existing Merchant Notifications subscription.
 * Best-effort: logs warnings but never throws.
 */
export async function unregisterGmcNotificationSubscription(params: {
  shop: string;
  subscriptionName: string;
  accessToken: string;
}): Promise<void> {
  const url = `${MERCHANT_API_BASE}/${params.subscriptionName}`;
  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `${LOG_PREFIX} delete subscription failed HTTP ${response.status} shop=${params.shop}: ${text.slice(0, 200)}`,
      );
    } else {
      console.info(
        `${LOG_PREFIX} deleted subscription=${params.subscriptionName} shop=${params.shop}`,
      );
    }
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} delete subscription network error shop=${params.shop}: ${formatOutboundNetworkError(e)}`,
    );
  }
}

// ─── Notification parsing ─────────────────────────────────────────────────────

export interface GmcProductStatusNotification {
  /** "accounts/{merchantId}" */
  account: string;
  /** Tilde-separated product ID, e.g. "online~en~US~sku123" */
  resourceId: string;
  changes: Array<{
    oldValue?: string;
    newValue?: string;
    regionCode?: string;
    reportingContext?: string;
  }>;
  eventTime?: string;
}

/**
 * Parse a raw notification body.
 * Handles two formats:
 *   1. Direct JSON (Merchant Notifications API v1)
 *   2. Pub/Sub push envelope { message: { data: "<base64>" } }
 */
export function parseGmcNotificationBody(body: unknown): GmcProductStatusNotification | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;

  // Pub/Sub push envelope
  if (raw.message && typeof (raw.message as Record<string, unknown>).data === "string") {
    try {
      const decoded = Buffer.from(
        (raw.message as Record<string, unknown>).data as string,
        "base64",
      ).toString("utf8");
      return parseGmcNotificationBody(JSON.parse(decoded) as unknown);
    } catch {
      return null;
    }
  }

  const account = typeof raw.account === "string" ? raw.account : "";
  const resourceId = typeof raw.resourceId === "string" ? raw.resourceId : "";
  if (!account || !resourceId) return null;

  const rawChanges = Array.isArray(raw.changes) ? (raw.changes as Array<Record<string, unknown>>) : [];
  return {
    account,
    resourceId,
    changes: rawChanges.map((c) => ({
      oldValue: typeof c.oldValue === "string" ? c.oldValue : undefined,
      newValue: typeof c.newValue === "string" ? c.newValue : undefined,
      regionCode: typeof c.regionCode === "string" ? c.regionCode : undefined,
      reportingContext: typeof c.reportingContext === "string" ? c.reportingContext : undefined,
    })),
    eventTime: typeof raw.eventTime === "string" ? raw.eventTime : undefined,
  };
}

// ─── Notification handling ────────────────────────────────────────────────────

/** Derive offerId from tilde-separated resourceId ("online~en~US~sku123" → "sku123"). */
function offerIdFromResourceId(resourceId: string): string {
  const parts = resourceId.split("~");
  if (parts.length < 3) return resourceId;
  const prefixLength = parts[0] === "online" || parts[0] === "local" ? 3 : 2;
  return parts.slice(prefixLength).join("~") || resourceId;
}

function marketFromResourceId(resourceId: string): {
  contentLanguage: string;
  feedLabel: string;
} {
  const parts = resourceId.split("~");
  const offset = parts[0] === "online" || parts[0] === "local" ? 1 : 0;
  return {
    contentLanguage: parts[offset]?.toLowerCase() || "und",
    feedLabel: parts[offset + 1]?.toUpperCase() || "ZZ",
  };
}

/** Worst-case status from the change list (disapproved > pending > approved). */
function statusFromChanges(
  changes: GmcProductStatusNotification["changes"],
): "approved" | "disapproved" | "pending" | "unknown" {
  const values = changes.map((c) => (c.newValue ?? "").toLowerCase());
  if (values.includes("disapproved")) return "disapproved";
  if (values.includes("pending")) return "pending";
  if (values.some((v) => v === "approved")) return "approved";
  return "unknown";
}

/** Look up which shop owns the given merchantId; failures must not 5xx the callback. */
async function findShopByMerchantId(merchantId: string): Promise<string | null> {
  try {
    return await findShopByGmcMerchantId(merchantId);
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} findShopByMerchantId failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/**
 * Fetch a single product's processed status from Merchant API v1 and upsert it.
 * Throws on API or network errors so callers can fall back.
 */
async function refreshSingleProductStatus(params: {
  shop: string;
  merchantId: string;
  /** Tilde-separated, e.g. "online~en~US~sku123" */
  resourceId: string;
  accessToken: string;
}): Promise<void> {
  const product = await getGoogleMerchantProduct(params);
  const offerId = product.offerId ?? offerIdFromResourceId(params.resourceId);
  if (!offerId) return;
  const market = marketFromResourceId(params.resourceId);
  const contentLanguage = product.contentLanguage?.toLowerCase() || market.contentLanguage;
  const feedLabel = product.feedLabel?.toUpperCase() || market.feedLabel;

  const destinations = product.productStatus?.destinationStatuses ?? [];
  const statuses: string[] = destinations.flatMap((d) => {
    if ((d.disapprovedCountries?.length ?? 0) > 0) return ["disapproved"];
    if ((d.pendingCountries?.length ?? 0) > 0) return ["pending"];
    if ((d.approvedCountries?.length ?? 0) > 0) return ["approved"];
    return [];
  });
  const rawIssues = product.productStatus?.itemLevelIssues ?? [];

  let status: "approved" | "disapproved" | "pending" | "expiring" | "unknown";
  if (statuses.includes("disapproved")) status = "disapproved";
  else if (statuses.includes("pending")) status = "pending";
  else if (statuses.includes("approved")) status = "approved";
  else if (rawIssues.some((issue) => issue.severity === "DISAPPROVED")) status = "disapproved";
  else if (rawIssues.length > 0) status = "pending";
  else status = "unknown";

  const issues = rawIssues.map((issue) => ({
    code: issue.code ?? "unknown",
    servability: issue.severity?.toLowerCase() ?? "unknown",
    description: issue.description ?? "",
    detail: issue.detail,
  }));

  await prisma.gmcProductStatus.upsert({
    where: {
      shop_offerId_contentLanguage_feedLabel: {
        shop: params.shop,
        offerId,
        contentLanguage,
        feedLabel,
      },
    },
    update: {
      merchantId: params.merchantId,
      title: product.productAttributes?.title ?? null,
      status,
      issues: issues as unknown as object,
      checkedAt: new Date(),
    },
    create: {
      shop: params.shop,
      merchantId: params.merchantId,
      offerId,
      contentLanguage,
      feedLabel,
      title: product.productAttributes?.title ?? null,
      status,
      issues: issues as unknown as object,
      checkedAt: new Date(),
    },
  });
}

/**
 * Main entry point for incoming Google Merchant product status change notifications.
 * Resolves shop from merchantId, refreshes the product's status via Merchant API,
 * and falls back to notification-derived status on API failure.
 */
export async function handleGmcProductStatusNotification(
  notification: GmcProductStatusNotification,
): Promise<void> {
  const merchantId = notification.account.replace(/^accounts\//, "");
  if (!merchantId) {
    console.warn(`${LOG_PREFIX} missing merchantId in account="${notification.account}"`);
    return;
  }

  const shop = await findShopByMerchantId(merchantId);
  if (!shop) {
    console.warn(`${LOG_PREFIX} no shop for merchantId=${merchantId}, ignoring`);
    return;
  }

  // Product deleted from GMC: remove cached status
  const allDeleted = notification.changes.every((c) => !c.newValue);
  if (allDeleted) {
    const offerId = offerIdFromResourceId(notification.resourceId);
    const market = marketFromResourceId(notification.resourceId);
    if (offerId) {
      await prisma.gmcProductStatus
        .deleteMany({
          where: {
            shop,
            offerId,
            contentLanguage: market.contentLanguage,
            feedLabel: market.feedLabel,
          },
        })
        .catch(() => undefined);
      console.info(`${LOG_PREFIX} removed deleted product shop=${shop} offerId=${offerId}`);
    }
    return;
  }

  // Get a valid access token (refresh if possible)
  const credential = await getGoogleMerchantCredential(shop);
  if (!credential) return;

  let accessToken = credential.accessToken;
  if (credential.refreshToken && credential.clientId && credential.clientSecret) {
    const refreshed = await refreshGoogleAccessToken({
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
      refreshToken: credential.refreshToken,
    }).catch(() => null);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      await setGoogleMerchantCredential(shop, {
        accessToken,
        refreshToken: credential.refreshToken,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
        merchantId: credential.merchantId,
      });
    }
  }

  const offerId = offerIdFromResourceId(notification.resourceId);
  const market = marketFromResourceId(notification.resourceId);

  // Primary: fetch the processed Merchant API product (includes issues)
  try {
    await refreshSingleProductStatus({
      shop,
      merchantId,
      resourceId: notification.resourceId,
      accessToken,
    });
    console.info(
      `${LOG_PREFIX} updated shop=${shop} offerId=${offerId} changes=${JSON.stringify(notification.changes)}`,
    );
  } catch (e) {
    // Fallback: write status from notification without issue detail
    const status = statusFromChanges(notification.changes);
    if (!offerId) return;
    await prisma.gmcProductStatus
      .upsert({
        where: {
          shop_offerId_contentLanguage_feedLabel: {
            shop,
            offerId,
            contentLanguage: market.contentLanguage,
            feedLabel: market.feedLabel,
          },
        },
        update: { merchantId, status, checkedAt: new Date() },
        create: {
          shop,
          merchantId,
          offerId,
          contentLanguage: market.contentLanguage,
          feedLabel: market.feedLabel,
          title: null,
          status,
          issues: [] as unknown as object,
          checkedAt: new Date(),
        },
      })
      .catch((dbErr) => {
        console.warn(
          `${LOG_PREFIX} fallback upsert failed shop=${shop} offerId=${offerId}: ${dbErr}`,
        );
      });
    console.warn(
      `${LOG_PREFIX} single-product fetch failed, used notification fallback shop=${shop} offerId=${offerId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
