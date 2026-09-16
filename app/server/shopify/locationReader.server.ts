/**
 * 店铺仓库只读列表。库存确认卡预取 options，导入按仓名精确匹配。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const LOCATIONS_QUERY = `#graphql
  query InventoryLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after, includeLegacy: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        isActive
        fulfillmentService { handle }
      }
    }
  }
`;

export type ShopLocation = {
  id: string;
  name: string;
  isActive: boolean;
  writable: boolean;
};

type LocationNode = {
  id?: string | null;
  name?: string | null;
  isActive?: boolean | null;
  fulfillmentService?: { handle?: string | null } | null;
};

export async function fetchShopLocations(
  admin: ShopifyAdminGraphqlClient,
): Promise<ShopLocation[]> {
  const out: ShopLocation[] = [];
  let after: string | null = null;
  for (;;) {
    const response = await admin.graphql(LOCATIONS_QUERY, {
      variables: { first: 50, after },
    });
    if (!response.ok) {
      throw new Error(`Shopify locations query failed: HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      data?: {
        locations?: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: LocationNode[];
        };
      };
      errors?: Array<{ message: string }>;
    };
    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).join("; "));
    }
    const connection = json.data?.locations;
    if (!connection) break;
    for (const node of connection.nodes) {
      const id = node.id?.trim();
      const name = node.name?.trim();
      if (!id || !name) continue;
      const isActive = node.isActive !== false;
      out.push({
        id,
        name,
        isActive,
        writable: isActive && !node.fulfillmentService?.handle,
      });
    }
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }
  return out;
}

export function locationSelectOptions(locations: ShopLocation[]): Array<{ value: string; label: string }> {
  return locations
    .filter((item) => item.isActive)
    .map((item) => ({
      value: item.id,
      label: item.writable ? item.name : `${item.name}（只读）`,
    }));
}
