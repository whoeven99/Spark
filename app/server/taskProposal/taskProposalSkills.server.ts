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
  IMAGE_GENERATION_SKILL_ID,
  type TaskProposalExecuteError,
  type TaskProposalTarget,
} from "../../lib/taskProposalPayload";
import { selectModelTypeForLanguagePair } from "../../config/pictureTranslateLanguages";
import { executeImageGenerationRequest } from "../imageGeneration/imageGenerationHttp.server";
import { resolveImageGenerationProvider } from "../imageGeneration/imageGenerationConfig.server";

export const TASK_PROPOSAL_MAX_TARGETS = 20;

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
      if (target.imageUrl) {
        items.push({ productId: target.id, imageUrl: target.imageUrl });
      } else {
        errors.push({ index, targetId: target.id, error: `「${target.title}」无主图，已跳过` });
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
  execute: async ({ shop, params }) => {
    const description = params.description?.trim();
    if (!description) {
      throw new Error("请填写图片描述");
    }
    const result = await executeImageGenerationRequest({
      requestId: `task-proposal-${Date.now()}`,
      sessionShop: shop,
      description,
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

const handlers = new Map<string, TaskProposalSkillHandler>([
  [batchProductImproveHandler.skillId, batchProductImproveHandler],
  [batchPictureTranslateHandler.skillId, batchPictureTranslateHandler],
  [imageGenerationHandler.skillId, imageGenerationHandler],
]);

export function getTaskProposalSkillHandler(
  skillId: string,
): TaskProposalSkillHandler | undefined {
  return handlers.get(skillId);
}
