import { listRecentGeneratedImageJobsForShop } from "./imageGenerationJobStore.server";
import type { ImageGenerationHistoryItem } from "./types";

export type GenerateImagePageLoaderData = {
  history: ImageGenerationHistoryItem[];
};

export async function loadGenerateImagePageData(
  shop: string,
): Promise<GenerateImagePageLoaderData> {
  try {
    const history = await listRecentGeneratedImageJobsForShop(shop);
    return { history };
  } catch (e) {
    console.error("[ImageGeneration] load history failed", e);
    return { history: [] };
  }
}
