/**
 * 批量调价 dry-run 执行器：读 Shopify 变体 → 按规则算新价 → pending_review。
 *
 * 严格零 mutation。真正写回在 `bulkPriceEditApply.server.ts`，只能由
 * `/api/bulk-price-edit` 在用户二次确认后触发。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchVariantPricesByProductIds } from "../shopify/variantPriceReader.server";
import {
  BULK_PRICE_EDIT_MAX_VARIANTS,
  buildBulkPriceEditSummary,
  computeVariantPriceChange,
  type BulkPriceEditRow,
  type BulkPriceEditRule,
} from "../../lib/bulkPriceEdit";
import type { BulkPriceEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkPriceEdit][DryRun]";

export type EnqueueBulkPriceEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkPriceEditRule;
};

export function enqueueBulkPriceEditDryRun(params: EnqueueBulkPriceEditDryRunParams): void {
  void runBulkPriceEditDryRun(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkPriceEdit.dryRunFailed", t("bulkPriceEdit.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkPriceEditDryRun(
  params: EnqueueBulkPriceEditDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkPriceEdit.logReadingVariants", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { variants, truncated } = await fetchVariantPricesByProductIds(
    admin,
    params.productIds,
    { maxVariants: BULK_PRICE_EDIT_MAX_VARIANTS },
  );

  if (variants.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkPriceEdit.noVariantsFound",
        t("bulkPriceEdit.noVariantsFound"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkPriceEdit.logComputing", { count: variants.length }),
  });

  const rows: BulkPriceEditRow[] = variants.map((variant) =>
    computeVariantPriceChange(variant, params.rule),
  );
  const summary = buildBulkPriceEditSummary(rows);

  const result: BulkPriceEditTaskResult = {
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} variants=${summary.variants} changed=${summary.changed} skipped=${summary.skipped}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkPriceEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
