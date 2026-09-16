/**
 * 变体库存水位只读读取。按商品 GID 走 productVariants 根查询并翻页。
 */
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import type { InventoryImportProductSnapshot } from "../../lib/inventoryImport";
import type { InventoryQtyLevelInput } from "../../lib/inventoryQtyEdit";
import type { SkuExportVariant } from "../../lib/skuExport";
import type { ShopLocation } from "./locationReader.server";
import { chunkItems, toNumericProductId } from "./productIdQuery.server";

const QUERY = `#graphql
  query InventoryLevelsByProducts($first: Int!, $after: String, $query: String!) {
    productVariants(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          sku
          barcode
          selectedOptions { name value }
          product { id title handle }
          inventoryItem {
            id
            tracked
            measurement { weight { value unit } }
            inventoryLevels(first: 20) {
              nodes {
                location { id name }
                quantities(names: ["available", "on_hand", "committed", "incoming", "reserved", "damaged", "safety_stock", "quality_control"]) {
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
  location?: { id?: string | null; name?: string | null } | null;
  quantities?: QuantityNode[] | null;
};
type VariantNode = {
  id?: string | null;
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  selectedOptions?: Array<{ name?: string | null; value?: string | null }> | null;
  product?: { id?: string | null; title?: string | null; handle?: string | null } | null;
  inventoryItem?: {
    id?: string | null;
    tracked?: boolean | null;
    measurement?: { weight?: { value?: number | null; unit?: string | null } | null } | null;
    inventoryLevels?: { nodes?: LevelNode[] | null } | null;
  } | null;
};

const PAGE_SIZE = 100;
const PRODUCT_IDS_PER_QUERY = 25;

function qty(quantities: QuantityNode[] | null | undefined, name: string): number {
  return quantities?.find((item) => item.name === name)?.quantity ?? 0;
}

function optionAt(
  options: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  index: number,
): { name: string; value: string } {
  const item = options?.[index];
  return { name: item?.name?.trim() ?? "", value: item?.value?.trim() ?? "" };
}

async function fetchVariantNodes(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  maxVariants: number,
): Promise<{ nodes: VariantNode[]; truncated: boolean }> {
  const numericIds = productIds.map(toNumericProductId).filter(Boolean);
  const collected: VariantNode[] = [];
  let truncated = false;
  for (const group of chunkItems(numericIds, PRODUCT_IDS_PER_QUERY)) {
    if (truncated) break;
    let after: string | null = null;
    const search = `product_ids:${group.join(",")}`;
    while (!truncated) {
      const response = await admin.graphql(QUERY, {
        variables: { first: PAGE_SIZE, after, query: search },
      });
      if (!response.ok) throw new Error(`Shopify productVariants query failed: HTTP ${response.status}`);
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
        if (collected.length >= maxVariants) {
          truncated = true;
          break;
        }
        collected.push(edge.node);
      }
      if (truncated || !connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }
  return { nodes: collected, truncated };
}

export async function fetchInventoryQtyLevels(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  locations: ShopLocation[],
  options: { maxVariants: number; locationId?: string },
): Promise<{ levels: InventoryQtyLevelInput[]; truncated: boolean }> {
  const { nodes, truncated } = await fetchVariantNodes(admin, productIds, options.maxVariants);
  const wanted = options.locationId
    ? locations.filter((item) => item.id === options.locationId)
    : locations.filter((item) => item.isActive && item.writable);
  const levels: InventoryQtyLevelInput[] = [];
  for (const node of nodes) {
    const variantId = node.id?.trim();
    const productId = node.product?.id?.trim();
    const inventoryItemId = node.inventoryItem?.id?.trim();
    if (!variantId || !productId || !inventoryItemId) continue;
    const tracked = node.inventoryItem?.tracked === true;
    for (const location of wanted) {
      const levelNode = node.inventoryItem?.inventoryLevels?.nodes?.find(
        (item) => item.location?.id === location.id,
      );
      const quantities = levelNode?.quantities ?? [];
      levels.push({
        variantId,
        productId,
        productTitle: node.product?.title?.trim() || productId,
        variantTitle: node.title?.trim() || "",
        sku: node.sku?.trim() || null,
        inventoryItemId,
        tracked,
        locationId: location.id,
        locationName: location.name,
        writable: location.writable,
        stocked: Boolean(levelNode),
        available: qty(quantities, "available"),
        onHand: qty(quantities, "on_hand"),
        committed: qty(quantities, "committed"),
      });
    }
  }
  return { levels, truncated };
}

export async function fetchInventoryImportCatalog(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  locations: ShopLocation[],
  maxVariants: number,
): Promise<{ products: InventoryImportProductSnapshot[]; truncated: boolean }> {
  const { nodes, truncated } = await fetchVariantNodes(admin, productIds, maxVariants);
  const byProduct = new Map<string, InventoryImportProductSnapshot>();
  for (const node of nodes) {
    const variantId = node.id?.trim();
    const productId = node.product?.id?.trim();
    const inventoryItemId = node.inventoryItem?.id?.trim();
    if (!variantId || !productId || !inventoryItemId) continue;
    let product = byProduct.get(productId);
    if (!product) {
      product = {
        productId,
        productTitle: node.product?.title?.trim() || productId,
        handle: node.product?.handle?.trim() || "",
        variants: [],
      };
      byProduct.set(productId, product);
    }
    const option1 = optionAt(node.selectedOptions, 0);
    const option2 = optionAt(node.selectedOptions, 1);
    const option3 = optionAt(node.selectedOptions, 2);
    product.variants.push({
      variantId,
      title: node.title?.trim() || "",
      sku: node.sku?.trim() || null,
      inventoryItemId,
      tracked: node.inventoryItem?.tracked === true,
      option1Name: option1.name,
      option1: option1.value,
      option2Name: option2.name,
      option2: option2.value,
      option3Name: option3.name,
      option3: option3.value,
      levels: locations.map((location) => {
        const levelNode = node.inventoryItem?.inventoryLevels?.nodes?.find(
          (item) => item.location?.id === location.id,
        );
        const quantities = levelNode?.quantities ?? [];
        const reserved = qty(quantities, "reserved");
        const damaged = qty(quantities, "damaged");
        const safety = qty(quantities, "safety_stock");
        const quality = qty(quantities, "quality_control");
        return {
          locationId: location.id,
          locationName: location.name,
          writable: location.writable,
          stocked: Boolean(levelNode),
          available: qty(quantities, "available"),
          onHand: qty(quantities, "on_hand"),
          committed: qty(quantities, "committed"),
          incoming: qty(quantities, "incoming"),
          unavailable: reserved + damaged + safety + quality,
        };
      }),
    });
  }
  return { products: [...byProduct.values()], truncated };
}

const PRODUCTS_ID_QUERY = `#graphql
  query InventoryImportProductIds($first: Int!, $after: String, $query: String!) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { id }
    }
  }
`;

export async function fetchInventoryImportCatalogByKeys(
  admin: ShopifyAdminGraphqlClient,
  keys: { handles: string[]; skus: string[] },
  locations: ShopLocation[],
  maxVariants: number,
): Promise<{ products: InventoryImportProductSnapshot[]; truncated: boolean }> {
  const terms = [
    ...keys.handles.filter(Boolean).map((handle) => `handle:${handle}`),
    ...keys.skus.filter(Boolean).map((sku) => `sku:${sku}`),
  ];
  const unique = [...new Set(terms)];
  if (unique.length === 0) return { products: [], truncated: false };
  const productIds: string[] = [];
  for (const group of chunkItems(unique, 20)) {
    let after: string | null = null;
    const search = group.join(" OR ");
    for (;;) {
      const response = await admin.graphql(PRODUCTS_ID_QUERY, {
        variables: { first: 50, after, query: search },
      });
      if (!response.ok) throw new Error(`Shopify products query failed: HTTP ${response.status}`);
      const json = (await response.json()) as {
        data?: {
          products?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<{ id?: string | null }>;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors?.length) throw new Error(json.errors.map((error) => error.message).join("; "));
      const connection = json.data?.products;
      if (!connection) break;
      for (const node of connection.nodes) {
        const id = node.id?.trim();
        if (id && !productIds.includes(id)) productIds.push(id);
      }
      if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }
  return fetchInventoryImportCatalog(admin, productIds, locations, maxVariants);
}

export async function fetchSkuExportVariants(
  admin: ShopifyAdminGraphqlClient,
  productIds: string[],
  maxVariants: number,
): Promise<{ rows: SkuExportVariant[]; truncated: boolean }> {
  const { nodes, truncated } = await fetchVariantNodes(admin, productIds, maxVariants);
  const rows: SkuExportVariant[] = [];
  for (const node of nodes) {
    const variantId = node.id?.trim();
    const productId = node.product?.id?.trim();
    if (!variantId || !productId) continue;
    const option1 = optionAt(node.selectedOptions, 0);
    const option2 = optionAt(node.selectedOptions, 1);
    const option3 = optionAt(node.selectedOptions, 2);
    const weight = node.inventoryItem?.measurement?.weight;
    rows.push({
      productId,
      handle: node.product?.handle?.trim() || "",
      title: node.product?.title?.trim() || productId,
      variantId,
      option1Name: option1.name,
      option1Value: option1.value,
      option2Name: option2.name,
      option2Value: option2.value,
      option3Name: option3.name,
      option3Value: option3.value,
      sku: node.sku?.trim() || "",
      barcode: node.barcode?.trim() || "",
      weight: weight?.value != null ? String(weight.value) : "",
      weightUnit: weight?.unit?.trim() || "",
    });
  }
  return { rows, truncated };
}
