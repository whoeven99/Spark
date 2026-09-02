/**
 * 只读：店铺地点列表（库存导入选择目标地点用）。
 *
 * 只列出活跃、能备货的地点：停用地点写不进库存，履约服务托管的地点（legacy）
 * 由第三方系统管理，商户在这里改数字也不会生效，列出来只会误导。
 *
 * 需要 read_locations（Shopify 把它并在商品/库存读权限里下发）。本文件不含任何 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

export type ShopifyLocationSummary = {
  id: string;
  name: string;
  /** 是否为默认发货地点，用于在只有一个候选时预选 */
  isPrimary: boolean;
  /** 是否参与线上订单履约；否则多半是仓库或自提点 */
  fulfillsOnlineOrders: boolean;
};

const LOCATIONS_QUERY = `#graphql
  query BulkInventoryImportLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after, includeInactive: false, includeLegacy: false) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          isPrimary
          fulfillsOnlineOrders
        }
      }
    }
  }
`;

type LocationNode = {
  id: string;
  name?: string | null;
  isPrimary?: boolean | null;
  fulfillsOnlineOrders?: boolean | null;
};

type LocationsPage = {
  locations?: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: LocationNode }>;
  };
};

const PAGE_SIZE = 100;
/** 地点数量在真实店铺里通常是个位数；设个上限防止极端情况把开卡拖死。 */
const MAX_LOCATIONS = 250;

/**
 * 列出可作为库存导入目标的地点。
 * 默认地点排在最前，方便 UI 直接预选。
 */
export async function listActiveLocations(
  admin: ShopifyAdminGraphqlClient,
): Promise<ShopifyLocationSummary[]> {
  const collected: ShopifyLocationSummary[] = [];
  let after: string | null = null;

  for (;;) {
    const response = await admin.graphql(LOCATIONS_QUERY, {
      variables: { first: PAGE_SIZE, after },
    });
    if (!response.ok) {
      throw new Error(`Shopify locations query failed: HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      data?: LocationsPage;
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(
        `Shopify locations GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    const connection = json.data?.locations;
    if (!connection) break;

    for (const edge of connection.edges) {
      collected.push({
        id: edge.node.id,
        name: edge.node.name?.trim() || edge.node.id,
        isPrimary: edge.node.isPrimary === true,
        fulfillsOnlineOrders: edge.node.fulfillsOnlineOrders === true,
      });
    }

    if (
      collected.length >= MAX_LOCATIONS ||
      !connection.pageInfo.hasNextPage ||
      !connection.pageInfo.endCursor
    ) {
      break;
    }
    after = connection.pageInfo.endCursor;
  }

  return collected
    .slice(0, MAX_LOCATIONS)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
}

/** 单个地点详情：写回前确认这个地点还在、还能备货。 */
export async function findLocationById(
  admin: ShopifyAdminGraphqlClient,
  locationId: string,
): Promise<ShopifyLocationSummary | null> {
  const locations = await listActiveLocations(admin);
  return locations.find((location) => location.id === locationId) ?? null;
}
