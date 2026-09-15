/**
 * 首页与对话输入区共用的推荐操作列表。
 *
 * 分组按「做什么」切：经营诊断只读、商品优化与图片生成靠 AI 生成内容、
 * 批量改价/标签/状态/字段/合集/复制/归档/成本/Handle/Metafield/删除都走「导入商品」；
 * 库存数量走独立的「库存与 SKU」组（Wave 1：导出/导入/设置/增减/清零）。
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
  const productManage: WorkspaceRecommendedGroup = {
    key: "productManage",
    label: t("workspace.shell.chat.recommend.groupProductManage"),
    items: [
      {
        key: "productExport",
        label: t("workspace.shell.chat.recommend.productExport.label"),
        prompt: t(`workspace.shell.chat.recommend.productExport.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "productImport",
        label: t("workspace.shell.chat.recommend.productImport.label"),
        prompt: t(`workspace.shell.chat.recommend.productImport.prompt.${scope}`),
        createsTask: true,
      },
    ],
  };
  const inventorySku: WorkspaceRecommendedGroup = {
    key: "inventorySku",
    label: t("workspace.shell.chat.recommend.groupInventorySku"),
    items: [
      {
        key: "inventoryExport",
        label: t("workspace.shell.chat.recommend.inventoryExport.label"),
        prompt: t(`workspace.shell.chat.recommend.inventoryExport.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "inventoryImport",
        label: t("workspace.shell.chat.recommend.inventoryImport.label"),
        prompt: t(`workspace.shell.chat.recommend.inventoryImport.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "inventorySet",
        label: t("workspace.shell.chat.recommend.inventorySet.label"),
        prompt: t(`workspace.shell.chat.recommend.inventorySet.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "inventoryAdjust",
        label: t("workspace.shell.chat.recommend.inventoryAdjust.label"),
        prompt: t(`workspace.shell.chat.recommend.inventoryAdjust.prompt.${scope}`),
        createsTask: true,
      },
      {
        key: "inventoryZero",
        label: t("workspace.shell.chat.recommend.inventoryZero.label"),
        prompt: t(`workspace.shell.chat.recommend.inventoryZero.prompt.${scope}`),
        createsTask: true,
      },
    ],
  };
  return hasProductContext
    ? [productOptimization, productManage, inventorySku, imageGeneration, operations]
    : [operations, productOptimization, productManage, inventorySku, imageGeneration];
}
