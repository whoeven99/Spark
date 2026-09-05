/**
 * POST /api/bulk-cost-import
 *
 * 成本价导入的写回入口。真正的 mutation 在 `applyBulkCostImport`
 * （全仓库唯一 `inventoryItemUpdate` 调用处），这里只做门禁：
 *   1. 任务属于当前店铺、类型为 bulk_cost_import、状态为 pending_review；
 *   2. 请求体带 confirm: true（用户在审核弹窗点过「确认写回」）；
 *   3. 该任务没有正在进行中的写回。
 *
 * 写回成功后顺带把新成本落到 `ShopSkuCost`，让 Today / ROI 立刻用真实 COGS，
 * 不用等 `ensureSkuCostsFresh` 的 24 小时懒同步。
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
  applyBulkCostImport,
  selectWritableCostRows,
} from "../server/bulkCostImport/bulkCostImportApply.server";
import { upsertSkuCosts } from "../server/operations/roi/skuCostSync.server";
import { coerceBulkCostImportRows } from "../lib/bulkCostImport";
import type { BulkCostImportApplyResponse } from "../lib/aiTaskTypes";

/** 上一次写回超过这个时长仍未落库时视为已中断，允许重试。 */
const APPLY_STALE_MS = 10 * 60 * 1000;

const bodySchema = z.object({
  taskId: z.string().min(1),
  confirm: z.literal(true),
});

function fail(error: string, status: number) {
  return data<BulkCostImportApplyResponse>({ ok: false, error }, { status });
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
  if (!task || task.taskType !== "bulk_cost_import") {
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

  const writableRows = selectWritableCostRows(coerceBulkCostImportRows(rawResult.rows));
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
    const outcome = await applyBulkCostImport({
      admin,
      shop: session.shop,
      rows: writableRows,
    });

    // 只把写成功的行同步进本地成本表；部分失败时不能假装整批都生效了。
    // 这一步失败不该让写回结果丢掉——Shopify 那边已经改完了。
    if (outcome.succeeded > 0) {
      const failedItems = new Set(outcome.errors.map((e) => e.inventoryItemId));
      try {
        await upsertSkuCosts(
          session.shop,
          writableRows
            .filter((row) => !failedItems.has(row.inventoryItemId))
            .map((row) => ({
              inventoryItemId: row.inventoryItemId,
              variantId: row.variantId,
              sku: row.sku,
              unitCost: Number(row.afterCost),
            })),
        );
      } catch (e) {
        console.error("[api.bulk-cost-import] sku cost cache refresh failed:", e);
      }
    }

    await markTaskAppliedWithResult({
      taskId: task.id,
      result: { ...resultWithoutApplyFlag, apply: outcome },
    });
    return data<BulkCostImportApplyResponse>({
      ok: true,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
    });
  } catch (e) {
    console.error("[api.bulk-cost-import] apply failed:", e);
    // 保留 pending_review + 清掉进行中标记，用户可修正后重试
    await updateTaskResult({ taskId: task.id, result: resultWithoutApplyFlag });
    return fail(e instanceof Error ? e.message : "写回失败", 500);
  }
};
