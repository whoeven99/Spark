/**
 * 批量改商品字段 dry-run：读 Shopify → 按规则算变更 → pending_review。严格零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductFieldsByProductIds } from "../shopify/productFieldReader.server";
import {
  BULK_PRODUCT_FIELD_EDIT_MAX_PRODUCTS,
  buildBulkProductFieldEditSummary,
  computeProductFieldChange,
  type BulkProductFieldEditRule,
  type BulkProductFieldEditRow,
} from "../../lib/bulkProductFieldEdit";
import type { BulkProductFieldEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkProductFieldEdit][DryRun]";

export type EnqueueBulkProductFieldEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkProductFieldEditRule;
};

export function enqueueBulkProductFieldEditDryRun(
  params: EnqueueBulkProductFieldEditDryRunParams,
): void {
  void runBulkProductFieldEditDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkProductFieldEdit.dryRunFailed",
        t("bulkProductFieldEdit.dryRunFailed"),
      ),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkProductFieldEditDryRun(
  params: EnqueueBulkProductFieldEditDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkProductFieldEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { products, truncated } = await fetchProductFieldsByProductIds(admin, params.productIds, {
    maxProducts: BULK_PRODUCT_FIELD_EDIT_MAX_PRODUCTS,
  });

  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkProductFieldEdit.noProductsFound",
        t("bulkProductFieldEdit.noProductsFound"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkProductFieldEdit.logComputing", { count: products.length }),
  });

  const rows: BulkProductFieldEditRow[] = products.map((product) =>
    computeProductFieldChange(product, params.rule),
  );
  const summary = buildBulkProductFieldEditSummary(rows);
  const result: BulkProductFieldEditTaskResult = {
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} products=${summary.products} changed=${summary.changed}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkProductFieldEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
