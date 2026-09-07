/**
 * 批量归档 dry-run：读状态 → 算 ARCHIVED → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductStatusByProductIds } from "../shopify/productStatusReader.server";
import {
  BULK_ARCHIVE_MAX_PRODUCTS,
  buildBulkArchiveSummary,
  computeProductArchive,
  type BulkArchiveRow,
} from "../../lib/bulkArchive";
import type { BulkArchiveTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkArchive][DryRun]";

export type EnqueueBulkArchiveDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
};

export function enqueueBulkArchiveDryRun(params: EnqueueBulkArchiveDryRunParams): void {
  void runBulkArchiveDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkArchive.dryRunFailed", t("bulkArchive.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkArchiveDryRun(params: EnqueueBulkArchiveDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkArchive.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { products, truncated } = await fetchProductStatusByProductIds(admin, params.productIds, {
    maxProducts: BULK_ARCHIVE_MAX_PRODUCTS,
  });
  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkArchive.noProductsFound", t("bulkArchive.noProductsFound")),
      startedAt,
    });
    return;
  }

  const rows: BulkArchiveRow[] = products.map((product) => computeProductArchive(product));
  const summary = buildBulkArchiveSummary(rows);
  const result: BulkArchiveTaskResult = {
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkArchive.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
