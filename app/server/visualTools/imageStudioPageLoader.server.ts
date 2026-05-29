import { listRecentTasksForShop } from "../aiTask/aiTaskStore.server";
import type { AITaskItem } from "../../lib/aiTaskTypes";

export type ImageStudioPageLoaderData = {
  imageGenTasks: AITaskItem[];
  translateTasks: AITaskItem[];
};

export async function loadImageStudioPageData(
  shop: string,
  appName: string,
): Promise<ImageStudioPageLoaderData> {
  try {
    const [imageGenTasks, translateTasks] = await Promise.all([
      listRecentTasksForShop({ shop, appName, taskType: "image_generation" }),
      listRecentTasksForShop({ shop, appName, taskType: "picture_translate" }),
    ]);
    return { imageGenTasks, translateTasks };
  } catch (e) {
    console.error("[ImageStudio] load tasks failed", e);
    return { imageGenTasks: [], translateTasks: [] };
  }
}
