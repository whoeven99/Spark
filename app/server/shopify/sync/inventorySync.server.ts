import prisma from "../../../db.server";
import { unauthenticated } from "../../../shopify.server";
import {
  parseInventoryEnrichmentFromGraphql,
  type InventoryEnrichment,
} from "./inventorySyncParse.server";
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

function gid(resource: string, numericId: string): string {
  return `gid://shopify/${resource}/${numericId}`;
}

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
      data?: { inventoryItem?: InventoryItemGraphqlNode | null };
      errors?: Array<{ message?: string }>;
    };
    const gqlErrors = body.errors?.map((error) => error.message).filter(Boolean);
    if (gqlErrors?.length) {
      console.warn(
        `[Sync] inventory enrich graphql errors shop=${shop} itemId=${inventoryItemId}: ${gqlErrors.join("；")}`,
      );
      return null;
    }

    const enrichment = parseInventoryEnrichmentFromGraphql(
      body.data?.inventoryItem,
    );
    if (!enrichment) {
      console.warn(
        `[Sync] inventory enrich empty shop=${shop} itemId=${inventoryItemId}`,
      );
      return null;
    }

    return enrichment;
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

  const enrichedSku = enrichment?.sku ?? "n/a";
  const enrichedVariantId = enrichment?.variantId ?? "n/a";
  console.info(
    `[Sync] inventory upserted shop=${shop} itemId=${inventoryItemId} locationId=${locationId} available=${quantities.available ?? available} sku=${enrichedSku} variantId=${enrichedVariantId}`,
  );
}
