/**
 * 价目表导入 dry-run：读原始表格 → 按映射解析 → 按 SKU 匹配变体 → pending_review。
 *
 * 严格零 mutation，也不调模型。写回复用 `bulkPriceEditApply.server.ts`，
 * 只能由 `/api/bulk-price-import` 在用户二次确认后触发。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { fetchVariantsBySkus } from "../shopify/variantSkuReader.server";
import { parseSheetBuffer, SheetParseError } from "../sheetImport/parseSheet.server";
import {
  BULK_PRICE_IMPORT_MAX_ROWS,
  BULK_PRICE_IMPORT_MIN_MATCH_RATE,
  buildBulkPriceImportEntries,
  buildBulkPriceImportSummary,
  computeBulkPriceImportRows,
  computeMatchRate,
  validateMappingAgainstHeaders,
  BulkPriceImportMappingError,
  type BulkPriceImportMapping,
} from "../../lib/bulkPriceImport";
import type { BulkPriceImportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkPriceImport][DryRun]";

export type EnqueueBulkPriceImportDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  fileId: string;
  mapping: BulkPriceImportMapping;
};

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

export function enqueueBulkPriceImportDryRun(
  params: EnqueueBulkPriceImportDryRunParams,
): void {
  void runBulkPriceImportDryRun(params).catch(async (e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    // 解析与映射错误是用户能自己修的，原样透出；其它错误给通用文案
    const userFacing =
      e instanceof SheetParseError || e instanceof BulkPriceImportMappingError
        ? detail
        : t("bulkPriceImport.dryRunFailed");
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkPriceImport.dryRunFailed", userFacing),
      startedAt: Date.now(),
    });
  });
}

async function runBulkPriceImportDryRun(
  params: EnqueueBulkPriceImportDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkPriceImport.logReadingFile"),
  });

  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkPriceImport.fileNotFound",
        t("bulkPriceImport.fileNotFound"),
      ),
      startedAt,
    });
    return;
  }

  const sheet = parseSheetBuffer(file.buffer, file.name, {
    maxRows: BULK_PRICE_IMPORT_MAX_ROWS,
  });
  validateMappingAgainstHeaders(params.mapping, sheet.headers);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkPriceImport.logParsedRows", { count: sheet.rows.length }),
  });

  const { entries, issues: parseIssues } = buildBulkPriceImportEntries(
    sheet.rows,
    params.mapping,
  );
  if (entries.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkPriceImport.noUsableRows",
        t("bulkPriceImport.noUsableRows"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkPriceImport.logMatching", { count: entries.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const variants = await fetchVariantsBySkus(
    admin,
    entries.map((entry) => entry.sku),
  );

  const { rows, issues: matchIssues } = computeBulkPriceImportRows(entries, variants);
  const issues = [...parseIssues, ...matchIssues].sort((a, b) => a.sourceRow - b.sourceRow);
  const summary = buildBulkPriceImportSummary(sheet.rows.length, rows, issues);

  // 匹配率过低几乎一定是 SKU 列选错了，让用户去预览里一行行看没有意义
  const matchRate = computeMatchRate(summary);
  if (matchRate < BULK_PRICE_IMPORT_MIN_MATCH_RATE) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkPriceImport.matchRateTooLow",
        t("bulkPriceImport.matchRateTooLow", {
          matched: summary.matched,
          total: summary.sheetRows,
          column: params.mapping.skuColumn,
        }),
        { matched: summary.matched, total: summary.sheetRows, column: params.mapping.skuColumn },
      ),
      startedAt,
    });
    return;
  }

  const result: BulkPriceImportTaskResult = {
    rows,
    issues,
    summary,
    fileName: file.name,
    ...(sheet.truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} sheetRows=${summary.sheetRows} matched=${summary.matched} changed=${summary.changed} issues=${summary.issues}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkPriceImport.logReadyForReview", {
      changed: summary.changed,
      issues: summary.issues,
    }),
  });
}
