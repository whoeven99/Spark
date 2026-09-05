/**
 * POST /api/bulk-tag-edit
 *
 * 批量打标的写回入口，也是本功能唯一会向 Shopify 发 mutation 的地方。
 * 前置条件（全部满足才写）：
 *   1. 任务属于当前店铺、类型为 bulk_tag_edit、状态为 pending_review；
 *   2. 请求体带 confirm: true（用户在审核弹窗点过「确认写回」）；
 *   3. 该任务没有正在进行中的写回。
 */
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import {
  getTaskForShop,
  markTaskAppliedWithResult,
  updateTaskResult,
} from "../server/aiTask/aiTaskStore.server";
import {
  applyBulkTagEdit,
  buildBulkTagEditWritableRows,
} from "../server/bulkTagEdit/bulkTagEditApply.server";
import { coerceBulkTagEditRows } from "../lib/bulkTagEdit";
import type { BulkTagEditApplyResponse } from "../lib/aiTaskTypes";

/** 上一次写回超过这个时长仍未落库时视为已中断，允许重试。 */
const APPLY_STALE_MS = 10 * 60 * 1000;

const bodySchema = z.object({
  taskId: z.string().min(1),
  confirm: z.literal(true),
});

function fail(error: string, status: number) {
  return data<BulkTagEditApplyResponse>({ ok: false, error }, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return fail("Method not allowed", 405);
  }

  const { admin, session } = await authenticate.admin(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("缺少 taskId 或未确认写回", 400);
  }

  const task = await getTaskForShop({ taskId: parsed.data.taskId, shop: session.shop });
  if (!task || task.taskType !== "bulk_tag_edit") {
    return fail("任务不存在", 404);
  }
  if (task.status !== "pending_review") {
    return fail("该任务当前状态不可写回", 409);
  }

  const rawResult = task.result ?? {};
  const applyStartedAt =
    typeof rawResult.applyStartedAt === "string" ? rawResult.applyStartedAt : null;
  if (applyStartedAt) {
    const startedMs = new Date(applyStartedAt).getTime();
    if (Number.isFinite(startedMs) && Date.now() - startedMs < APPLY_STALE_MS) {
      return fail("上一次写回还在进行中，请稍后再试", 409);
    }
  }

  const rows = coerceBulkTagEditRows(rawResult.rows);
  const writableRows = buildBulkTagEditWritableRows(rows);
  if (writableRows.length === 0) {
    return fail("没有可写回的变更", 400);
  }

  // applyStartedAt 只在进行中存在：写回结束后必须移除，否则重试会被误判为「进行中」
  const resultWithoutApplyFlag = { ...rawResult };
  delete resultWithoutApplyFlag.applyStartedAt;

  await updateTaskResult({
    taskId: task.id,
    result: { ...resultWithoutApplyFlag, applyStartedAt: new Date().toISOString() },
  });

  try {
    const outcome = await applyBulkTagEdit({
      admin,
      shop: session.shop,
      rows: writableRows,
    });
    await markTaskAppliedWithResult({
      taskId: task.id,
      result: { ...resultWithoutApplyFlag, apply: outcome },
    });
    return data<BulkTagEditApplyResponse>({
      ok: true,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
    });
  } catch (e) {
    console.error("[api.bulk-tag-edit] apply failed:", e);
    // 保留 pending_review + 清掉进行中标记，用户可修正后重试
    await updateTaskResult({ taskId: task.id, result: resultWithoutApplyFlag });
    return fail(e instanceof Error ? e.message : "写回失败", 500);
  }
};
