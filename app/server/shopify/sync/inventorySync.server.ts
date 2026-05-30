import prisma from "../../../db.server";
import type { ShopifyInventoryLevelPayload } from "./types";

export async function syncInventoryLevel(
  shop: string,
  payload: ShopifyInventoryLevelPayload,
): Promise<void> {
  const inventoryItemId = String(payload.inventory_item_id);
  const locationId = String(payload.location_id);
  const available = payload.available ?? 0;

  await prisma.shopInventoryLevel.upsert({
    where: {
      shop_inventoryItemId_locationId: { shop, inventoryItemId, locationId },
    },
    create: {
      shop,
      inventoryItemId,
      locationId,
      available,
      updatedAt: new Date(payload.updated_at),
    },
    update: {
      available,
      updatedAt: new Date(payload.updated_at),
      syncedAt: new Date(),
    },
  });

  console.info(
    `[Sync] inventory upserted shop=${shop} itemId=${inventoryItemId} locationId=${locationId} available=${available}`,
  );
}
