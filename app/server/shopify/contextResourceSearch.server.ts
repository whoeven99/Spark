import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type {
  ArticleResourceItem,
  ContextResourceItem,
  ContextResourcePageInfo,
  ContextResourceSortDirection,
  ContextResourceType,
  OrderResourceItem,
  ProductResourceItem,
} from "../../lib/contextResourceTypes";
import { logDetailedError } from "../productImprove/generateDescriptionLog.server";

const LOG_PREFIX = "[ContextResourceSearch]";

type SearchParams = {
  query?: string;
  filter?: string;
  sort?: string;
  direction?: ContextResourceSortDirection;
  cursor?: string;
  limit?: number;
};

type SearchResult = {
  items: ContextResourceItem[];
  pageInfo: ContextResourcePageInfo;
};

const PRODUCT_QUERY = `#graphql
  query ContextProducts(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) {
    products(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          status
          vendor
          productType
          tags
          totalInventory
          featuredImage {
            url
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const ARTICLE_QUERY = `#graphql
  query ContextArticles(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $sortKey: ArticleSortKeys
    $reverse: Boolean
  ) {
    articles(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          isPublished
          publishedAt
          updatedAt
          tags
          summary
          author {
            name
          }
          blog {
            title
          }
          image {
            url
          }
        }
      }
    }
  }
`;

const ORDER_QUERY = `#graphql
  query ContextOrders(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $sortKey: OrderSortKeys
    $reverse: Boolean
  ) {
    orders(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          tags
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const CURRENT_APP_SCOPES_QUERY = `#graphql
  query CurrentAppScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

export async function searchContextResources(
  admin: ShopifyAdminGraphqlClient,
  type: ContextResourceType,
  params: SearchParams,
): Promise<SearchResult> {
  try {
    if (type === "product") {
      return searchProducts(admin, params);
    }
    if (type === "article") {
      return searchArticles(admin, params);
    }
    return searchOrders(admin, params);
  } catch (error) {
    logDetailedError(LOG_PREFIX, `search ${type} failed`, error);
    throw error instanceof Error ? error : new Error("资源查询失败");
  }
}

async function searchProducts(
  admin: ShopifyAdminGraphqlClient,
  params: SearchParams,
): Promise<SearchResult> {
  const variables = buildConnectionVariables({
    query: buildProductSearchQuery(params.query, params.filter),
    sortKey: mapProductSort(params.sort),
    direction: params.direction,
    cursor: params.cursor,
    limit: params.limit,
  });
  const response = await admin.graphql(PRODUCT_QUERY, { variables });
  const payload = (await response.json()) as {
    data?: {
      products?: {
        pageInfo?: Partial<ContextResourcePageInfo>;
        edges?: Array<{
          node?: {
            id?: string;
            title?: string | null;
            handle?: string | null;
            status?: string | null;
            vendor?: string | null;
            productType?: string | null;
            tags?: string[] | null;
            totalInventory?: number | null;
            featuredImage?: { url?: string | null } | null;
            priceRangeV2?: {
              minVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
              maxVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
            } | null;
          };
        }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  ensureGraphqlOk(response.ok, response.status, payload.errors);

  const items: ProductResourceItem[] = (payload.data?.products?.edges ?? [])
    .map((edge) => {
      const node = edge?.node;
      const id = node?.id?.trim();
      if (!id) return null;
      const title = node?.title?.trim() || "未命名商品";
      const status = node?.status?.trim() || null;
      const vendor = node?.vendor?.trim() || null;
      const productType = node?.productType?.trim() || null;
      const inventory = typeof node?.totalInventory === "number" ? node.totalInventory : null;
      const priceRange = formatPriceRange(
        node?.priceRangeV2?.minVariantPrice?.amount ?? null,
        node?.priceRangeV2?.maxVariantPrice?.amount ?? null,
        node?.priceRangeV2?.minVariantPrice?.currencyCode ?? node?.priceRangeV2?.maxVariantPrice?.currencyCode ?? null,
      );
      return {
        id,
        type: "product",
        title,
        subtitle: [vendor, productType, statusLabel(status)].filter(Boolean).join(" / ") || "Shopify 商品",
        meta: [priceRange, inventory === null ? null : `库存 ${inventory}`].filter(Boolean).join(" · ") || "暂无更多信息",
        status,
        imageUrl: node?.featuredImage?.url?.trim() || null,
        promptSummary: {
          id,
          title,
          handle: node?.handle?.trim() || null,
          status,
          vendor,
          productType,
          tags: (node?.tags ?? []).filter(Boolean),
          featuredImageUrl: node?.featuredImage?.url?.trim() || null,
          priceRange,
          totalInventory: inventory,
        },
      };
    })
    .filter((item): item is ProductResourceItem => item !== null);

  return {
    items,
    pageInfo: coercePageInfo(payload.data?.products?.pageInfo),
  };
}

async function searchArticles(
  admin: ShopifyAdminGraphqlClient,
  params: SearchParams,
): Promise<SearchResult> {
  const variables = buildConnectionVariables({
    query: buildArticleSearchQuery(params.query, params.filter),
    sortKey: mapArticleSort(params.sort),
    direction: params.direction,
    cursor: params.cursor,
    limit: params.limit,
  });
  const response = await admin.graphql(ARTICLE_QUERY, { variables });
  const payload = (await response.json()) as {
    data?: {
      articles?: {
        pageInfo?: Partial<ContextResourcePageInfo>;
        edges?: Array<{
          node?: {
            id?: string;
            title?: string | null;
            handle?: string | null;
            isPublished?: boolean | null;
            publishedAt?: string | null;
            updatedAt?: string | null;
            tags?: string[] | null;
            summary?: string | null;
            author?: { name?: string | null } | null;
            blog?: { title?: string | null } | null;
            image?: { url?: string | null } | null;
          };
        }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  ensureGraphqlOk(response.ok, response.status, payload.errors);

  const items: ArticleResourceItem[] = (payload.data?.articles?.edges ?? [])
    .map((edge) => {
      const node = edge?.node;
      const id = node?.id?.trim();
      if (!id) return null;
      const title = node?.title?.trim() || "未命名文章";
      const isPublished = typeof node?.isPublished === "boolean" ? node.isPublished : null;
      const blogTitle = node?.blog?.title?.trim() || null;
      const author = node?.author?.name?.trim() || null;
      const publishedAt = node?.publishedAt?.trim() || null;
      const excerpt = clipText(stripHtml(node?.summary ?? null), 220);
      return {
        id,
        type: "article",
        title,
        subtitle: [blogTitle, author, isPublished === null ? null : isPublished ? "已发布" : "草稿"].filter(Boolean).join(" / ") || "Shopify 文章",
        meta: [publishedAt ? `发布时间 ${formatDate(publishedAt)}` : null, excerpt].filter(Boolean).join(" · ") || "暂无更多信息",
        status: isPublished === null ? null : isPublished ? "published" : "draft",
        imageUrl: node?.image?.url?.trim() || null,
        promptSummary: {
          id,
          title,
          handle: node?.handle?.trim() || null,
          blogTitle,
          author,
          isPublished,
          publishedAt,
          tags: (node?.tags ?? []).filter(Boolean),
          excerpt,
        },
      };
    })
    .filter((item): item is ArticleResourceItem => item !== null);

  return {
    items,
    pageInfo: coercePageInfo(payload.data?.articles?.pageInfo),
  };
}

async function searchOrders(
  admin: ShopifyAdminGraphqlClient,
  params: SearchParams,
): Promise<SearchResult> {
  const variables = buildConnectionVariables({
    query: buildOrderSearchQuery(params.query, params.filter),
    sortKey: mapOrderSort(params.sort),
    direction: params.direction,
    cursor: params.cursor,
    limit: params.limit,
  });
  let payload: {
    data?: {
      orders?: {
        pageInfo?: Partial<ContextResourcePageInfo>;
        edges?: Array<{
          node?: {
            id?: string;
            name?: string | null;
            createdAt?: string | null;
            displayFinancialStatus?: string | null;
            displayFulfillmentStatus?: string | null;
            tags?: string[] | null;
            totalPriceSet?: {
              shopMoney?: { amount?: string | null; currencyCode?: string | null } | null;
            } | null;
          };
        }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  try {
    const response = await admin.graphql(ORDER_QUERY, { variables });
    payload = (await response.json()) as typeof payload;
    ensureGraphqlOk(response.ok, response.status, payload.errors);
  } catch (error) {
    throw new Error(await decorateOrderSearchError(admin, error));
  }

  const items: OrderResourceItem[] = (payload.data?.orders?.edges ?? [])
    .map((edge) => {
      const node = edge?.node;
      const id = node?.id?.trim();
      if (!id) return null;
      const name = node?.name?.trim() || "未命名订单";
      const amount = node?.totalPriceSet?.shopMoney?.amount ?? null;
      const currencyCode = node?.totalPriceSet?.shopMoney?.currencyCode ?? null;
      const createdAt = node?.createdAt?.trim() || null;
      const financialStatus = node?.displayFinancialStatus?.trim() || null;
      const fulfillmentStatus = node?.displayFulfillmentStatus?.trim() || null;
      return {
        id,
        type: "order",
        title: name,
        subtitle: [financialStatus, fulfillmentStatus].filter(Boolean).join(" / ") || "Shopify 订单",
        meta: [
          amount && currencyCode ? `${amount} ${currencyCode}` : null,
          createdAt ? `创建于 ${formatDate(createdAt)}` : null,
        ].filter(Boolean).join(" · ") || "暂无更多信息",
        status: financialStatus || fulfillmentStatus,
        imageUrl: null,
        promptSummary: {
          id,
          name,
          createdAt,
          customerName: null,
          totalPrice: amount,
          currencyCode,
          financialStatus,
          fulfillmentStatus,
          tags: (node?.tags ?? []).filter(Boolean),
          lineItemsSummary: [],
        },
      };
    })
    .filter((item): item is OrderResourceItem => item !== null);

  return {
    items,
    pageInfo: coercePageInfo(payload.data?.orders?.pageInfo),
  };
}

async function decorateOrderSearchError(
  admin: ShopifyAdminGraphqlClient,
  error: unknown,
) {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : "订单查询失败";
  const lower = message.toLowerCase();

  if (lower.includes("access denied") || lower.includes("unauthorized")) {
    const scopes = await queryCurrentAppScopes(admin).catch(() => []);
    const hasReadOrders = scopes.includes("read_orders") || scopes.includes("write_orders");
    return hasReadOrders
      ? `当前店铺会话暂时无法读取订单数据。请确认应用已重新授权，且当前店铺允许订单读取。原始错误：${message}`
      : `当前应用缺少订单读取权限，请确认已授权 read_orders 后重新安装或重新授权应用。原始错误：${message}`;
  }

  if (lower.includes("60 days")) {
    return `当前店铺只能读取最近 60 天的订单数据。若需要更早订单，请申请并授权 read_all_orders。原始错误：${message}`;
  }

  return `订单数据查询失败：${message}`;
}

async function queryCurrentAppScopes(
  admin: ShopifyAdminGraphqlClient,
): Promise<string[]> {
  const response = await admin.graphql(CURRENT_APP_SCOPES_QUERY);
  const payload = (await response.json()) as {
    data?: {
      currentAppInstallation?: {
        accessScopes?: Array<{ handle?: string | null }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  ensureGraphqlOk(response.ok, response.status, payload.errors);
  return (payload.data?.currentAppInstallation?.accessScopes ?? [])
    .map((scope) => scope.handle?.trim() ?? "")
    .filter(Boolean);
}

function ensureGraphqlOk(ok: boolean, status: number, errors?: Array<{ message?: string }>) {
  if (!ok) {
    throw new Error(`Shopify HTTP ${status}`);
  }
  const gqlErrors = errors?.map((item) => item.message).filter(Boolean);
  if (gqlErrors?.length) {
    throw new Error(gqlErrors.join("；"));
  }
}

function buildConnectionVariables(input: {
  query: string;
  sortKey: string;
  direction?: ContextResourceSortDirection;
  cursor?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const isPrev = input.cursor?.startsWith("prev:") ?? false;
  const rawCursor = input.cursor?.replace(/^prev:/, "") ?? null;
  return {
    first: isPrev ? null : limit,
    last: isPrev ? limit : null,
    after: !isPrev ? rawCursor : null,
    before: isPrev ? rawCursor : null,
    query: input.query || null,
    sortKey: input.sortKey,
    reverse: input.direction === "asc" ? false : true,
  };
}

function mapProductSort(sort?: string) {
  if (sort === "title") return "TITLE";
  if (sort === "inventory") return "INVENTORY_TOTAL";
  return "UPDATED_AT";
}

function mapArticleSort(sort?: string) {
  if (sort === "title") return "TITLE";
  if (sort === "published_at") return "PUBLISHED_AT";
  return "UPDATED_AT";
}

function mapOrderSort(sort?: string) {
  if (sort === "total_price") return "TOTAL_PRICE";
  if (sort === "processed_at") return "PROCESSED_AT";
  return "CREATED_AT";
}

function buildProductSearchQuery(query?: string, filter?: string) {
  const clauses = buildBaseClauses(query);
  if (filter === "active") clauses.push("status:active");
  if (filter === "draft") clauses.push("status:draft");
  if (filter === "archived") clauses.push("status:archived");
  return clauses.join(" AND ");
}

function buildArticleSearchQuery(query?: string, filter?: string) {
  const clauses = buildBaseClauses(query);
  if (filter === "published") clauses.push("published_status:published");
  if (filter === "draft") clauses.push("published_status:unpublished");
  return clauses.join(" AND ");
}

function buildOrderSearchQuery(query?: string, filter?: string) {
  const clauses = buildBaseClauses(query);
  if (filter === "paid") clauses.push("financial_status:paid");
  if (filter === "unfulfilled") clauses.push("fulfillment_status:unfulfilled");
  if (filter === "refunded") clauses.push("financial_status:refunded");
  return clauses.join(" AND ");
}

function buildBaseClauses(query?: string) {
  const trimmed = query?.trim();
  if (!trimmed) return [];
  return [`${escapeShopifySearchTerm(trimmed)}`];
}

function escapeShopifySearchTerm(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function coercePageInfo(pageInfo?: Partial<ContextResourcePageInfo> | null): ContextResourcePageInfo {
  return {
    hasNextPage: Boolean(pageInfo?.hasNextPage),
    hasPreviousPage: Boolean(pageInfo?.hasPreviousPage),
    startCursor: pageInfo?.startCursor ?? null,
    endCursor: pageInfo?.endCursor ?? null,
  };
}

function formatPriceRange(minAmount: string | null, maxAmount: string | null, currencyCode: string | null) {
  if (!minAmount && !maxAmount) return null;
  if (minAmount && maxAmount && minAmount !== maxAmount) {
    return `${minAmount}-${maxAmount}${currencyCode ? ` ${currencyCode}` : ""}`;
  }
  return `${minAmount ?? maxAmount}${currencyCode ? ` ${currencyCode}` : ""}`;
}

function stripHtml(value: string | null) {
  if (!value) return null;
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function clipText(value: string | null, maxLength: number) {
  if (!value) return null;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function statusLabel(status: string | null) {
  if (!status) return null;
  return status.toLowerCase();
}
