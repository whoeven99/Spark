/**
 * POST /api/inventory-import
 * 库存导入写回入口。写 on_hand，带 compareQuantity。
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
import { applyInventoryImport } from "../server/inventoryImport/inventoryImportApply.server";
import { coerceInventoryImportRows } from "../lib/inventoryCsv";
import type { BulkPriceEditApplyResponse } from "../lib/aiTaskTypes";

const APPLY_STALE_MS = 10 * 60 * 1000;
const bodySchema = z.object({
  taskId: z.string().min(1),
  confirm: z.literal(true),
});

function fail(error: string, status: number) {
  return data<BulkPriceEditApplyResponse>({ ok: false, error }, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return fail("Method not allowed", 405);
  const { admin, session } = await authenticate.admin(request);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Invalid JSON", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("缺少 taskId 或未确认写回", 400);

  const task = await getTaskForShop({ taskId: parsed.data.taskId, shop: session.shop });
  if (!task || task.taskType !== "inventory_import") return fail("任务不存在", 404);
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
  const rows = coerceInventoryImportRows(rawResult.rows).filter((row) => !row.skipped);
  if (rows.length === 0) return fail("没有可写回的变更", 400);
  const resultWithoutApplyFlag = { ...rawResult };
  delete resultWithoutApplyFlag.applyStartedAt;
  await updateTaskResult({
    taskId: task.id,
    result: { ...resultWithoutApplyFlag, applyStartedAt: new Date().toISOString() },
  });
  try {
    const outcome = await applyInventoryImport({
      admin,
      shop: session.shop,
      taskId: task.id,
      rows,
    });
    await markTaskAppliedWithResult({
      taskId: task.id,
      result: { ...resultWithoutApplyFlag, apply: outcome },
    });
    return data<BulkPriceEditApplyResponse>({
      ok: true,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
    });
  } catch (error) {
    console.error("[api.inventory-import] apply failed:", error);
    await updateTaskResult({ taskId: task.id, result: resultWithoutApplyFlag });
    return fail(error instanceof Error ? error.message : "写回失败", 500);
  }
};
