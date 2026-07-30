import prisma from "../../db.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import { refreshGoogleAccessToken } from "./clients/googleMerchantClient.server";
import {
  getGoogleMerchantCredential,
  setGmcSubscriptionName,
} from "./credentialStore.server";

const MERCHANT_API_BASE = "https://merchantapi.googleapis.com/notifications/v1";
const GMC_CONTENT_API_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";
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
  return parts.length >= 4 ? parts.slice(3).join("~") : resourceId;
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

/** Look up which shop owns the given merchantId via SQLite JSON extract. */
async function findShopByMerchantId(merchantId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ shop: string }>>(
      `SELECT shop FROM "AdPlatformCredential" WHERE platform = 'google_merchant' AND json_extract(credentials, '$.merchantId') = ? LIMIT 1`,
      merchantId,
    );
    return rows[0]?.shop ?? null;
  } catch (e) {
    console.warn(
      `${LOG_PREFIX} findShopByMerchantId failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

interface ContentApiProductStatus {
  productId?: string;
  title?: string;
  destinationStatuses?: Array<{
    status?: string;
    approvedCountries?: string[];
    pendingCountries?: string[];
    disapprovedCountries?: string[];
  }>;
  itemLevelIssues?: Array<{
    code?: string;
    servability?: string;
    description?: string;
    detail?: string;
  }>;
  error?: { message?: string };
}

/**
 * Fetch a single product's status from Content API v2.1 and upsert into DB.
 * Throws on API or network errors so callers can fall back.
 */
async function refreshSingleProductStatus(params: {
  shop: string;
  merchantId: string;
  /** Tilde-separated, e.g. "online~en~US~sku123" */
  resourceId: string;
  accessToken: string;
}): Promise<void> {
  const url = `${GMC_CONTENT_API_BASE}/${encodeURIComponent(params.merchantId)}/productstatuses/${encodeURIComponent(params.resourceId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }

  const json = (await response.json().catch(() => ({}))) as ContentApiProductStatus;
  if (!response.ok) {
    throw new Error(json.error?.message ?? `HTTP ${response.status}`);
  }

  // productId in Content API response uses ":" separator
  const pidParts = (json.productId ?? "").split(":");
  const offerId = pidParts.length >= 4 ? pidParts.slice(3).join(":") : json.productId ?? "";
  if (!offerId) return;

  const destinations = json.destinationStatuses ?? [];
  const statuses: string[] = destinations.flatMap((d) => {
    const s = (d.status ?? "").toLowerCase();
    if (s === "disapproved" || s === "rejected") return ["disapproved"];
    if (s === "pending") return ["pending"];
    if (s === "approved") return ["approved"];
    if ((d.disapprovedCountries?.length ?? 0) > 0) return ["disapproved"];
    if ((d.pendingCountries?.length ?? 0) > 0) return ["pending"];
    if ((d.approvedCountries?.length ?? 0) > 0) return ["approved"];
    return [];
  });
  const rawIssues = json.itemLevelIssues ?? [];

  let status: "approved" | "disapproved" | "pending" | "expiring" | "unknown";
  if (statuses.includes("disapproved")) status = "disapproved";
  else if (statuses.includes("pending")) status = "pending";
  else if (statuses.includes("approved")) status = "approved";
  else if (rawIssues.some((i) => (i.servability ?? "").toLowerCase() === "disapproved")) status = "disapproved";
  else if (rawIssues.length > 0) status = "pending";
  else status = "unknown";

  const issues = rawIssues.map((i) => ({
    code: i.code ?? "unknown",
    servability: i.servability ?? "unknown",
    description: i.description ?? "",
    detail: i.detail,
  }));

  await prisma.gmcProductStatus.upsert({
    where: { shop_offerId: { shop: params.shop, offerId } },
    update: {
      merchantId: params.merchantId,
      title: json.title ?? null,
      status,
      issues: issues as unknown as object,
      checkedAt: new Date(),
    },
    create: {
      shop: params.shop,
      merchantId: params.merchantId,
      offerId,
      title: json.title ?? null,
      status,
      issues: issues as unknown as object,
      checkedAt: new Date(),
    },
  });
}

/**
 * Main entry point for incoming Google Merchant product status change notifications.
 * Resolves shop from merchantId, refreshes the product's status via Content API,
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
    if (offerId) {
      await prisma.gmcProductStatus
        .deleteMany({ where: { shop, offerId } })
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
    if (refreshed) accessToken = refreshed.accessToken;
  }

  const offerId = offerIdFromResourceId(notification.resourceId);

  // Primary: fetch full product detail from Content API (includes issues)
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
        where: { shop_offerId: { shop, offerId } },
        update: { merchantId, status, checkedAt: new Date() },
        create: {
          shop,
          merchantId,
          offerId,
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
