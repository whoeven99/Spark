import type { ShopProfileDoc } from "./types.server";
import {
  getShopProfileSparkOpsContainer,
  isCosmosSparkOpsConfigured,
  isCosmosThroughputLimitError,
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
    const container = getShopProfileSparkOpsContainer();
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
    if (isCosmosThroughputLimitError(error)) {
      console.warn(
        `[ShopProfile] Cosmos read skipped (throughput limit) shop=${shopTrim}`,
      );
      return null;
    }
    throw error;
  }
}

/** @returns false 表示未写入（容器不存在或 RU 限制等） */
export async function upsertShopProfileDoc(
  doc: ShopProfileDoc,
): Promise<boolean> {
  const shop = doc.shop.trim();
  if (!shop) return false;
  try {
    const container = getShopProfileSparkOpsContainer();
    await container.items.upsert({
      ...doc,
      id: "profile",
      shop,
      docType: SHOP_PROFILE_DOC_TYPE,
      ttl: -1,
    });
    return true;
  } catch (error: unknown) {
    if (isCosmosThroughputLimitError(error)) {
      console.warn(
        `[ShopProfile] Cosmos upsert skipped (throughput limit) shop=${shop}; using Blob-only if available.`,
      );
      return false;
    }
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "number"
        ? (error as { code: number }).code
        : undefined;
    if (code === 404) {
      console.warn(
        `[ShopProfile] Cosmos container not found for shop=${shop}; ensure "${process.env.COSMOS_AGENT_RUNS_CONTAINER?.trim() || "agent_runs"}" exists in Azure.`,
      );
      return false;
    }
    throw error;
  }
}
