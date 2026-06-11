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
import { createProductImproveBatchTasks } from "../aiTask/batchTaskCreate.server";
import { requireBillingAccess } from "../billing/index.server";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  type TaskProposalExecuteError,
  type TaskProposalTarget,
} from "../../lib/taskProposalPayload";

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

const handlers = new Map<string, TaskProposalSkillHandler>([
  [batchProductImproveHandler.skillId, batchProductImproveHandler],
]);

export function getTaskProposalSkillHandler(
  skillId: string,
): TaskProposalSkillHandler | undefined {
  return handlers.get(skillId);
}
