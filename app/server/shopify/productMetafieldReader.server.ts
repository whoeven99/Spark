/**
 * 商品 Metafield 只读读取（批量 Metafield 改写的读侧）。
 *
 * 三件事：列出商品级 metafield 定义（给卡片下拉）、按 `namespace.key` 取单个定义的权威信息、
 * 以及批量读商品当前值。本文件只读，不含任何 mutation。
 *
 * 两个 Shopify 侧的坑，改动前先看：
 *   - `metafieldDefinition(id:)` 在 2026-07 已 deprecated，官方改推
 *     `identifier: { ownerType, namespace, key }`，所以这里全程用 namespace + key 定位。
 *   - `MetafieldDefinition.type` 是对象（`type { name }`），而 `Metafield.type` 是标量 `String!`。
 *     两处写法不一样，照抄会直接 GraphQL 报错。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const PAGE_SIZE = 100;
/** 一次最多读多少个定义：够覆盖绝大多数店铺，又不至于无节制翻页。 */
const MAX_DEFINITIONS = 250;
/** 一次 id 过滤里塞的商品数；过大会让查询串超长。 */
const PRODUCT_IDS_PER_QUERY = 25;

const DEFINITIONS_QUERY = `#graphql
  query BulkMetafieldEditDefinitions($first: Int!, $after: String) {
    metafieldDefinitions(ownerType: PRODUCT, first: $first, after: $after, sortKey: NAME) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        namespace
        key
        description
        metafieldsCount
        type { name }
      }
    }
  }
`;

const DEFINITION_BY_IDENTIFIER_QUERY = `#graphql
  query BulkMetafieldEditDefinition($namespace: String, $key: String!) {
    metafieldDefinition(
      identifier: { ownerType: PRODUCT, namespace: $namespace, key: $key }
    ) {
      id
      name
      namespace
      key
      description
      type { name }
    }
  }
`;

const PRODUCT_METAFIELD_QUERY = `#graphql
  query BulkMetafieldEditProducts(
    $first: Int!
    $after: String
    $query: String!
    $namespace: String
    $key: String!
  ) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          vendor
          productType
          metafield(namespace: $namespace, key: $key) { id value type }
        }
      }
    }
  }
`;

export type ShopifyMetafieldDefinitionSummary = {
  definitionId: string;
  name: string;
  namespace: string;
  key: string;
  type: string;
  description: string | null;
  /** 已经有多少个商品设了这个字段；下拉标签里展示，帮商户认出常用字段 */
  metafieldsCount: number | null;
};

export type ShopifyProductMetafield = {
  productId: string;
  productTitle: string;
  vendor: string | null;
  productType: string | null;
  currentValue: string | null;
};

type DefinitionNode = {
  id?: string | null;
  name?: string | null;
  namespace?: string | null;
  key?: string | null;
  description?: string | null;
  metafieldsCount?: number | null;
  type?: { name?: string | null } | null;
};

type ProductNode = {
  id: string;
  title?: string | null;
  vendor?: string | null;
  productType?: string | null;
  metafield?: { value?: string | null } | null;
};

type PageInfo = { hasNextPage: boolean; endCursor: string | null };

/**
 * 翻页响应显式命名。分页游标既是入参又来自出参，
 * 类型靠推断会形成自引用（TS7022），必须给个具名类型断开。
 */
type DefinitionsQueryData = {
  metafieldDefinitions?: { pageInfo: PageInfo; nodes: DefinitionNode[] };
};

type ProductsQueryData = {
  products?: { pageInfo: PageInfo; edges: Array<{ node: ProductNode }> };
};

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function toNumericId(gid: string): string {
  return gid.trim().replace(/^gid:\/\/shopify\/Product\//, "");
}

function mapDefinition(node: DefinitionNode): ShopifyMetafieldDefinitionSummary | null {
  const definitionId = node.id?.trim();
  const namespace = node.namespace?.trim();
  const key = node.key?.trim();
  const type = node.type?.name?.trim();
  if (!definitionId || !namespace || !key || !type) return null;
  return {
    definitionId,
    name: node.name?.trim() || `${namespace}.${key}`,
    namespace,
    key,
    type,
    description: emptyToNull(node.description),
    metafieldsCount: typeof node.metafieldsCount === "number" ? node.metafieldsCount : null,
  };
}

async function runQuery<T>(
  admin: ShopifyAdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  label: string,
): Promise<T | null> {
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
  return json.data ?? null;
}

/**
 * 列出商品级 metafield 定义。
 *
 * 关键词过滤放在内存里做，不用 Shopify 的 `query` 参数：
 * 定义数量本来就少（翻两三页封顶），而 `query` 的搜索语法只覆盖
 * namespace / key / type 等结构化字段，商户说的往往是 name（显示名），搜不到。
 */
export async function listProductMetafieldDefinitions(
  admin: ShopifyAdminGraphqlClient,
  options: { keyword?: string } = {},
): Promise<{ definitions: ShopifyMetafieldDefinitionSummary[]; hasMore: boolean }> {
  const collected: ShopifyMetafieldDefinitionSummary[] = [];
  let after: string | null = null;
  let hasMore = false;

  for (;;) {
    const data: DefinitionsQueryData | null = await runQuery<DefinitionsQueryData>(
      admin,
      DEFINITIONS_QUERY,
      { first: PAGE_SIZE, after },
      "metafieldDefinitions",
    );

    const connection: DefinitionsQueryData["metafieldDefinitions"] =
      data?.metafieldDefinitions;
    if (!connection) break;

    for (const node of connection.nodes) {
      const mapped = mapDefinition(node);
      if (mapped) collected.push(mapped);
    }

    if (collected.length >= MAX_DEFINITIONS) {
      hasMore = connection.pageInfo.hasNextPage;
      break;
    }
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }

  const keyword = options.keyword?.trim().toLowerCase() ?? "";
  if (!keyword) {
    return { definitions: collected.slice(0, MAX_DEFINITIONS), hasMore };
  }

  const matched = collected.filter((definition) =>
    [definition.name, definition.namespace, definition.key].some((field) =>
      field.toLowerCase().includes(keyword),
    ),
  );
  return { definitions: matched, hasMore };
}

/** 按 namespace + key 取单个定义。找不到返回 null（可能刚被商户删掉）。 */
export async function findProductMetafieldDefinition(
  admin: ShopifyAdminGraphqlClient,
  identifier: { namespace: string; key: string },
): Promise<ShopifyMetafieldDefinitionSummary | null> {
  const data = await runQuery<{ metafieldDefinition?: DefinitionNode | null }>(
    admin,
    DEFINITION_BY_IDENTIFIER_QUERY,
    { namespace: identifier.namespace, key: identifier.key },
    "metafieldDefinition",
  );
  const node = data?.metafieldDefinition;
  return node ? mapDefinition(node) : null;
}

/**
 * 按商品 GID 批量读取指定 metafield 的当前值，以及模板占位符要用的 title / vendor / productType。
 * 达到 maxProducts 后停止并置 truncated，调用方据此告知用户结果不完整。
 */
export async function fetchProductMetafieldsByProductIds(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options: { namespace: string; key: string; maxProducts: number },
): Promise<{ products: ShopifyProductMetafield[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericId).filter(Boolean);
  if (numericIds.length === 0) return { products: [], truncated: false };

  const collected: ShopifyProductMetafield[] = [];
  /** 因为撞到上限而提前停止（还有没读到的商品） */
  let truncated = false;

  for (const group of chunk(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const query = group.map((id) => `id:${id}`).join(" OR ");

    while (!truncated) {
      const data: ProductsQueryData | null = await runQuery<ProductsQueryData>(
        admin,
        PRODUCT_METAFIELD_QUERY,
        {
          first: PAGE_SIZE,
          after,
          query,
          namespace: options.namespace,
          key: options.key,
        },
        "products",
      );

      const connection: ProductsQueryData["products"] = data?.products;
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
          vendor: emptyToNull(edge.node.vendor),
          productType: emptyToNull(edge.node.productType),
          // 空串与「没设过」在业务上不同：前者是商户显式清过，后者从来没有这个字段
          currentValue:
            typeof edge.node.metafield?.value === "string" ? edge.node.metafield.value : null,
        });
      }

      if (truncated) break;
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }

  return { products: collected, truncated };
}
