import { Router } from "express";
import { getShopProfileContainer, isCosmosConfigured } from "../lib/cosmos.js";

export const shopProfileRouter = Router();

export type ShopSizeTier = "超大商店" | "大商店" | "中等商店" | "小商店";

export type ShopSizeProfile = {
  id: string;
  shopName: string;
  type: string;
  largestLanguage: string | null;
  dataBytes: number;
  dataSizeKB: number;
  sizeTier: ShopSizeTier;
  languages: Record<string, { bytes: number; items: number; units: number; updatedAt: string }>;
  updatedAt: string;
};

/**
 * GET /api/shop-profile  → all store-size profiles (id, shopName, tier, bytes…).
 * Used by the translation page to annotate each shop with its size tier.
 */
shopProfileRouter.get("/", async (_req, res) => {
  if (!isCosmosConfigured()) {
    res.json({ profiles: [], note: "Cosmos not configured" });
    return;
  }
  try {
    const container = getShopProfileContainer();
    const { resources } = await container.items
      .query<ShopSizeProfile>(
        "SELECT c.id, c.shopName, c.largestLanguage, c.dataBytes, c.dataSizeKB, c.sizeTier, c.languages, c.updatedAt FROM c WHERE c.type = 'size'",
      )
      .fetchAll();
    res.json({ profiles: resources });
  } catch (err) {
    if (String(err).includes("Owner resource does not exist")) {
      res.json({ profiles: [], note: "shop_profile 容器尚未创建（首个商店初始化后自动建立）" });
      return;
    }
    console.error("[shop-profile]", err);
    res.status(500).json({ error: String(err) });
  }
});

export default shopProfileRouter;
