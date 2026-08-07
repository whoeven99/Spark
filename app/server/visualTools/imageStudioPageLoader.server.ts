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
  /** 当前店铺域名，供 ImageSwitcherBanner 生成主题编辑器链接。 */
  shop: string;
  /** IMAGE_SWITCHER_APP_EMBED_ID 环境变量值，未配置时为 null。 */
  appEmbedId: string | null;
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
  appEmbedId: string | null,
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
      view: "current",
      taskTypes: ["image_generation", "picture_translate"],
    }).catch((e) => {
      console.error("[ImageStudio] load tasks failed", e);
      return FALLBACK_PAGE_DATA;
    }),
    getEstimatedSeconds("image_generation"),
    getEstimatedCredits("image_generation"),
    getEstimatedSeconds("picture_translate"),
    getEstimatedCredits("picture_translate"),
  ]);

  return {
    initialTaskPage,
    estimations: {
      generate: { seconds: genSeconds, credits: genCredits },
      translate: { seconds: transSeconds, credits: transCredits },
    },
    shop,
    appEmbedId,
  };
}
