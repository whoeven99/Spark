import { listTasksPageForShop } from "../aiTask/aiTaskStore.server";
import { getEstimatedSeconds, getEstimatedCredits } from "../aiTask/aiTaskEstimation.server";
import type { AITaskListPageData } from "../../lib/aiTaskTypes";

export type TaskTypeEstimation = {
  seconds: number | null;
  credits: number;
};

export type ImageStudioPageLoaderData = {
  initialTaskPage: AITaskListPageData;
  estimations: {
    generate: TaskTypeEstimation;
    translate: TaskTypeEstimation;
  };
};

const FALLBACK_PAGE_DATA: AITaskListPageData = {
  tasks: [],
  view: "current",
  page: 1,
  pageSize: 4,
  totalCount: 0,
  totalPages: 1,
  metrics: { currentCount: 0, historyCount: 0, runningCount: 0, totalCount: 0 },
};

export async function loadImageStudioPageData(
  shop: string,
  appName: string,
): Promise<ImageStudioPageLoaderData> {
  const [
    initialTaskPage,
    genSeconds,
    genCredits,
    transSeconds,
    transCredits,
  ] = await Promise.all([
    listTasksPageForShop({
      shop,
      appName,
      view: "current",
      taskTypes: ["image_generation", "picture_translate"],
    }).catch((e) => {
      console.error("[ImageStudio] load tasks failed", e);
      return FALLBACK_PAGE_DATA;
    }),
    getEstimatedSeconds(appName, "image_generation"),
    getEstimatedCredits(appName, "image_generation"),
    getEstimatedSeconds(appName, "picture_translate"),
    getEstimatedCredits(appName, "picture_translate"),
  ]);

  return {
    initialTaskPage,
    estimations: {
      generate: { seconds: genSeconds, credits: genCredits },
      translate: { seconds: transSeconds, credits: transCredits },
    },
  };
}
