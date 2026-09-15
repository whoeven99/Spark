/**
 * 变体 × 地点库存水位只读读取。不含 mutation。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  INVENTORY_QTY_MAX_ROWS,
  type InventoryLevelSnapshot,
} from "../../lib/inventoryQtyEdit";
import { PRODUCT_IDS_PER_QUERY, chunkItems } from "./productIdQuery.server";

const QUERY = `#graphql
  query InventoryLevelsByProduct($first: Int!, $after: String, $query: String!) {
    productVariants(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          sku
          selectedOptions { name value }
          product { id title handle isGiftCard }
          inventoryItem {
            id
            sku
            tracked
            inventoryLevels(first: 50) {
              nodes {
                location { id name isActive }
                quantities(names: ["available", "on_hand", "committed", "incoming"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

type QuantityNode = { name?: string | null; quantity?: number | null };
type LevelNode = {
  location?: { id?: string | null; name?: string | null; isActive?: boolean | null } | null;
  quantities?: QuantityNode[] | null;
};
type VariantNode = {
  id?: string | null;
  title?: string | null;
  sku?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  product?: { id?: string | null; title?: string | null; handle?: string | null; isGiftCard?: boolean | null } | null;
  inventoryItem?: {
    id?: string | null;
    sku?: string | null;
    tracked?: boolean | null;
    inventoryLevels?: { nodes?: LevelNode[] | null } | null;
  } | null;
};

function quantityMap(nodes: QuantityNode[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const node of nodes ?? []) {
    const name = node.name?.trim();
    if (!name || typeof node.quantity !== "number") continue;
    out[name] = node.quantity;
  }
  return out;
}

function optionValue(
  selected: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  index: number,
): string {
  return selected?.[index]?.value?.trim() ?? "";
}

function mapLevels(node: VariantNode): InventoryLevelSnapshot[] {
  const variantId = node.id?.trim();
  const productId = node.product?.id?.trim();
  const inventoryItemId = node.inventoryItem?.id?.trim();
  if (!variantId || !productId || !inventoryItemId) return [];
  const tracked = Boolean(node.inventoryItem?.tracked);
  const isGiftCard = Boolean(node.product?.isGiftCard);
  const sku = node.inventoryItem?.sku?.trim() || node.sku?.trim() || null;
  const selected = node.selectedOptions ?? [];
  const out: InventoryLevelSnapshot[] = [];
  for (const level of node.inventoryItem?.inventoryLevels?.nodes ?? []) {
    const locationId = level.location?.id?.trim();
    const locationName = level.location?.name?.trim();
    if (!locationId || !locationName || level.location?.isActive === false) continue;
    const qty = quantityMap(level.quantities);
    out.push({
      variantId,
      productId,
      productTitle: node.product?.title?.trim() || productId,
      variantTitle: node.title?.trim() || "",
      sku,
      handle: node.product?.handle?.trim() || "",
      option1: optionValue(selected, 0),
      option2: optionValue(selected, 1),
      option3: optionValue(selected, 2),
      inventoryItemId,
      locationId,
      locationName,
      tracked,
      isGiftCard,
      stocked: true,
      available: qty.available ?? 0,
      onHand: qty.on_hand ?? 0,
      committed: qty.committed ?? 0,
      incoming: qty.incoming ?? 0,
    });
  }
  return out;
}

export async function fetchInventoryLevelsByProductIds(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  options?: { maxRows?: number },
): Promise<{ levels: InventoryLevelSnapshot[]; truncated: boolean }> {
  const maxRows = options?.maxRows ?? INVENTORY_QTY_MAX_ROWS;
  const numericIds = productIds
    .map((id) => id.replace(/^gid:\/\/shopify\/Product\//, ""))
    .filter(Boolean);
  const collected: InventoryLevelSnapshot[] = [];
  let truncated = false;
  for (const group of chunkItems(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const query = `product_ids:${group.join(",")}`;
    while (!truncated) {
      const response = await admin.graphql(QUERY, {
        variables: { first: 100, after, query },
      });
      if (!response.ok) throw new Error(`Shopify inventory query failed: HTTP ${response.status}`);
      const json = (await response.json()) as {
        data?: {
          productVariants?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            edges: Array<{ node: VariantNode }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) {
        throw new Error(json.errors.map((error) => error.message).join("; "));
      }
      const connection = json.data?.productVariants;
      if (!connection) break;
      for (const edge of connection.edges) {
        for (const level of mapLevels(edge.node)) {
          if (collected.length >= maxRows) {
            truncated = true;
            break;
          }
          collected.push(level);
        }
        if (truncated) break;
      }
      if (truncated) break;
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }
  return { levels: collected, truncated };
}

export function filterLevelsForLocation(
  levels: InventoryLevelSnapshot[],
  locationId: string,
): InventoryLevelSnapshot[] {
  return levels.filter((level) => level.locationId === locationId);
}
