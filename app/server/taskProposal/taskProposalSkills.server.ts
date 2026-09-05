/**
 * TaskProposal 可执行 Skill 注册表。
 *
 * 每个条目声明：估算（接分桶 EWMA 估算层）+ 执行（接共享任务创建模块）。
 * /api/task-proposal 按 skillId 路由到这里；新增可确认执行的 Skill 时在此注册，
 * 前端 TaskProposalCard 无需任何改动。
 *
 * 阶段 1 仅注册 batch_product_improve；picture_translate / translation 等在阶段 4 迁入。
 */
import {
  getEstimatedCredits,
  getEstimatedSeconds,
} from "../aiTask/aiTaskEstimation.server";
import { deriveBucket } from "../aiTask/estimationBucket";
import {
  createPictureTranslateBatchTasks,
  createProductImproveBatchTasks,
} from "../aiTask/batchTaskCreate.server";
import { requireBillingAccess } from "../billing/index.server";
import { requireVisualToolBillingAccess } from "../tokenUsage/index.server";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  BULK_COST_IMPORT_SKILL_ID,
  BULK_PRICE_EDIT_SKILL_ID,
  BULK_PRICE_IMPORT_SKILL_ID,
  BULK_SEO_EDIT_SKILL_ID,
  BULK_STATUS_EDIT_SKILL_ID,
  BULK_COLLECTION_EDIT_SKILL_ID,
  BULK_TAG_EDIT_SKILL_ID,
  IMAGE_GENERATION_SKILL_ID,
  type TaskProposalExecuteError,
  type TaskProposalTarget,
} from "../../lib/taskProposalPayload";
import {
  BULK_PRICE_EDIT_MAX_PRODUCTS,
  BulkPriceEditRuleError,
  parseBulkPriceEditRule,
} from "../../lib/bulkPriceEdit";
import {
  BULK_TAG_EDIT_MAX_PRODUCTS,
  BulkTagEditRuleError,
  parseBulkTagEditRule,
} from "../../lib/bulkTagEdit";
import {
  BULK_STATUS_EDIT_MAX_PRODUCTS,
  BulkStatusEditRuleError,
  parseBulkStatusEditRule,
} from "../../lib/bulkStatusEdit";
import {
  BULK_COLLECTION_EDIT_MAX_PRODUCTS,
  BulkCollectionEditRuleError,
  parseBulkCollectionEditRule,
} from "../../lib/bulkCollectionEdit";
import { createBatchWithTask } from "../aiTask/aiTaskStore.server";
import { enqueueBulkPriceEditDryRun } from "../bulkPriceEdit/bulkPriceEditDryRun.server";
import {
  BULK_SEO_EDIT_MAX_PRODUCTS,
  BulkSeoEditRuleError,
  parseBulkSeoEditRule,
} from "../../lib/bulkSeoEdit";
import { parseBulkPriceImportMapping } from "../../lib/bulkPriceImport";
import { parseBulkCostImportMapping } from "../../lib/bulkCostImport";
import { SheetImportMappingError } from "../../lib/sheetImport";
import { enqueueBulkTagEditDryRun } from "../bulkTagEdit/bulkTagEditDryRun.server";
import { enqueueBulkStatusEditDryRun } from "../bulkStatusEdit/bulkStatusEditDryRun.server";
import { enqueueBulkCollectionEditDryRun } from "../bulkCollectionEdit/bulkCollectionEditDryRun.server";
import { enqueueBulkSeoEditDryRun } from "../bulkSeoEdit/bulkSeoEditDryRun.server";
import { enqueueBulkPriceImportDryRun } from "../bulkPriceImport/bulkPriceImportDryRun.server";
import { enqueueBulkCostImportDryRun } from "../bulkCostImport/bulkCostImportDryRun.server";
import { selectModelTypeForLanguagePair } from "../../config/pictureTranslateLanguages";
import { executeImageGenerationRequest } from "../imageGeneration/imageGenerationHttp.server";
import { resolveImageGenerationProvider } from "../imageGeneration/imageGenerationConfig.server";

/**
 * 单次执行的默认对象上限（逐对象建任务的技能沿用它）。
 * 批量调价这类「一个任务覆盖一批对象」的技能用 handler.maxTargets 单独放宽。
 */
export const TASK_PROPOSAL_MAX_TARGETS = 20;

/** 请求体的硬上限，取所有 handler 的最大值；具体限制仍按 handler 判定。 */
export const TASK_PROPOSAL_TARGETS_HARD_CEILING = Math.max(
  TASK_PROPOSAL_MAX_TARGETS,
  BULK_PRICE_EDIT_MAX_PRODUCTS,
  BULK_TAG_EDIT_MAX_PRODUCTS,
  BULK_STATUS_EDIT_MAX_PRODUCTS,
  BULK_COLLECTION_EDIT_MAX_PRODUCTS,
  BULK_SEO_EDIT_MAX_PRODUCTS,
);

export function resolveTaskProposalMaxTargets(
  handler: Pick<TaskProposalSkillHandler, "maxTargets">,
): number {
  return handler.maxTargets ?? TASK_PROPOSAL_MAX_TARGETS;
}

/** 计费不通过：端点映射为 402 + 本地化文案。 */
export class TaskProposalBillingError extends Error {
  constructor() {
    super("billing access denied");
    this.name = "TaskProposalBillingError";
  }
}

export type TaskProposalEstimateResult = {
  perItemCredits: number | null;
  perItemSeconds: number | null;
};

export type TaskProposalExecuteResult = {
  taskIds: string[];
  errors: TaskProposalExecuteError[];
};

export type TaskProposalSkillHandler = {
  skillId: string;
  /** 无目标对象技能（targets.kind === "none"）：允许 targets 为空直接执行 */
  allowEmptyTargets?: boolean;
  /** 覆盖默认对象上限（仅「一个任务覆盖多对象」的技能需要） */
  maxTargets?: number;
  estimate: (args: { params: Record<string, string> }) => Promise<TaskProposalEstimateResult>;
  execute: (args: {
    admin: ShopifyAdminGraphqlClient;
    shop: string;
    locale: string;
    t: (key: string, options?: Record<string, unknown>) => string;
    params: Record<string, string>;
    targets: TaskProposalTarget[];
  }) => Promise<TaskProposalExecuteResult>;
};

const batchProductImproveHandler: TaskProposalSkillHandler = {
  skillId: BATCH_PRODUCT_IMPROVE_SKILL_ID,
  // 提案阶段不知道每个商品的文本长度（精确桶在创建任务时才派生），用 default 聚合桶估算。
  estimate: async () => {
    const [credits, seconds] = await Promise.all([
      getEstimatedCredits("product_improve"),
      getEstimatedSeconds("product_improve"),
    ]);
    return {
      // product_improve 冷启动默认 0，视为「暂无数据」
      perItemCredits: credits > 0 ? credits : null,
      perItemSeconds: seconds,
    };
  },
  execute: async ({ admin, shop, locale, t, params, targets }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }
    const targetLanguage = params.targetLanguage?.trim() || "en";
    const result = await createProductImproveBatchTasks({
      admin,
      shop,
      locale,
      targetLanguage,
      productIds: targets.map((target) => target.id),
      productNotFoundMessage: t("productImproveStage1.serverProductNotFound"),
      defaultBrandStyle: t("productImproveStage1.defaultBrandStyle"),
    });
    return {
      taskIds: result.taskIds,
      errors: result.errors.map((e) => ({
        index: e.index,
        targetId: e.productId,
        error: e.error,
      })),
    };
  },
};

const batchPictureTranslateHandler: TaskProposalSkillHandler = {
  skillId: BATCH_PICTURE_TRANSLATE_SKILL_ID,
  // 桶按语言对推导出的 modelType 区分（volc / aidge 成本差异大）
  estimate: async ({ params }) => {
    const modelType = selectModelTypeForLanguagePair(
      params.sourceLanguage?.trim() || "auto",
      params.targetLanguage?.trim() || "zh",
    );
    const bucket = deriveBucket("picture_translate", { modelType });
    const [credits, seconds] = await Promise.all([
      getEstimatedCredits("picture_translate", bucket),
      getEstimatedSeconds("picture_translate", bucket),
    ]);
    return {
      perItemCredits: credits > 0 ? credits : null,
      perItemSeconds: seconds,
    };
  },
  execute: async ({ shop, params, targets }) => {
    try {
      await requireVisualToolBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }
    const sourceCode = params.sourceLanguage?.trim() || "auto";
    const targetCode = params.targetLanguage?.trim() || "zh";
    const modelType = selectModelTypeForLanguagePair(sourceCode, targetCode);

    // 无主图的目标直接报为 per-item 错误（卡片端已默认不勾选，这里兜底）
    const errors: TaskProposalExecuteError[] = [];
    const items: Array<{ productId: string; imageUrl: string }> = [];
    targets.forEach((target, index) => {
      const productId = target.productId?.trim() || target.id;
      if (target.imageUrl) {
        items.push({ productId, imageUrl: target.imageUrl });
      } else {
        errors.push({ index, targetId: productId, error: `「${target.title}」无主图，已跳过` });
      }
    });
    if (items.length === 0) {
      return { taskIds: [], errors };
    }

    const result = await createPictureTranslateBatchTasks({
      shop,
      sourceCode,
      targetCode,
      modelType,
      items,
    });
    return {
      taskIds: result.taskIds,
      errors: [
        ...errors,
        ...result.errors.map((e) => ({
          index: e.index,
          targetId: e.productId,
          error: e.error,
        })),
      ],
    };
  },
};

const imageGenerationHandler: TaskProposalSkillHandler = {
  skillId: IMAGE_GENERATION_SKILL_ID,
  allowEmptyTargets: true,
  estimate: async () => {
    const imageProvider = resolveImageGenerationProvider() ?? "openai";
    const bucket = deriveBucket("image_generation", { imageProvider });
    const [credits, seconds] = await Promise.all([
      getEstimatedCredits("image_generation", bucket),
      getEstimatedSeconds("image_generation", bucket),
    ]);
    return {
      perItemCredits: credits > 0 ? credits : null,
      perItemSeconds: seconds,
    };
  },
  // 计费校验由 executeImageGenerationRequest 内部完成（402 → BillingError）
  execute: async ({ shop, params, targets }) => {
    const description = params.description?.trim();
    if (!description) {
      throw new Error("请填写图片描述");
    }
    const result = await executeImageGenerationRequest({
      requestId: `task-proposal-${Date.now()}`,
      sessionShop: shop,
      description,
      productId: targets[0]?.id?.trim() || params.productId?.trim() || undefined,
    });
    if (result.status === 402) {
      throw new TaskProposalBillingError();
    }
    if (!result.body.success) {
      throw new Error(result.body.errorMsg || "图片生成任务创建失败");
    }
    return { taskIds: [result.body.taskId], errors: [] };
  },
};

const bulkPriceEditHandler: TaskProposalSkillHandler = {
  skillId: BULK_PRICE_EDIT_SKILL_ID,
  maxTargets: BULK_PRICE_EDIT_MAX_PRODUCTS,
  // dry-run 只读 Shopify、不调模型，没有积分成本；时长由 EWMA 校准后再展示
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params, targets }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    let rule;
    try {
      rule = parseBulkPriceEditRule(params);
    } catch (e) {
      // 规则非法直接报错，不建任务：错的价格规则不值得留一条待审核记录
      throw e instanceof BulkPriceEditRuleError ? new Error(e.message) : e;
    }

    const productIds = Array.from(
      new Set(targets.map((target) => target.productId?.trim() || target.id.trim())),
    ).filter(Boolean);
    if (productIds.length === 0) {
      throw new Error("请先选择要调价的商品");
    }

    const config = { ...rule, productIds, totalProducts: productIds.length };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_price_edit",
      batchConfig: { ...rule, totalProducts: productIds.length },
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkPriceEditDryRun({ taskId, shop, locale, productIds, rule });
    return { taskIds: [taskId], errors: [] };
  },
};

const bulkTagEditHandler: TaskProposalSkillHandler = {
  skillId: BULK_TAG_EDIT_SKILL_ID,
  maxTargets: BULK_TAG_EDIT_MAX_PRODUCTS,
  // dry-run 只读 Shopify、不调模型，没有积分成本；时长由 EWMA 校准后再展示
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params, targets }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    let rule;
    try {
      rule = parseBulkTagEditRule(params);
    } catch (e) {
      // 规则非法直接报错，不建任务：错的标签规则不值得留一条待审核记录
      throw e instanceof BulkTagEditRuleError ? new Error(e.message) : e;
    }

    const productIds = Array.from(
      new Set(targets.map((target) => target.productId?.trim() || target.id.trim())),
    ).filter(Boolean);
    if (productIds.length === 0) {
      throw new Error("请先选择要修改标签的商品");
    }

    const config = { ...rule, productIds, totalProducts: productIds.length };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_tag_edit",
      batchConfig: { ...rule, totalProducts: productIds.length },
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkTagEditDryRun({ taskId, shop, locale, productIds, rule });
    return { taskIds: [taskId], errors: [] };
  },
};

const bulkStatusEditHandler: TaskProposalSkillHandler = {
  skillId: BULK_STATUS_EDIT_SKILL_ID,
  maxTargets: BULK_STATUS_EDIT_MAX_PRODUCTS,
  // dry-run 只读 Shopify、不调模型，没有积分成本；时长由 EWMA 校准后再展示
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params, targets }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    let rule;
    try {
      rule = parseBulkStatusEditRule(params);
    } catch (e) {
      // 没选上架 / 下架方向就直接报错，不建任务：方向猜错等于整批商品下线
      throw e instanceof BulkStatusEditRuleError ? new Error(e.message) : e;
    }

    const productIds = Array.from(
      new Set(targets.map((target) => target.productId?.trim() || target.id.trim())),
    ).filter(Boolean);
    if (productIds.length === 0) {
      throw new Error("请先选择要上下架的商品");
    }

    const config = { ...rule, productIds, totalProducts: productIds.length };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_status_edit",
      batchConfig: { ...rule, totalProducts: productIds.length },
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkStatusEditDryRun({ taskId, shop, locale, productIds, rule });
    return { taskIds: [taskId], errors: [] };
  },
};

const bulkCollectionEditHandler: TaskProposalSkillHandler = {
  skillId: BULK_COLLECTION_EDIT_SKILL_ID,
  maxTargets: BULK_COLLECTION_EDIT_MAX_PRODUCTS,
  // dry-run 只读 Shopify、不调模型，没有积分成本；时长由 EWMA 校准后再展示
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params, targets }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    let rule;
    try {
      rule = parseBulkCollectionEditRule(params);
    } catch (e) {
      // 方向或目标合集没选就直接报错，不建任务：两者都猜不得
      throw e instanceof BulkCollectionEditRuleError ? new Error(e.message) : e;
    }

    const productIds = Array.from(
      new Set(targets.map((target) => target.productId?.trim() || target.id.trim())),
    ).filter(Boolean);
    if (productIds.length === 0) {
      throw new Error("请先选择要调整合集归属的商品");
    }

    const config = { ...rule, productIds, totalProducts: productIds.length };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_collection_edit",
      batchConfig: { ...rule, totalProducts: productIds.length },
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkCollectionEditDryRun({ taskId, shop, locale, productIds, rule });
    return { taskIds: [taskId], errors: [] };
  },
};

const bulkSeoEditHandler: TaskProposalSkillHandler = {
  skillId: BULK_SEO_EDIT_SKILL_ID,
  maxTargets: BULK_SEO_EDIT_MAX_PRODUCTS,
  // dry-run 只读 Shopify、模板渲染是确定性的，没有积分成本
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params, targets }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    let rule;
    try {
      rule = parseBulkSeoEditRule(params);
    } catch (e) {
      // 模板非法直接报错，不建任务：占位符写错的模板不值得留一条待审核记录
      throw e instanceof BulkSeoEditRuleError ? new Error(e.message) : e;
    }

    const productIds = Array.from(
      new Set(targets.map((target) => target.productId?.trim() || target.id.trim())),
    ).filter(Boolean);
    if (productIds.length === 0) {
      throw new Error("请先选择要改 SEO 的商品");
    }

    const config = { ...rule, productIds, totalProducts: productIds.length };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_seo_edit",
      batchConfig: { ...rule, totalProducts: productIds.length },
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkSeoEditDryRun({ taskId, shop, locale, productIds, rule });
    return { taskIds: [taskId], errors: [] };
  },
};

const bulkPriceImportHandler: TaskProposalSkillHandler = {
  skillId: BULK_PRICE_IMPORT_SKILL_ID,
  // 商品来自上传的表格而不是用户预选，targets 恒为空
  allowEmptyTargets: true,
  // dry-run 只读 Shopify、不调模型，没有积分成本
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    const fileId = (params.fileId ?? "").trim();
    if (!fileId) {
      throw new Error("请先上传要导入的价目表");
    }

    let mapping;
    try {
      mapping = parseBulkPriceImportMapping(params);
    } catch (e) {
      // 列映射不完整直接报错，不建任务：没有 SKU / 价格列就跑不出任何有意义的结果
      throw e instanceof SheetImportMappingError ? new Error(e.message) : e;
    }

    const fileName = (params.fileName ?? "").trim();
    const config = { fileId, fileName, ...mapping };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_price_import",
      batchConfig: config,
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkPriceImportDryRun({ taskId, shop, locale, fileId, mapping });
    return { taskIds: [taskId], errors: [] };
  },
};

const bulkCostImportHandler: TaskProposalSkillHandler = {
  skillId: BULK_COST_IMPORT_SKILL_ID,
  // 商品来自上传的表格而不是用户预选，targets 恒为空
  allowEmptyTargets: true,
  // dry-run 只读 Shopify、不调模型，没有积分成本
  estimate: async () => ({ perItemCredits: null, perItemSeconds: null }),
  execute: async ({ shop, locale, params }) => {
    try {
      await requireBillingAccess(shop);
    } catch {
      throw new TaskProposalBillingError();
    }

    const fileId = (params.fileId ?? "").trim();
    if (!fileId) {
      throw new Error("请先上传要导入的成本表");
    }

    let mapping;
    try {
      mapping = parseBulkCostImportMapping(params);
    } catch (e) {
      // 列映射不完整直接报错，不建任务：没有 SKU / 成本列就跑不出任何有意义的结果
      throw e instanceof SheetImportMappingError ? new Error(e.message) : e;
    }

    const fileName = (params.fileName ?? "").trim();
    const config = { fileId, fileName, ...mapping };
    const { taskId } = await createBatchWithTask({
      shop,
      taskType: "bulk_cost_import",
      batchConfig: config,
      taskConfig: config,
      estimatedCredits: 0,
    });
    enqueueBulkCostImportDryRun({ taskId, shop, locale, fileId, mapping });
    return { taskIds: [taskId], errors: [] };
  },
};

const handlers = new Map<string, TaskProposalSkillHandler>([
  [batchProductImproveHandler.skillId, batchProductImproveHandler],
  [batchPictureTranslateHandler.skillId, batchPictureTranslateHandler],
  [imageGenerationHandler.skillId, imageGenerationHandler],
  [bulkPriceEditHandler.skillId, bulkPriceEditHandler],
  [bulkTagEditHandler.skillId, bulkTagEditHandler],
  [bulkStatusEditHandler.skillId, bulkStatusEditHandler],
  [bulkCollectionEditHandler.skillId, bulkCollectionEditHandler],
  [bulkSeoEditHandler.skillId, bulkSeoEditHandler],
  [bulkPriceImportHandler.skillId, bulkPriceImportHandler],
  [bulkCostImportHandler.skillId, bulkCostImportHandler],
]);

export function getTaskProposalSkillHandler(
  skillId: string,
): TaskProposalSkillHandler | undefined {
  return handlers.get(skillId);
}
