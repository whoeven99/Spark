import { listRecentShopVisualJobsForShop } from "../shopVisualJob/shopVisualJobStore.server";
import { SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION } from "../shopVisualJob/types.server";
import type { ShopVisualJobHistoryItem } from "../shopVisualJob/types.server";

export type GenerateImagePageLoaderData = {
  history: ShopVisualJobHistoryItem[];
};

export async function loadGenerateImagePageData(
  shop: string,
): Promise<GenerateImagePageLoaderData> {
  try {
    const history = await listRecentShopVisualJobsForShop({
      shop,
      kind: SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION,
    });
    return { history };
  } catch (e) {
    console.error("[ImageGeneration] load history failed", e);
    return { history: [] };
  }
}
