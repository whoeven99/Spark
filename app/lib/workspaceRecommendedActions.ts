/**
 * 首页与对话输入区共用的推荐操作列表。
 *
 * 分组按「做什么」切：经营诊断只读、商品优化与图片生成靠 AI 生成内容、
 * 导出、导入、库存与规则批量（调价/打标/上下架）分开露出。设置库存开规则卡；导入库存走官方 CSV。
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
        key: "todayPulse",
        label: t("workspace.shell.chat.recommend.todayPulse.label"),
        prompt: t("workspace.shell.chat.recommend.todayTodos.prompt"),
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
  const inventory: WorkspaceRecommendedGroup = {
    key: "inventory",
    label: t("workspace.shell.chat.recommend.groupInventory"),
    items: [
      {
        key: "skuExport",
        label: t("workspace.shell.chat.recommend.skuExport.label"),
        prompt: t(`workspace.shell.chat.recommend.skuExport.prompt.${scope}`),
        createsTask: true,
      },
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
        key: "inventoryQtyEdit",
        label: t("workspace.shell.chat.recommend.inventoryQtyEdit.label"),
        prompt: t(`workspace.shell.chat.recommend.inventoryQtyEdit.prompt.${scope}`),
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
    ],
  };
  return hasProductContext
    ? [productOptimization, productManage, inventory, bulkEdit, imageGeneration, operations]
    : [operations, productOptimization, productManage, inventory, bulkEdit, imageGeneration];
}
