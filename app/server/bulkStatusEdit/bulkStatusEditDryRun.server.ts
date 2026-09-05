/**
 * 批量上下架 dry-run 执行器：读 Shopify 商品状态 → 按规则算变更 → pending_review。
 *
 * 严格零 mutation。真正写回在 `bulkStatusEditApply.server.ts`，只能由
 * `/api/bulk-status-edit` 在用户二次确认后触发。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductStatusByProductIds } from "../shopify/productStatusReader.server";
import {
  BULK_STATUS_EDIT_MAX_PRODUCTS,
  buildBulkStatusEditSummary,
  computeProductStatusChange,
  type BulkStatusEditRow,
  type BulkStatusEditRule,
} from "../../lib/bulkStatusEdit";
import type { BulkStatusEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkStatusEdit][DryRun]";

export type EnqueueBulkStatusEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkStatusEditRule;
};

export function enqueueBulkStatusEditDryRun(params: EnqueueBulkStatusEditDryRunParams): void {
  void runBulkStatusEditDryRun(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkStatusEdit.dryRunFailed", t("bulkStatusEdit.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkStatusEditDryRun(
  params: EnqueueBulkStatusEditDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkStatusEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { products, truncated } = await fetchProductStatusByProductIds(admin, params.productIds, {
    maxProducts: BULK_STATUS_EDIT_MAX_PRODUCTS,
  });

  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkStatusEdit.noProductsFound",
        t("bulkStatusEdit.noProductsFound"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkStatusEdit.logComputing", { count: products.length }),
  });

  const rows: BulkStatusEditRow[] = products.map((product) =>
    computeProductStatusChange(product, params.rule),
  );
  const summary = buildBulkStatusEditSummary(rows);

  const result: BulkStatusEditTaskResult = {
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} products=${summary.products} changed=${summary.changed} skipped=${summary.skipped}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkStatusEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
