import prisma from "../../db.server";
import { formatOutboundNetworkError } from "../common/outboundError.server";
import { META_GRAPH_BASE } from "./metaOAuth.server";
import { getFacebookCatalogCredential } from "./credentialStore.server";

const LOG_PREFIX = "[AdsCatalog][MetaStatus]";

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
  errors?: Array<{ message?: string; type?: string; severity?: string }>;
}

function normalizeStatus(raw: string | undefined): MetaProductReview["status"] {
  switch ((raw ?? "").toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
      return "disapproved";
    case "pending":
      return "pending";
    case "outdated":
      return "expiring";
    default:
      return "unknown";
  }
}

async function fetchCatalogProducts(params: {
  accessToken: string;
  catalogId: string;
}): Promise<MetaProductReview[]> {
  const out: MetaProductReview[] = [];
  let nextUrl: string | null = (() => {
    const url = new URL(`${META_GRAPH_BASE}/${encodeURIComponent(params.catalogId)}/products`);
    url.searchParams.set("fields", "id,retailer_id,name,review_status,errors");
    url.searchParams.set("limit", "200");
    url.searchParams.set("access_token", params.accessToken);
    return url.toString();
  })();

  while (nextUrl) {
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
        status: normalizeStatus(item.review_status),
        issues: (item.errors ?? []).map((e) => ({
          code: e.type ?? "unknown",
          servability: e.severity ?? "unknown",
          description: e.message ?? "",
        })),
      });
    }
    nextUrl = json.paging?.next ?? null;
    if (out.length >= 250) break;
  }
  return out;
}

async function persistStatuses(params: {
  shop: string;
  catalogId: string;
  reviews: MetaProductReview[];
}): Promise<void> {
  const checkedAt = new Date();
  for (const review of params.reviews) {
    if (!review.offerId) continue;
    await prisma.metaProductStatus.upsert({
      where: { shop_retailerId: { shop: params.shop, retailerId: review.offerId } },
      update: {
        catalogId: params.catalogId,
        title: review.title,
        status: review.status,
        issues: review.issues as unknown as object,
        checkedAt,
      },
      create: {
        shop: params.shop,
        catalogId: params.catalogId,
        retailerId: review.offerId,
        title: review.title,
        status: review.status,
        issues: review.issues as unknown as object,
        checkedAt,
      },
    });
  }
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
