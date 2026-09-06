/**
 * 批量打标 dry-run 执行器：读 Shopify 商品标签 → 按规则算变更 → pending_review。
 *
 * 严格零 mutation。真正写回在 `bulkTagEditApply.server.ts`，只能由
 * `/api/bulk-tag-edit` 在用户二次确认后触发。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductTagsByProductIds } from "../shopify/productTagsReader.server";
import {
  BULK_TAG_EDIT_MAX_PRODUCTS,
  buildBulkTagEditSummary,
  computeProductTagChange,
  type BulkTagEditRow,
  type BulkTagEditRule,
} from "../../lib/bulkTagEdit";
import type { BulkTagEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkTagEdit][DryRun]";

export type EnqueueBulkTagEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkTagEditRule;
};

export function enqueueBulkTagEditDryRun(params: EnqueueBulkTagEditDryRunParams): void {
  void runBulkTagEditDryRun(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkTagEdit.dryRunFailed", t("bulkTagEdit.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkTagEditDryRun(params: EnqueueBulkTagEditDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkTagEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { products, truncated } = await fetchProductTagsByProductIds(admin, params.productIds, {
    maxProducts: BULK_TAG_EDIT_MAX_PRODUCTS,
  });

  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkTagEdit.noProductsFound", t("bulkTagEdit.noProductsFound")),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkTagEdit.logComputing", { count: products.length }),
  });

  const rows: BulkTagEditRow[] = products.map((product) =>
    computeProductTagChange(product, params.rule),
  );
  const summary = buildBulkTagEditSummary(rows);

  const result: BulkTagEditTaskResult = {
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
    finalMessage: msg("bulkTagEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
