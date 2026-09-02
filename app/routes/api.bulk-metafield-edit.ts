/**
 * POST /api/bulk-metafield-edit
 *
 * 批量 Metafield 改写的写回入口，也是本功能唯一会向 Shopify 发 mutation 的地方。
 * 前置条件（全部满足才写）：
 *   1. 任务属于当前店铺、类型为 bulk_metafield_edit、状态为 pending_review；
 *   2. 请求体带 confirm: true（用户在审核弹窗点过「确认写回」）；
 *   3. 试算结果里有完整的字段标识（namespace / key / type）与动作；
 *   4. 该任务没有正在进行中的写回。
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
  applyBulkMetafieldEdit,
  selectWritableMetafieldRows,
} from "../server/bulkMetafieldEdit/bulkMetafieldEditApply.server";
import { coerceBulkMetafieldEditRows } from "../lib/bulkMetafieldEdit";
import type {
  BulkMetafieldEditApplyResponse,
  BulkMetafieldEditTaskResult,
} from "../lib/aiTaskTypes";

/** 上一次写回超过这个时长仍未落库时视为已中断，允许重试。 */
const APPLY_STALE_MS = 10 * 60 * 1000;

const bodySchema = z.object({
  taskId: z.string().min(1),
  confirm: z.literal(true),
});

function fail(error: string, status: number) {
  return data<BulkMetafieldEditApplyResponse>({ ok: false, error }, { status });
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
  if (!task || task.taskType !== "bulk_metafield_edit") {
    return fail("任务不存在", 404);
  }
  if (task.status !== "pending_review") {
    return fail("该任务当前状态不可写回", 409);
  }

  const rawResult = (task.result ?? {}) as Partial<BulkMetafieldEditTaskResult> &
    Record<string, unknown>;
  const applyStartedAt =
    typeof rawResult.applyStartedAt === "string" ? rawResult.applyStartedAt : null;
  if (applyStartedAt) {
    const startedMs = new Date(applyStartedAt).getTime();
    if (Number.isFinite(startedMs) && Date.now() - startedMs < APPLY_STALE_MS) {
      return fail("上一次写回还在进行中，请稍后再试", 409);
    }
  }

  const action = rawResult.action;
  const namespace = typeof rawResult.namespace === "string" ? rawResult.namespace.trim() : "";
  const key = typeof rawResult.key === "string" ? rawResult.key.trim() : "";
  const fieldType = typeof rawResult.fieldType === "string" ? rawResult.fieldType.trim() : "";
  if ((action !== "set" && action !== "clear") || !namespace || !key || !fieldType) {
    // 试算结果不完整就无从确定要写哪个字段，宁可报错也不猜
    return fail("试算结果缺少字段信息，请重新试算", 400);
  }

  const rows = coerceBulkMetafieldEditRows(rawResult.rows);
  const writableRows = selectWritableMetafieldRows(rows, action);
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
    const outcome = await applyBulkMetafieldEdit({
      admin,
      shop: session.shop,
      context: { action, namespace, key, type: fieldType },
      rows: writableRows,
    });
    await markTaskAppliedWithResult({
      taskId: task.id,
      result: { ...resultWithoutApplyFlag, apply: outcome },
    });
    return data<BulkMetafieldEditApplyResponse>({
      ok: true,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
    });
  } catch (e) {
    console.error("[api.bulk-metafield-edit] apply failed:", e);
    // 保留 pending_review + 清掉进行中标记，用户可修正后重试
    await updateTaskResult({ taskId: task.id, result: resultWithoutApplyFlag });
    return fail(e instanceof Error ? e.message : "写回失败", 500);
  }
};
