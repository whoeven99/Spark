/**
 * 二次确认写回路由共用骨架。只给商品管理一期新入口用，不改现有调价/打标/上下架路由。
 */
import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../../shopify.server";
import {
  getTaskForShop,
  markTaskAppliedWithResult,
  updateTaskResult,
} from "../aiTask/aiTaskStore.server";
import type { AITaskType } from "../../lib/aiTaskTypes";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";

const APPLY_STALE_MS = 10 * 60 * 1000;
const bodySchema = z.object({
  taskId: z.string().min(1),
  confirm: z.literal(true),
});

export async function runConfirmedCatalogApply(args: {
  request: Request;
  taskType: AITaskType;
  apply: (params: {
    admin: ShopifyAdminGraphqlClient;
    shop: string;
    task: NonNullable<Awaited<ReturnType<typeof getTaskForShop>>>;
    rawResult: Record<string, unknown>;
  }) => Promise<{ succeeded: number; failed: number; extra?: Record<string, unknown> }>;
}): Promise<ReturnType<typeof data>> {
  const fail = (error: string, status: number) =>
    data<{ ok: false; error: string }>({ ok: false, error }, { status });

  if (args.request.method !== "POST") return fail("Method not allowed", 405);

  const { admin, session } = await authenticate.admin(args.request);
  let raw: unknown;
  try {
    raw = await args.request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("缺少 taskId 或未确认写回", 400);

  const task = await getTaskForShop({ taskId: parsed.data.taskId, shop: session.shop });
  if (!task || task.taskType !== args.taskType) return fail("任务不存在", 404);
  if (task.status !== "pending_review") return fail("该任务当前状态不可写回", 409);

  const rawResult = task.result ?? {};
  const applyStartedAt =
    typeof rawResult.applyStartedAt === "string" ? rawResult.applyStartedAt : null;
  if (applyStartedAt) {
    const startedMs = new Date(applyStartedAt).getTime();
    if (Number.isFinite(startedMs) && Date.now() - startedMs < APPLY_STALE_MS) {
      return fail("上一次写回还在进行中，请稍后再试", 409);
    }
  }

  const resultWithoutApplyFlag = { ...rawResult };
  delete resultWithoutApplyFlag.applyStartedAt;
  await updateTaskResult({
    taskId: task.id,
    result: { ...resultWithoutApplyFlag, applyStartedAt: new Date().toISOString() },
  });

  try {
    const outcome = await args.apply({
      admin,
      shop: session.shop,
      task,
      rawResult: resultWithoutApplyFlag,
    });
    await markTaskAppliedWithResult({
      taskId: task.id,
      result: {
        ...resultWithoutApplyFlag,
        apply: { at: new Date().toISOString(), ...outcome.extra, succeeded: outcome.succeeded, failed: outcome.failed },
      },
    });
    return data({ ok: true, succeeded: outcome.succeeded, failed: outcome.failed });
  } catch (error) {
    console.error(`[api.${args.taskType}] apply failed:`, error);
    await updateTaskResult({ taskId: task.id, result: resultWithoutApplyFlag });
    return fail(error instanceof Error ? error.message : "写回失败", 500);
  }
}
