import prisma from "../../db.server";
import type { Prisma } from "../../generated/prisma";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import { META_GRAPH_BASE } from "./metaOAuth.server";
import { getFacebookCatalogCredential } from "./credentialStore.server";

const LOG_PREFIX = "[AdsCatalog][MetaStatus]";

/** 每页 200 条，够 2 万商品；仅作分页异常时的兜底上限。 */
const MAX_PRODUCT_PAGES = 100;

export interface MetaProductReview {
  /** retailer_id（= Shopify product/variant id 写入 catalog 的 id）。 */
  offerId: string;
  title: string | null;
  status: "approved" | "disapproved" | "pending" | "expiring" | "unknown";
  issues: Array<{ code: string; servability: string; description: string }>;
}

export interface MetaCheckResult {
  checked: number;
  approved: number;
  disapproved: number;
  pending: number;
  accountRestricted: boolean;
  products: MetaProductReview[];
}

interface MetaProductItem {
  id?: string;
  retailer_id?: string;
  name?: string;
  review_status?: string;
  capability_to_review_status?: unknown;
  review_rejection_reasons?: unknown;
  errors?: Array<{ message?: string; type?: string; severity?: string }>;
}

/** Map a single Meta review token to our normalized status. */
export function normalizeMetaReviewToken(
  raw: string | undefined,
): MetaProductReview["status"] | null {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
      return "disapproved";
    case "pending":
      return "pending";
    case "outdated":
      return "expiring";
    case "no_review":
      return "pending";
    default:
      return null;
  }
}

/** Flatten Meta capability_to_review_status into raw status tokens. */
export function collectCapabilityReviewStatuses(raw: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push(entry);
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.value === "string") {
      out.push(record.value);
      continue;
    }
    if (typeof record.status === "string") {
      out.push(record.status);
      continue;
    }
    for (const val of Object.values(record)) {
      if (typeof val === "string") out.push(val);
    }
  }
  return out;
}

/**
 * Meta list API often omits legacy review_status; capability_to_review_status
 * and review_rejection_reasons are the reliable sources.
 */
export function deriveMetaProductReviewStatus(item: {
  review_status?: string;
  capability_to_review_status?: unknown;
  review_rejection_reasons?: unknown;
  errors?: Array<{ message?: string; type?: string; severity?: string }>;
}): MetaProductReview["status"] {
  const fromReview = normalizeMetaReviewToken(item.review_status);
  if (fromReview) return fromReview;

  const capabilityStatuses = collectCapabilityReviewStatuses(
    item.capability_to_review_status,
  ).map((s) => s.toUpperCase());
  if (capabilityStatuses.includes("REJECTED")) return "disapproved";
  if (capabilityStatuses.includes("PENDING")) return "pending";
  if (capabilityStatuses.includes("NO_REVIEW")) return "pending";
  if (capabilityStatuses.includes("OUTDATED")) return "expiring";
  if (capabilityStatuses.includes("APPROVED")) return "approved";

  const rejectionReasons = Array.isArray(item.review_rejection_reasons)
    ? item.review_rejection_reasons.filter(
        (r): r is string => typeof r === "string" && r.trim().length > 0,
      )
    : [];
  if (rejectionReasons.length > 0) return "disapproved";

  if ((item.errors ?? []).length > 0) return "pending";

  return "unknown";
}

function collectMetaIssues(item: MetaProductItem): MetaProductReview["issues"] {
  const issues: MetaProductReview["issues"] = [];
  for (const e of item.errors ?? []) {
    issues.push({
      code: e.type ?? "unknown",
      servability: e.severity ?? "unknown",
      description: e.message ?? "",
    });
  }
  if (Array.isArray(item.review_rejection_reasons)) {
    for (const reason of item.review_rejection_reasons) {
      if (typeof reason !== "string" || !reason.trim()) continue;
      issues.push({
        code: "rejection_reason",
        servability: "disapproved",
        description: reason,
      });
    }
  }
  return issues;
}

async function fetchCatalogProducts(params: {
  accessToken: string;
  catalogId: string;
}): Promise<MetaProductReview[]> {
  const out: MetaProductReview[] = [];
  let nextUrl: string | null = (() => {
    const url = new URL(`${META_GRAPH_BASE}/${encodeURIComponent(params.catalogId)}/products`);
    url.searchParams.set(
      "fields",
      "id,retailer_id,name,review_status,capability_to_review_status,review_rejection_reasons,errors",
    );
    url.searchParams.set("limit", "200");
    url.searchParams.set("access_token", params.accessToken);
    return url.toString();
  })();

  // 翻完所有分页：审核状态是全量重建的依据，截断会把没拉到的商品当成已下架。
  // MAX_PAGES 只是防止分页异常时无限循环。
  let pages = 0;
  while (nextUrl && pages < MAX_PRODUCT_PAGES) {
    pages += 1;
    const response: Response = await fetch(nextUrl);
    const json = (await response.json().catch(() => ({}))) as {
      data?: MetaProductItem[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(json.error?.message || `HTTP ${response.status}`);
    }
    for (const item of json.data ?? []) {
      const offerId = item.retailer_id || item.id || "";
      out.push({
        offerId,
        title: item.name ?? null,
        status: deriveMetaProductReviewStatus(item),
        issues: collectMetaIssues(item),
      });
    }
    nextUrl = json.paging?.next ?? null;
  }
  if (nextUrl) {
    console.warn(
      `${LOG_PREFIX} product pagination stopped at ${MAX_PRODUCT_PAGES} pages, products=${out.length}`,
    );
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 全量重建该店铺的审核状态。
 *
 * 一次拉取就是 catalog 侧的完整状态，所以删掉重写既能同步已移除商品，
 * 又避免逐条 upsert 打出上千次 Turso 往返。
 */
async function persistStatuses(params: {
  shop: string;
  catalogId: string;
  reviews: MetaProductReview[];
}): Promise<void> {
  const checkedAt = new Date();
  // createMany 撞唯一键会整笔失败，先按 retailerId 去重（后者覆盖，与原 upsert 一致）。
  const byRetailerId = new Map<string, Prisma.MetaProductStatusCreateManyInput>();
  for (const review of params.reviews) {
    if (!review.offerId) continue;
    byRetailerId.set(review.offerId, {
      shop: params.shop,
      catalogId: params.catalogId,
      retailerId: review.offerId,
      title: review.title,
      status: review.status,
      issues: review.issues as unknown as object,
      checkedAt,
    });
  }
  const rows = [...byRetailerId.values()];

  await prisma.$transaction([
    prisma.metaProductStatus.deleteMany({ where: { shop: params.shop } }),
    ...chunk(rows, 200).map((batch) =>
      prisma.metaProductStatus.createMany({ data: batch }),
    ),
  ]);
}

/**
 * Pull Meta catalog product review statuses, persist them, and summarize.
 * Throws on hard API failures so callers can surface/log the reason.
 */
export async function checkMetaCatalogStatuses(params: {
  shop: string;
  catalogId: string;
  accessToken: string;
}): Promise<MetaCheckResult> {
  let reviews: MetaProductReview[];
  try {
    reviews = await fetchCatalogProducts(params);
  } catch (e) {
    throw new Error(formatOutboundNetworkError(e));
  }
  await persistStatuses({ shop: params.shop, catalogId: params.catalogId, reviews });

  const checked = reviews.length;
  const disapproved = reviews.filter((r) => r.status === "disapproved").length;
  return {
    checked,
    approved: reviews.filter((r) => r.status === "approved").length,
    disapproved,
    pending: reviews.filter((r) => r.status === "pending").length,
    // 全部商品被拒强烈暗示 catalog / 商务账户级被限制（后置封禁）。
    accountRestricted: checked > 0 && disapproved === checked,
    products: reviews,
  };
}

/**
 * Resolve the stored Meta catalog credential, then run the status check.
 * Returns null when no credential is connected.
 */
export async function checkMetaCatalogStatusesForShop(
  shop: string,
): Promise<MetaCheckResult | null> {
  const credential = await getFacebookCatalogCredential(shop);
  if (!credential) return null;
  return checkMetaCatalogStatuses({
    shop,
    catalogId: credential.catalogId,
    accessToken: credential.accessToken,
  });
}

/**
 * Schedule a delayed Meta catalog status check (in-process setTimeout).
 * Best-effort: lost on process restart, which is acceptable for this phase.
 */
export function scheduleMetaCatalogStatusCheck(params: { shop: string; delayMs: number }): void {
  const timer = setTimeout(() => {
    void checkMetaCatalogStatusesForShop(params.shop).catch((e) => {
      const detail = e instanceof Error ? e.message : String(e);
      console.error(`${LOG_PREFIX} delayed check failed shop=${params.shop} ${detail}`);
    });
  }, params.delayMs);
  if (typeof timer.unref === "function") timer.unref();
}
