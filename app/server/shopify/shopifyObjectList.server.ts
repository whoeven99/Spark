import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { buildProductTitleSearchQuery } from "./productSearch.server";
import { logDetailedError } from "../productImprove/generateDescriptionLog.server";
import type {
  ShopifyObjectItem,
  ShopifyObjectKind,
  ShopifyObjectPageInfo,
  ShopifyObjectSort,
  ShopifyObjectStatusFilter,
} from "../../lib/shopifyObjectTypes";
import type { ObjectQuerySpec } from "../../lib/objectQuerySpec";

const LOG_PREFIX = "[ShopifyObjectList]";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const PRODUCT_LIST_QUERY = `#graphql
  query ShopifyProductList(
    $first: Int!
    $after: String
    $query: String
    $sortKey: ProductSortKeys!
    $reverse: Boolean!
  ) {
    products(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) {
      edges {
        node {
          id
          title
          status
          totalInventory
          updatedAt
          featuredImage {
            url
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    shop {
      name
      myshopifyDomain
    }
  }
`;

const ARTICLE_LIST_QUERY = `#graphql
  query ShopifyArticleList($first: Int!, $after: String, $query: String) {
    articles(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          isPublished
          updatedAt
          blog {
            title
          }
          author {
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    shop {
      name
      myshopifyDomain
    }
  }
`;

type ProductListResponse = {
  data?: {
    products?: {
      edges?: Array<{
        node?: {
          id?: string;
          title?: string | null;
          status?: string | null;
          totalInventory?: number | null;
          featuredImage?: { url?: string | null } | null;
          priceRangeV2?: {
            minVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
          } | null;
        };
      }>;
      pageInfo?: ShopifyObjectPageInfo;
    } | null;
    shop?: { name?: string | null; myshopifyDomain?: string | null } | null;
  };
  errors?: Array<{ message?: string }>;
};

type ArticleListResponse = {
  data?: {
    articles?: {
      edges?: Array<{
        node?: {
          id?: string;
          title?: string | null;
          isPublished?: boolean | null;
          blog?: { title?: string | null } | null;
          author?: { name?: string | null } | null;
        };
      }>;
      pageInfo?: ShopifyObjectPageInfo;
    } | null;
    shop?: { name?: string | null; myshopifyDomain?: string | null } | null;
  };
  errors?: Array<{ message?: string }>;
};

function clampPageSize(pageSize?: number): number {
  if (!pageSize || Number.isNaN(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(pageSize), 1), MAX_PAGE_SIZE);
}

function productStatusLabel(status: string | null | undefined): string {
  if (status === "ACTIVE") return "正常";
  if (status === "DRAFT") return "草稿";
  if (status === "ARCHIVED") return "已归档";
  return status?.toLowerCase() ?? "未知";
}

function productStatusTone(status: string | null | undefined): ShopifyObjectItem["statusTone"] {
  if (status === "ACTIVE") return "positive";
  if (status === "DRAFT") return "warning";
  return "neutral";
}

function escapeSearchTerm(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildProductListQuery(
  keyword: string,
  statusFilter: ShopifyObjectStatusFilter,
  tag?: string,
  maxInventory?: number,
): string | null {
  const parts: string[] = [];
  const titleQuery = buildProductTitleSearchQuery(keyword);
  if (titleQuery) parts.push(titleQuery);
  if (statusFilter === "active") parts.push("status:ACTIVE");
  if (statusFilter === "draft") parts.push("status:DRAFT");
  if (statusFilter === "archived") parts.push("status:ARCHIVED");
  if (tag?.trim()) parts.push(`tag:"${escapeSearchTerm(tag.trim())}"`);
  if (typeof maxInventory === "number" && Number.isFinite(maxInventory) && maxInventory >= 0) {
    parts.push(`inventory_total:<=${Math.floor(maxInventory)}`);
  }
  if (parts.length === 0) return null;
  return parts.join(" AND ");
}

function buildArticleListQuery(
  keyword: string,
  statusFilter: ShopifyObjectStatusFilter,
): string | null {
  const parts: string[] = [];
  const trimmed = keyword.trim();
  if (trimmed) {
    const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    parts.push(`title:*${escaped}*`);
  }
  if (statusFilter === "published") parts.push("published_status:published");
  if (statusFilter === "draft") parts.push("published_status:unpublished");
  if (parts.length === 0) return null;
  return parts.join(" AND ");
}

function resolveSort(sort: ShopifyObjectSort): {
  sortKey: "UPDATED_AT" | "TITLE";
  reverse: boolean;
} {
  if (sort === "title_asc") return { sortKey: "TITLE", reverse: false };
  return { sortKey: "UPDATED_AT", reverse: true };
}

async function runGraphql<T>(
  admin: ShopifyAdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const payload = (await response.json()) as T & { errors?: Array<{ message?: string }> };
  if (!response.ok) {
    throw new Error(`Shopify HTTP ${response.status}`);
  }
  const gqlErrors = payload.errors?.map((error) => error.message).filter(Boolean);
  if (gqlErrors?.length) {
    throw new Error(gqlErrors.join("；"));
  }
  return payload;
}

export async function listShopifyProducts(
  admin: ShopifyAdminGraphqlClient,
  params: {
    keyword?: string;
    statusFilter?: ShopifyObjectStatusFilter;
    sort?: ShopifyObjectSort;
    after?: string | null;
    first?: number;
    tag?: string;
    maxInventory?: number;
  },
): Promise<{ items: ShopifyObjectItem[]; pageInfo: ShopifyObjectPageInfo }> {
  const first = clampPageSize(params.first);
  const statusFilter = params.statusFilter ?? "all";
  const sort = resolveSort(params.sort ?? "updated_desc");
  const query = buildProductListQuery(
    params.keyword ?? "",
    statusFilter,
    params.tag,
    params.maxInventory,
  );

  try {
    const payload = await runGraphql<ProductListResponse>(admin, PRODUCT_LIST_QUERY, {
      first,
      after: params.after ?? null,
      query,
      sortKey: sort.sortKey,
      reverse: sort.reverse,
    });

    const shopName = payload.data?.shop?.name?.trim() || "Shop";
    const edges = payload.data?.products?.edges ?? [];
    const items: ShopifyObjectItem[] = [];

    for (const edge of edges) {
      const node = edge?.node;
      const id = node?.id?.trim();
      if (!id) continue;
      const status = node?.status ?? null;
      const price = node?.priceRangeV2?.minVariantPrice;
      const amount = price?.amount?.trim();
      const currency = price?.currencyCode?.trim() ?? "";
      const priceText = amount ? `${amount} ${currency}`.trim() : "价格未知";
      const inventory = node?.totalInventory ?? 0;
      items.push({
        id,
        title: (node?.title ?? "").trim() || "未命名商品",
        subtitle: `${shopName} / ${status?.toLowerCase() ?? "unknown"}`,
        meta: `${priceText} · 库存 ${inventory}`,
        imageUrl: node?.featuredImage?.url?.trim() || null,
        statusLabel: productStatusLabel(status),
        statusTone: productStatusTone(status),
      });
    }

    return {
      items,
      pageInfo: payload.data?.products?.pageInfo ?? { hasNextPage: false, endCursor: null },
    };
  } catch (error) {
    logDetailedError(LOG_PREFIX, "listShopifyProducts failed", error);
    throw error instanceof Error ? error : new Error("商品列表加载失败");
  }
}

export async function listShopifyArticles(
  admin: ShopifyAdminGraphqlClient,
  params: {
    keyword?: string;
    statusFilter?: ShopifyObjectStatusFilter;
    after?: string | null;
    first?: number;
  },
): Promise<{ items: ShopifyObjectItem[]; pageInfo: ShopifyObjectPageInfo }> {
  const first = clampPageSize(params.first);
  const statusFilter = params.statusFilter ?? "all";
  const query = buildArticleListQuery(params.keyword ?? "", statusFilter);

  try {
    const payload = await runGraphql<ArticleListResponse>(admin, ARTICLE_LIST_QUERY, {
      first,
      after: params.after ?? null,
      query,
    });

    const edges = payload.data?.articles?.edges ?? [];
    const items: ShopifyObjectItem[] = [];

    for (const edge of edges) {
      const node = edge?.node;
      const id = node?.id?.trim();
      if (!id) continue;
      const blogTitle = (node?.blog?.title ?? "").trim() || "Blog";
      const author = (node?.author?.name ?? "").trim() || "未知作者";
      const published = node?.isPublished === true;
      items.push({
        id,
        title: (node?.title ?? "").trim() || "未命名文章",
        subtitle: `${blogTitle} / ${author} / ${published ? "已发布" : "草稿"}`,
        meta: published ? "已发布" : "暂无更多信息",
        imageUrl: null,
        statusLabel: published ? "已发布" : "待处理",
        statusTone: published ? "positive" : "warning",
      });
    }

    return {
      items,
      pageInfo: payload.data?.articles?.pageInfo ?? { hasNextPage: false, endCursor: null },
    };
  } catch (error) {
    logDetailedError(LOG_PREFIX, "listShopifyArticles failed", error);
    throw error instanceof Error ? error : new Error("文章列表加载失败");
  }
}

export async function listShopifyObjects(
  admin: ShopifyAdminGraphqlClient,
  kind: ShopifyObjectKind,
  params: {
    keyword?: string;
    statusFilter?: ShopifyObjectStatusFilter;
    sort?: ShopifyObjectSort;
    after?: string | null;
    first?: number;
    tag?: string;
    maxInventory?: number;
  },
): Promise<{ items: ShopifyObjectItem[]; pageInfo: ShopifyObjectPageInfo }> {
  if (kind === "product") return listShopifyProducts(admin, params);
  return listShopifyArticles(admin, params);
}

// ─── 按条件计数 / 执行期求值（阶段 2：query 形态对象选择） ─────────────────────

const PRODUCT_COUNT_QUERY = `#graphql
  query ShopifyProductCount($query: String) {
    productsCount(query: $query) {
      count
    }
  }
`;

const ARTICLE_COUNT_QUERY = `#graphql
  query ShopifyArticleCount($query: String) {
    articlesCount(query: $query) {
      count
    }
  }
`;

type CountResponse = {
  data?: {
    productsCount?: { count?: number | null } | null;
    articlesCount?: { count?: number | null } | null;
  };
};

function specToListParams(spec: ObjectQuerySpec): {
  keyword?: string;
  statusFilter: ShopifyObjectStatusFilter;
  tag?: string;
  maxInventory?: number;
} {
  return {
    keyword: spec.keyword,
    statusFilter: spec.status ?? "all",
    ...(spec.kind === "product" ? { tag: spec.tag, maxInventory: spec.maxInventory } : {}),
  };
}

/** 按条件统计匹配数。计数失败不阻塞（返回 null，由调用方降级展示）。 */
export async function countShopifyObjects(
  admin: ShopifyAdminGraphqlClient,
  spec: ObjectQuerySpec,
): Promise<number | null> {
  const query =
    spec.kind === "product"
      ? buildProductListQuery(spec.keyword ?? "", spec.status ?? "all", spec.tag, spec.maxInventory)
      : buildArticleListQuery(spec.keyword ?? "", spec.status ?? "all");
  try {
    const payload = await runGraphql<CountResponse>(
      admin,
      spec.kind === "product" ? PRODUCT_COUNT_QUERY : ARTICLE_COUNT_QUERY,
      { query },
    );
    const count =
      spec.kind === "product"
        ? payload.data?.productsCount?.count
        : payload.data?.articlesCount?.count;
    return typeof count === "number" && count >= 0 ? count : null;
  } catch (error) {
    logDetailedError(LOG_PREFIX, "countShopifyObjects failed", error);
    return null;
  }
}

export type ResolvedQueryTarget = {
  id: string;
  title: string;
  imageUrl: string | null;
};

/**
 * 执行期按条件求值为具体对象列表（TaskProposal execute / Playbook 定时执行用）。
 * 最多取 maxTargets 个；overflow 表示实际匹配数超过上限（取了 maxTargets+1 探测）。
 */
export async function resolveObjectQueryTargets(
  admin: ShopifyAdminGraphqlClient,
  spec: ObjectQuerySpec,
  maxTargets: number,
): Promise<{ targets: ResolvedQueryTarget[]; overflow: boolean }> {
  const listParams = specToListParams(spec);
  const collected: ResolvedQueryTarget[] = [];
  let after: string | null = null;
  let overflow = false;

  while (collected.length <= maxTargets) {
    const pageSize = Math.min(MAX_PAGE_SIZE, maxTargets + 1 - collected.length);
    const { items, pageInfo } = await listShopifyObjects(admin, spec.kind, {
      ...listParams,
      after,
      first: pageSize,
    });
    for (const item of items) {
      collected.push({ id: item.id, title: item.title, imageUrl: item.imageUrl });
    }
    if (!pageInfo.hasNextPage || !pageInfo.endCursor || items.length === 0) break;
    after = pageInfo.endCursor;
  }

  if (collected.length > maxTargets) {
    overflow = true;
    collected.length = maxTargets;
  }
  return { targets: collected, overflow };
}
