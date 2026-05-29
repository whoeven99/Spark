import { listRecentShopVisualJobsForShop } from "../shopVisualJob/shopVisualJobStore.server";
import { SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE } from "../shopVisualJob/types.server";
import type { ShopVisualJobHistoryItem } from "../shopVisualJob/types.server";

export type PictureTranslatePageLoaderData = {
  history: ShopVisualJobHistoryItem[];
};

export async function loadPictureTranslatePageData(
  shop: string,
): Promise<PictureTranslatePageLoaderData> {
  try {
    const history = await listRecentShopVisualJobsForShop({
      shop,
      kind: SHOP_VISUAL_JOB_KIND_PICTURE_TRANSLATE,
    });
    return { history };
  } catch (e) {
    console.error("[PictureTranslate] load history failed", e);
    return { history: [] };
  }
}
