import prisma from "../../../db.server";
import { unauthenticated } from "../../../shopify.server";
import type { ShopifyInventoryLevelPayload } from "./types";

const INVENTORY_ITEM_FOR_MONITOR_QUERY = `#graphql
  query InventoryItemForMonitor($id: ID!, $locationId: ID!) {
    inventoryItem(id: $id) {
      id
      sku
      variants(first: 1) {
        nodes {
          id
          title
          product {
            id
            title
          }
        }
      }
      inventoryLevel(locationId: $locationId) {
        location {
          id
          name
        }
        quantities(names: ["available", "committed", "incoming", "on_hand"]) {
          name
          quantity
        }
      }
    }
  }
`;

type InventoryEnrichment = {
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

function gid(resource: string, numericId: string): string {
  return `gid://shopify/${resource}/${numericId}`;
}

function parseShopifyNumericId(id: string | null | undefined): string | null {
  if (!id) return null;
  const lastSegment = id.split("/").pop();
  return lastSegment?.split("?")[0] ?? null;
}

async function loadInventoryEnrichment(
  shop: string,
  inventoryItemId: string,
  locationId: string,
): Promise<InventoryEnrichment | null> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(INVENTORY_ITEM_FOR_MONITOR_QUERY, {
      variables: {
        id: gid("InventoryItem", inventoryItemId),
        locationId: gid("Location", locationId),
      },
    });
    const body = (await response.json()) as {
      data?: {
        inventoryItem?: {
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
        } | null;
      };
    };
    const inventoryItem = body.data?.inventoryItem;
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
  } catch (error) {
    console.warn(
      `[Sync] inventory enrich skipped shop=${shop} itemId=${inventoryItemId}:`,
      error,
    );
    return null;
  }
}

export async function syncInventoryLevel(
  shop: string,
  payload: ShopifyInventoryLevelPayload,
): Promise<void> {
  const inventoryItemId = String(payload.inventory_item_id);
  const locationId = String(payload.location_id);
  const available = payload.available ?? 0;
  const enrichment = await loadInventoryEnrichment(
    shop,
    inventoryItemId,
    locationId,
  );
  const quantities = enrichment?.quantities ?? {};

  await prisma.shopInventoryLevel.upsert({
    where: {
      shop_inventoryItemId_locationId: { shop, inventoryItemId, locationId },
    },
    create: {
      shop,
      inventoryItemId,
      locationId,
      variantId: enrichment?.variantId ?? null,
      productId: enrichment?.productId ?? null,
      sku: enrichment?.sku ?? null,
      productTitle: enrichment?.productTitle ?? null,
      variantTitle: enrichment?.variantTitle ?? null,
      locationName: enrichment?.locationName ?? null,
      available: quantities.available ?? available,
      onHand: quantities.on_hand ?? available,
      committed: quantities.committed ?? 0,
      incoming: quantities.incoming ?? 0,
      updatedAt: new Date(payload.updated_at),
    },
    update: {
      variantId: enrichment?.variantId ?? undefined,
      productId: enrichment?.productId ?? undefined,
      sku: enrichment?.sku ?? undefined,
      productTitle: enrichment?.productTitle ?? undefined,
      variantTitle: enrichment?.variantTitle ?? undefined,
      locationName: enrichment?.locationName ?? undefined,
      available: quantities.available ?? available,
      onHand: quantities.on_hand ?? undefined,
      committed: quantities.committed ?? undefined,
      incoming: quantities.incoming ?? undefined,
      updatedAt: new Date(payload.updated_at),
      syncedAt: new Date(),
    },
  });

  if (enrichment?.variantId || enrichment?.sku) {
    await prisma.shopOrderLineItem.updateMany({
      where: {
        shop,
        inventoryItemId: null,
        OR: [
          ...(enrichment.variantId
            ? [{ variantId: enrichment.variantId }]
            : []),
          ...(enrichment.sku ? [{ sku: enrichment.sku }] : []),
        ],
      },
      data: { inventoryItemId },
    });
  }

  console.info(
    `[Sync] inventory upserted shop=${shop} itemId=${inventoryItemId} locationId=${locationId} available=${available}`,
  );
}
