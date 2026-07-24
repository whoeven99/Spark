export type InventoryEnrichment = {
  sku: string | null;
  variantId: string | null;
  productId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  locationName: string | null;
  quantities: {
    available?: number;
    committed?: number;
    incoming?: number;
    on_hand?: number;
  };
};

type InventoryItemGraphqlNode = {
  sku?: string | null;
  variants?: {
    nodes?: Array<{
      id?: string | null;
      title?: string | null;
      product?: { id?: string | null; title?: string | null } | null;
    }>;
  } | null;
  inventoryLevel?: {
    location?: { name?: string | null } | null;
    quantities?: Array<{ name: string; quantity: number }>;
  } | null;
};

export function parseShopifyNumericId(
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  const lastSegment = id.split("/").pop();
  return lastSegment?.split("?")[0] ?? null;
}

export function parseInventoryEnrichmentFromGraphql(
  inventoryItem: InventoryItemGraphqlNode | null | undefined,
): InventoryEnrichment | null {
  if (!inventoryItem) return null;

  const variant = inventoryItem.variants?.nodes?.[0] ?? null;
  const quantities = Object.fromEntries(
    (inventoryItem.inventoryLevel?.quantities ?? []).map((quantity) => [
      quantity.name,
      quantity.quantity,
    ]),
  ) as InventoryEnrichment["quantities"];

  return {
    sku: inventoryItem.sku ?? null,
    variantId: parseShopifyNumericId(variant?.id),
    productId: parseShopifyNumericId(variant?.product?.id),
    productTitle: variant?.product?.title ?? null,
    variantTitle: variant?.title ?? null,
    locationName: inventoryItem.inventoryLevel?.location?.name ?? null,
    quantities,
  };
}
