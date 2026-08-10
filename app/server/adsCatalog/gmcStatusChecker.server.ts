import prisma from "../../db.server";
import type { Prisma } from "../../generated/prisma";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import {
  listGoogleMerchantAccountIssues,
  listGoogleMerchantProducts,
  refreshGoogleAccessToken,
  type GoogleMerchantProductResource,
} from "./clients/googleMerchantClient.server";
import {
  getGoogleMerchantCredential,
  setGoogleMerchantCredential,
} from "./credentialStore.server";

const LOG_PREFIX = "[AdsCatalog][GmcStatus]";

export interface GmcProductReview {
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
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

interface ProductStatusDestination {
  destination?: string;
  reportingContext?: string;
  approvedCountries?: string[];
  pendingCountries?: string[];
  disapprovedCountries?: string[];
}

export function normalizeDestinationReviewStatus(
  destination: ProductStatusDestination,
): GmcProductReview["status"] | null {
  if ((destination.disapprovedCountries?.length ?? 0) > 0) return "disapproved";
  if ((destination.pendingCountries?.length ?? 0) > 0) return "pending";
  if ((destination.approvedCountries?.length ?? 0) > 0) return "approved";
  return null;
}

function normalizeStatus(resource: GoogleMerchantProductResource): GmcProductReview["status"] {
  const statuses = (resource.productStatus?.destinationStatuses ?? [])
    .map(normalizeDestinationReviewStatus)
    .filter((s): s is GmcProductReview["status"] => s != null);
  if (statuses.includes("disapproved")) return "disapproved";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("approved")) return "approved";

  const issues = resource.productStatus?.itemLevelIssues ?? [];
  if (issues.some((issue) => issue.severity === "DISAPPROVED")) {
    return "disapproved";
  }
  if (issues.length > 0) return "pending";
  return "unknown";
}

async function fetchProductStatuses(params: {
  accessToken: string;
  merchantId: string;
}): Promise<GmcProductReview[]> {
  // 不设总量上限：审核状态是全量重建的依据，截断会把没拉到的商品当成已下架。
  const resources = await listGoogleMerchantProducts({ ...params, pageSize: 250 });
  return resources.map((resource) => ({
    offerId: resource.offerId ?? "",
    contentLanguage: resource.contentLanguage?.toLowerCase() || "und",
    feedLabel: resource.feedLabel?.toUpperCase() || "ZZ",
    title: resource.productAttributes?.title ?? null,
    status: normalizeStatus(resource),
    issues: (resource.productStatus?.itemLevelIssues ?? []).map((issue) => ({
      code: issue.code ?? "unknown",
      servability: issue.severity?.toLowerCase() ?? "unknown",
      description: issue.description ?? "",
      detail: issue.detail,
    })),
  }));
}

async function fetchAccountSuspended(params: {
  accessToken: string;
  merchantId: string;
}): Promise<boolean> {
  try {
    const issues = await listGoogleMerchantAccountIssues(params);
    return issues.some((issue) => issue.severity === "CRITICAL");
  } catch {
    return false;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 全量重建该店铺的审核状态。
 *
 * 一次拉取就是 GMC 侧的完整状态，所以删掉重写既能同步下架商品，
 * 又避免逐条 upsert 打出上千次 Turso 往返。
 */
async function persistStatuses(params: {
  shop: string;
  merchantId: string;
  reviews: GmcProductReview[];
}): Promise<void> {
  const checkedAt = new Date();
  // 同一 offerId 可能跨 channel 重复出现，唯一键却只到 feedLabel；
  // createMany 撞唯一键会整笔失败，所以先按唯一键去重（后者覆盖，与原 upsert 一致）。
  const byUniqueKey = new Map<string, Prisma.GmcProductStatusCreateManyInput>();
  for (const review of params.reviews) {
    if (!review.offerId) continue;
    byUniqueKey.set(`${review.offerId}|${review.contentLanguage}|${review.feedLabel}`, {
      shop: params.shop,
      merchantId: params.merchantId,
      offerId: review.offerId,
      contentLanguage: review.contentLanguage,
      feedLabel: review.feedLabel,
      title: review.title,
      status: review.status,
      issues: review.issues as unknown as object,
      checkedAt,
    });
  }
  const rows = [...byUniqueKey.values()];

  await prisma.$transaction([
    prisma.gmcProductStatus.deleteMany({ where: { shop: params.shop } }),
    ...chunk(rows, 200).map((batch) =>
      prisma.gmcProductStatus.createMany({ data: batch }),
    ),
  ]);
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
