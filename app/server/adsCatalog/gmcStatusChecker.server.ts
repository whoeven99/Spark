import prisma from "../../db.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  getGoogleMerchantCredential,
  setGoogleMerchantCredential,
} from "./credentialStore.server";
import { refreshGoogleAccessToken } from "./clients/googleMerchantClient.server";

const GMC_BASE = "https://shoppingcontent.googleapis.com/content/v2.1";
const LOG_PREFIX = "[AdsCatalog][GmcStatus]";

export interface GmcProductReview {
  offerId: string;
  title: string | null;
  status: "approved" | "disapproved" | "pending" | "expiring" | "unknown";
  issues: Array<{ code: string; servability: string; description: string; detail?: string }>;
}

export interface GmcCheckResult {
  checked: number;
  approved: number;
  disapproved: number;
  pending: number;
  accountSuspended: boolean;
  products: GmcProductReview[];
}

interface ProductStatusResource {
  productId?: string;
  title?: string;
  destinationStatuses?: Array<{ destination?: string; status?: string }>;
  itemLevelIssues?: Array<{
    code?: string;
    servability?: string;
    description?: string;
    detail?: string;
  }>;
}

function deriveOfferId(productId: string | undefined): string {
  // productId format: "online:en:US:<offerId>"
  if (!productId) return "";
  const parts = productId.split(":");
  return parts.length >= 4 ? parts.slice(3).join(":") : productId;
}

function normalizeStatus(resource: ProductStatusResource): GmcProductReview["status"] {
  const statuses = (resource.destinationStatuses ?? []).map((d) =>
    (d.status ?? "").toLowerCase(),
  );
  if (statuses.includes("disapproved")) return "disapproved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("expiring")) return "expiring";
  if (statuses.some((s) => s === "approved")) return "approved";
  return "unknown";
}

async function fetchProductStatuses(params: {
  accessToken: string;
  merchantId: string;
}): Promise<GmcProductReview[]> {
  const out: GmcProductReview[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(
      `${GMC_BASE}/${encodeURIComponent(params.merchantId)}/productstatuses`,
    );
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    const json = (await response.json().catch(() => ({}))) as {
      resources?: ProductStatusResource[];
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    for (const resource of json.resources ?? []) {
      out.push({
        offerId: deriveOfferId(resource.productId),
        title: resource.title ?? null,
        status: normalizeStatus(resource),
        issues: (resource.itemLevelIssues ?? []).map((i) => ({
          code: i.code ?? "unknown",
          servability: i.servability ?? "unknown",
          description: i.description ?? "",
          detail: i.detail,
        })),
      });
    }
    pageToken = json.nextPageToken;
    if (out.length >= 250) break;
  } while (pageToken);
  return out;
}

async function fetchAccountSuspended(params: {
  accessToken: string;
  merchantId: string;
}): Promise<boolean> {
  try {
    const response = await fetch(
      `${GMC_BASE}/${encodeURIComponent(params.merchantId)}/accountstatuses/${encodeURIComponent(
        params.merchantId,
      )}`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    if (!response.ok) return false;
    const json = (await response.json().catch(() => ({}))) as {
      accountLevelIssues?: Array<{ id?: string; severity?: string }>;
    };
    return (json.accountLevelIssues ?? []).some(
      (i) =>
        i.severity === "critical" ||
        (i.id ?? "").toLowerCase().includes("suspend") ||
        (i.id ?? "").toLowerCase().includes("disapprov"),
    );
  } catch {
    return false;
  }
}

async function persistStatuses(params: {
  shop: string;
  merchantId: string;
  reviews: GmcProductReview[];
}): Promise<void> {
  const checkedAt = new Date();
  for (const review of params.reviews) {
    if (!review.offerId) continue;
    await prisma.gmcProductStatus.upsert({
      where: { shop_offerId: { shop: params.shop, offerId: review.offerId } },
      update: {
        merchantId: params.merchantId,
        title: review.title,
        status: review.status,
        issues: review.issues as unknown as object,
        checkedAt,
      },
      create: {
        shop: params.shop,
        merchantId: params.merchantId,
        offerId: review.offerId,
        title: review.title,
        status: review.status,
        issues: review.issues as unknown as object,
        checkedAt,
      },
    });
  }
}

/**
 * Pull GMC product review statuses, persist them, and summarize. Throws on
 * hard API failures so callers can surface/log the reason.
 */
export async function checkGmcProductStatuses(params: {
  shop: string;
  merchantId: string;
  accessToken: string;
}): Promise<GmcCheckResult> {
  let reviews: GmcProductReview[];
  try {
    reviews = await fetchProductStatuses(params);
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
  const accountSuspended = await fetchAccountSuspended(params);
  await persistStatuses({ shop: params.shop, merchantId: params.merchantId, reviews });

  return {
    checked: reviews.length,
    approved: reviews.filter((r) => r.status === "approved").length,
    disapproved: reviews.filter((r) => r.status === "disapproved").length,
    pending: reviews.filter((r) => r.status === "pending").length,
    accountSuspended,
    products: reviews,
  };
}

/**
 * Resolve a fresh access token from the stored credential (refreshing if
 * possible), then run the status check. Returns null when no credential.
 */
export async function checkGmcProductStatusesForShop(
  shop: string,
): Promise<GmcCheckResult | null> {
  let credential = await getGoogleMerchantCredential(shop);
  if (!credential) return null;

  if (credential.refreshToken && credential.clientId && credential.clientSecret) {
    const refreshed = await refreshGoogleAccessToken({
      clientId: credential.clientId,
      clientSecret: credential.clientSecret,
      refreshToken: credential.refreshToken,
    });
    if (refreshed) {
      await setGoogleMerchantCredential(shop, {
        accessToken: refreshed.accessToken,
        refreshToken: credential.refreshToken,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
        merchantId: credential.merchantId,
      });
      credential = { ...credential, accessToken: refreshed.accessToken };
    }
  }

  return checkGmcProductStatuses({
    shop,
    merchantId: credential.merchantId,
    accessToken: credential.accessToken,
  });
}

/**
 * Schedule a delayed GMC status check (in-process setTimeout). Best-effort:
 * lost on process restart, which is acceptable for this phase. The daily cron
 * (phase 3) provides the durable backstop.
 */
export function scheduleGmcStatusCheck(params: { shop: string; delayMs: number }): void {
  const timer = setTimeout(() => {
    void checkGmcProductStatusesForShop(params.shop).catch((e) => {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`${LOG_PREFIX} delayed check failed shop=${params.shop} ${detail}`);
    });
  }, params.delayMs);
  // Don't keep the event loop alive solely for this timer.
  if (typeof timer.unref === "function") timer.unref();
}
