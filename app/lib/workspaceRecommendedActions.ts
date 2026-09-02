/**
 * 首页与对话输入区共用的推荐操作列表。
 *
 * 分组按「做什么」切：经营诊断只读、商品优化与图片生成靠 AI 生成内容、
 * 批量编辑按规则改店铺结构化字段（试算 → 审核 → 写回，Agent 回合内不写）。
 */

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
      {
        key: "seoAudit",
        label: t("workspace.shell.chat.recommend.seoAudit.label"),
        prompt: t("workspace.shell.chat.recommend.seoAudit.prompt"),
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
  const bulkEdit: WorkspaceRecommendedGroup = {
    key: "bulkEdit",
    label: t("workspace.shell.chat.recommend.groupBulkEdit"),
    items: [
      {
        key: "bulkPriceEdit",
        label: t("workspace.shell.chat.recommend.bulkPriceEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkPriceEdit.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkTagEdit",
        label: t("workspace.shell.chat.recommend.bulkTagEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkTagEdit.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkStatusEdit",
        label: t("workspace.shell.chat.recommend.bulkStatusEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkStatusEdit.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkCollectionEdit",
        label: t("workspace.shell.chat.recommend.bulkCollectionEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkCollectionEdit.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkSeoEdit",
        label: t("workspace.shell.chat.recommend.bulkSeoEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkSeoEdit.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkMetafieldEdit",
        label: t("workspace.shell.chat.recommend.bulkMetafieldEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkMetafieldEdit.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkPriceImport",
        label: t("workspace.shell.chat.recommend.bulkPriceImport.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkPriceImport.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkCostImport",
        label: t("workspace.shell.chat.recommend.bulkCostImport.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkCostImport.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "bulkInventoryImport",
        label: t("workspace.shell.chat.recommend.bulkInventoryImport.label"),
        prompt: t(`workspace.shell.chat.recommend.bulkInventoryImport.prompt.${scope}`),
        createsTask: true,
      },
    ],
  };
  return hasProductContext
    ? [productOptimization, bulkEdit, imageGeneration, operations]
    : [operations, productOptimization, bulkEdit, imageGeneration];
}
