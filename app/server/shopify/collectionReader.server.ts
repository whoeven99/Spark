/**
 * 合集只读读取（批量入 / 出 Collection 的读侧）。
 *
 * 本文件只读，不含任何 mutation。三件事：
 *   1. 列出可手动增删成员的合集（确认卡下拉 + 只读工具共用）；
 *   2. 读单个合集的元信息，判断它是不是规则驱动；
 *   3. 按商品 GID 批量判断「是否已在该合集里」。
 *
 * 规则驱动判定同时看两处：`ruleSet`（经典智能合集，2026-07 已 deprecated 但仍是最明确的信号）
 * 与 `sources` 里的 `CollectionConditionsSource`（新的条件来源模型）。
 * 任一命中就当作不能手动增删——Shopify 对智能合集会直接返回
 * 「Can't manually remove products from a smart collection」，与其让用户点完写回才失败，
 * 不如在试算阶段就拦住。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const COLLECTION_DETAIL_QUERY = `#graphql
  query BulkCollectionEditCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      handle
      productsCount { count }
      sources { __typename }
      ruleSet { appliedDisjunctively }
    }
  }
`;

const COLLECTION_LIST_QUERY = `#graphql
  query BulkCollectionEditCollections($first: Int!, $query: String) {
    collections(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo { hasNextPage }
      edges {
        node {
          id
          title
          handle
          productsCount { count }
          sources { __typename }
          ruleSet { appliedDisjunctively }
        }
      }
    }
  }
`;

const PRODUCT_MEMBERSHIP_QUERY = `#graphql
  query BulkCollectionEditMembership(
    $first: Int!
    $after: String
    $query: String!
    $collectionId: ID!
  ) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
          inCollection(id: $collectionId)
        }
      }
    }
  }
`;

export type ShopifyCollectionSummary = {
  collectionId: string;
  title: string;
  handle: string;
  productsCount: number | null;
  /** 成员由规则 / 条件决定，不能手动增删 */
  ruleDriven: boolean;
};

export type ShopifyProductCollectionMembership = {
  productId: string;
  productTitle: string;
  status: string;
  inCollection: boolean;
};

type CollectionNode = {
  id: string;
  title?: string | null;
  handle?: string | null;
  productsCount?: { count?: number | null } | null;
  sources?: Array<{ __typename?: string | null }> | null;
  ruleSet?: { appliedDisjunctively?: boolean | null } | null;
};

type ProductNode = {
  id: string;
  title?: string | null;
  status?: string | null;
  inCollection?: boolean | null;
};

const PAGE_SIZE = 100;
/** 一次 id 过滤里塞的商品数；过大会让查询串超长。 */
const PRODUCT_IDS_PER_QUERY = 25;
/** 条件来源的 __typename；命中即视为规则驱动。 */
const CONDITIONS_SOURCE_TYPENAME = "CollectionConditionsSource";

function toNumericProductId(gid: string): string {
  return gid.trim().replace(/^gid:\/\/shopify\/Product\//, "");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function mapCollectionNode(node: CollectionNode): ShopifyCollectionSummary | null {
  const collectionId = node.id?.trim();
  if (!collectionId) return null;
  const hasConditionsSource = (node.sources ?? []).some(
    (source) => source?.__typename === CONDITIONS_SOURCE_TYPENAME,
  );
  return {
    collectionId,
    title: node.title?.trim() || collectionId,
    handle: node.handle?.trim() ?? "",
    productsCount:
      typeof node.productsCount?.count === "number" ? node.productsCount.count : null,
    ruleDriven: node.ruleSet != null || hasConditionsSource,
  };
}

type ProductMembershipPage = {
  products?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ProductNode }>;
  };
};

async function runQuery<T>(
  admin: ShopifyAdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  label: string,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  if (!response.ok) {
    throw new Error(`Shopify ${label} query failed: HTTP ${response.status}`);
  }
  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(
      `Shopify ${label} GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!json.data) {
    throw new Error(`Shopify ${label} query returned no data`);
  }
  return json.data;
}

/** 读单个合集；合集不存在时返回 null（而不是抛错），由调用方决定怎么提示。 */
export async function fetchCollectionSummary(
  admin: ShopifyAdminGraphqlClient,
  collectionId: string,
): Promise<ShopifyCollectionSummary | null> {
  const data = await runQuery<{ collection?: CollectionNode | null }>(
    admin,
    COLLECTION_DETAIL_QUERY,
    { id: collectionId },
    "collection",
  );
  if (!data.collection) return null;
  return mapCollectionNode(data.collection);
}

/**
 * 列出合集。规则驱动的合集也会返回（带 ruleDriven 标记），
 * 让只读工具能如实告诉用户「这个是智能合集，改不了成员」，而不是假装它不存在。
 */
export async function listCollectionSummaries(
  admin: ShopifyAdminGraphqlClient,
  options: { keyword?: string; first: number },
): Promise<{ collections: ShopifyCollectionSummary[]; hasMore: boolean }> {
  const keyword = options.keyword?.trim() ?? "";
  const data = await runQuery<{
    collections?: {
      pageInfo: { hasNextPage: boolean };
      edges: Array<{ node: CollectionNode }>;
    };
  }>(
    admin,
    COLLECTION_LIST_QUERY,
    {
      first: Math.max(1, Math.min(options.first, 250)),
      query: keyword ? `title:*${keyword}*` : null,
    },
    "collections",
  );
  const connection = data.collections;
  if (!connection) return { collections: [], hasMore: false };
  const collections = connection.edges
    .map((edge) => mapCollectionNode(edge.node))
    .filter((item): item is ShopifyCollectionSummary => item !== null);
  return { collections, hasMore: connection.pageInfo.hasNextPage };
}

/**
 * 按商品 GID 批量读取「是否已在指定合集里」。
 * 达到 maxProducts 后停止并置 truncated，调用方据此告知用户结果不完整。
 */
export async function fetchProductCollectionMembership(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  collectionId: string,
  options: { maxProducts: number },
): Promise<{ products: ShopifyProductCollectionMembership[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericProductId).filter(Boolean);
  if (numericIds.length === 0) return { products: [], truncated: false };

  const collected: ShopifyProductCollectionMembership[] = [];
  /** 因为撞到上限而提前停止（还有没读到的商品） */
  let truncated = false;

  for (const group of chunk(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const query = group.map((id) => `id:${id}`).join(" OR ");

    while (!truncated) {
      const data: ProductMembershipPage = await runQuery<ProductMembershipPage>(
        admin,
        PRODUCT_MEMBERSHIP_QUERY,
        { first: PAGE_SIZE, after, query, collectionId },
        "products",
      );
      const connection = data.products;
      if (!connection) break;
      for (const edge of connection.edges) {
        if (collected.length >= options.maxProducts) {
          truncated = true;
          break;
        }
        const productId = edge.node.id?.trim();
        if (!productId) continue;
        collected.push({
          productId,
          productTitle: edge.node.title?.trim() || productId,
          status: edge.node.status?.trim() ?? "",
          inCollection: edge.node.inCollection === true,
        });
      }
      if (truncated) break;
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }

  return { products: collected, truncated };
}
