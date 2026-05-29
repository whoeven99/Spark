import { listRecentShopVisualJobsForShop } from "../shopVisualJob/shopVisualJobStore.server";
import {
  SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION,
  SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE,
} from "../shopVisualJob/kinds.server";
import type { ShopVisualJobHistoryItem } from "../../lib/shopVisualJobTypes";

export type ImageStudioPageLoaderData = {
  imageHistory: ShopVisualJobHistoryItem[];
  translateHistory: ShopVisualJobHistoryItem[];
};

export async function loadImageStudioPageData(
  shop: string,
): Promise<ImageStudioPageLoaderData> {
  try {
    const [imageHistory, translateHistory] = await Promise.all([
      listRecentShopVisualJobsForShop({
        shop,
        kind: SHOP_VISUAL_JOB_KIND_IMAGE_GENERATION,
      }),
      listRecentShopVisualJobsForShop({
        shop,
        kind: SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE,
      }),
    ]);
    return { imageHistory, translateHistory };
  } catch (e) {
    console.error("[ImageStudio] load history failed", e);
    return { imageHistory: [], translateHistory: [] };
  }
}
