/**
 * 店铺库存地点只读列表。写库存必须带地点 GID，开卡时预取。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const QUERY = `#graphql
  query InventoryLocations($first: Int!, $after: String) {
    locations(first: $first, after: $after, includeLegacy: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        isActive
        fulfillsOnlineOrders
      }
    }
  }
`;

export type ShopLocation = {
  id: string;
  name: string;
  isActive: boolean;
  fulfillsOnlineOrders: boolean;
};

type LocationsPayload = {
  data?: {
    locations?: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id?: string | null;
        name?: string | null;
        isActive?: boolean | null;
        fulfillsOnlineOrders?: boolean | null;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

export async function fetchShopLocations(
  admin: ShopifyAdminGraphqlClient,
): Promise<ShopLocation[]> {
  const out: ShopLocation[] = [];
  let after: string | null = null;
  for (;;) {
    const response = await admin.graphql(QUERY, { variables: { first: 50, after } });
    if (!response.ok) throw new Error(`Shopify locations query failed: HTTP ${response.status}`);
    const json = (await response.json()) as LocationsPayload;
    if (json.errors?.length) {
      throw new Error(json.errors.map((error) => error.message).filter(Boolean).join("; "));
    }
    const connection = json.data?.locations;
    if (!connection) break;
    for (const node of connection.nodes) {
      const id = node.id?.trim();
      const name = node.name?.trim();
      if (!id || !name || node.isActive === false) continue;
      out.push({
        id,
        name,
        isActive: true,
        fulfillsOnlineOrders: node.fulfillsOnlineOrders !== false,
      });
    }
    if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
    after = connection.pageInfo.endCursor;
  }
  return out;
}
