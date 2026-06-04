import { listTasksPageForShop } from "../aiTask/aiTaskStore.server";
import type { AITaskListPageData } from "../../lib/aiTaskTypes";

export type ImageStudioPageLoaderData = {
  initialTaskPage: AITaskListPageData;
};

export async function loadImageStudioPageData(
  shop: string,
  appName: string,
): Promise<ImageStudioPageLoaderData> {
  try {
    const initialTaskPage = await listTasksPageForShop({
      shop,
      appName,
      view: "current",
      taskTypes: ["image_generation", "picture_translate"],
    });
    return { initialTaskPage };
  } catch (e) {
    console.error("[ImageStudio] load tasks failed", e);
    return {
      initialTaskPage: {
        tasks: [],
        view: "current",
        page: 1,
        pageSize: 8,
        totalCount: 0,
        totalPages: 1,
        metrics: {
          currentCount: 0,
          historyCount: 0,
          runningCount: 0,
          totalCount: 0,
        },
      },
    };
  }
}
