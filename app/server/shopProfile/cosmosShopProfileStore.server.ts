import type { ShopProfileDoc } from "./types.server";
import {
  getShopProfileSparkOpsContainer,
  isCosmosSparkOpsConfigured,
} from "../cosmos/cosmosSparkOps.server";

export function isShopProfileCosmosConfigured(): boolean {
  return isCosmosSparkOpsConfigured();
}

const SHOP_PROFILE_DOC_TYPE = "shop_profile";

export async function getShopProfileDoc(
  shop: string,
): Promise<ShopProfileDoc | null> {
  const shopTrim = shop.trim();
  if (!shopTrim || !isShopProfileCosmosConfigured()) return null;
  try {
    const container = await getShopProfileSparkOpsContainer();
    const { resource } = await container
      .item("profile", shopTrim)
      .read<ShopProfileDoc>();
    if (!resource || resource.docType !== SHOP_PROFILE_DOC_TYPE) return null;
    return resource;
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "number"
        ? (error as { code: number }).code
        : undefined;
    if (code === 404) return null;
    throw error;
  }
}

export async function upsertShopProfileDoc(doc: ShopProfileDoc): Promise<void> {
  const shop = doc.shop.trim();
  if (!shop) return;
  const container = await getShopProfileSparkOpsContainer();
  await container.items.upsert({
    ...doc,
    id: "profile",
    shop,
    docType: SHOP_PROFILE_DOC_TYPE,
    /** 与 agent_runs 同容器时，避免继承容器 90 天 TTL */
    ttl: -1,
  });
}
