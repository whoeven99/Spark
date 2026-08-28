/** 首页与对话输入区共用的推荐操作列表（经营诊断 / 商品优化 / 图片生成）。 */

export type WorkspaceRecommendScope = "shop" | "selected";

export type WorkspaceRecommendedAction = {
  key: string;
  label: string;
  prompt: string;
  createsTask?: boolean;
};

export type WorkspaceRecommendedGroup = {
  key: string;
  label: string;
  items: WorkspaceRecommendedAction[];
};

type TranslateFn = (key: string) => string;

/**
 * 构建推荐操作分组。有商品上下文时商品优化排前，且文案切到「已选商品」口径。
 */
export function buildWorkspaceRecommendedGroups(
  t: TranslateFn,
  hasProductContext = false,
): WorkspaceRecommendedGroup[] {
  const scope: WorkspaceRecommendScope = hasProductContext ? "selected" : "shop";
  const operations: WorkspaceRecommendedGroup = {
    key: "operations",
    label: t("workspace.shell.chat.recommend.groupOperations"),
    items: [
      {
        key: "todayOverview",
        label: t("workspace.shell.chat.recommend.todayOverview.label"),
        prompt: t("workspace.shell.chat.recommend.todayOverview.prompt"),
      },
      {
        key: "todayTodos",
        label: t("workspace.shell.chat.recommend.todayTodos.label"),
        prompt: t("workspace.shell.chat.recommend.todayTodos.prompt"),
      },
      {
        key: "inventoryHealth",
        label: t("workspace.shell.chat.recommend.inventoryHealth.label"),
        prompt: t("workspace.shell.chat.recommend.inventoryHealth.prompt"),
      },
      {
        key: "abandonRefund",
        label: t("workspace.shell.chat.recommend.abandonRefund.label"),
        prompt: t("workspace.shell.chat.recommend.abandonRefund.prompt"),
      },
    ],
  };
  const productOptimization: WorkspaceRecommendedGroup = {
    key: "productOptimization",
    label: t("workspace.shell.chat.recommend.groupProduct"),
    items: [
      {
        key: "qualityScore",
        label: t("workspace.shell.chat.recommend.qualityScore.label"),
        prompt: t(`workspace.shell.chat.recommend.qualityScore.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "optimizeCopy",
        label: t("workspace.shell.chat.recommend.optimizeCopy.label"),
        prompt: t(`workspace.shell.chat.recommend.optimizeCopy.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "translateImage",
        label: t("workspace.shell.chat.recommend.translateImage.label"),
        prompt: t(`workspace.shell.chat.recommend.translateImage.prompt.${scope}`),
        createsTask: true,
      },
    ],
  };
  const imageGeneration: WorkspaceRecommendedGroup = {
    key: "imageGeneration",
    label: t("workspace.shell.chat.recommend.groupImage"),
    items: [
      {
        key: "generateImage",
        label: t("workspace.shell.chat.recommend.generateImage.label"),
        prompt: t("workspace.shell.chat.recommend.generateImage.prompt"),
        createsTask: true,
      },
    ],
  };
  return hasProductContext
    ? [productOptimization, imageGeneration, operations]
    : [operations, productOptimization, imageGeneration];
}
