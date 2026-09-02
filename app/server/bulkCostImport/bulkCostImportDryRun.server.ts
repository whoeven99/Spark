/**
 * 成本价导入 dry-run：读原始表格 → 按映射解析 → 按 SKU 匹配变体 → pending_review。
 *
 * 严格零 mutation，也不调模型。写回走 `bulkCostImportApply.server.ts`，
 * 只能由 `/api/bulk-cost-import` 在用户二次确认后触发。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { fetchVariantCostsBySkus } from "../shopify/variantCostReader.server";
import { parseSheetBuffer, SheetParseError } from "../sheetImport/parseSheet.server";
import { SheetImportMappingError } from "../../lib/sheetImport";
import {
  BULK_COST_IMPORT_MAX_ROWS,
  BULK_COST_IMPORT_MIN_MATCH_RATE,
  buildBulkCostImportEntries,
  buildBulkCostImportSummary,
  computeBulkCostImportRows,
  computeCostMatchRate,
  validateCostMappingAgainstHeaders,
  type BulkCostImportMapping,
} from "../../lib/bulkCostImport";
import type { BulkCostImportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkCostImport][DryRun]";

export type EnqueueBulkCostImportDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  fileId: string;
  mapping: BulkCostImportMapping;
};

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

export function enqueueBulkCostImportDryRun(
  params: EnqueueBulkCostImportDryRunParams,
): void {
  void runBulkCostImportDryRun(params).catch(async (e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    // 解析与映射错误是用户能自己修的，原样透出；其它错误给通用文案
    const userFacing =
      e instanceof SheetParseError || e instanceof SheetImportMappingError
        ? detail
        : t("bulkCostImport.dryRunFailed");
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkCostImport.dryRunFailed", userFacing),
      startedAt: Date.now(),
    });
  });
}

async function runBulkCostImportDryRun(
  params: EnqueueBulkCostImportDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCostImport.logReadingFile"),
  });

  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCostImport.fileNotFound",
        t("bulkCostImport.fileNotFound"),
      ),
      startedAt,
    });
    return;
  }

  const sheet = parseSheetBuffer(file.buffer, file.name, {
    maxRows: BULK_COST_IMPORT_MAX_ROWS,
  });
  validateCostMappingAgainstHeaders(params.mapping, sheet.headers);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCostImport.logParsedRows", { count: sheet.rows.length }),
  });

  const { entries, issues: parseIssues } = buildBulkCostImportEntries(
    sheet.rows,
    params.mapping,
  );
  if (entries.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCostImport.noUsableRows",
        t("bulkCostImport.noUsableRows"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCostImport.logMatching", { count: entries.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const variants = await fetchVariantCostsBySkus(
    admin,
    entries.map((entry) => entry.sku),
  );

  const { rows, issues: matchIssues } = computeBulkCostImportRows(entries, variants);
  const issues = [...parseIssues, ...matchIssues].sort((a, b) => a.sourceRow - b.sourceRow);
  const summary = buildBulkCostImportSummary(sheet.rows.length, rows, issues);

  // 匹配率过低几乎一定是 SKU 列选错了，让用户去预览里一行行看没有意义
  const matchRate = computeCostMatchRate(summary);
  if (matchRate < BULK_COST_IMPORT_MIN_MATCH_RATE) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCostImport.matchRateTooLow",
        t("bulkCostImport.matchRateTooLow", {
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

  const result: BulkCostImportTaskResult = {
    rows,
    issues,
    summary,
    fileName: file.name,
    ...(sheet.truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} sheetRows=${summary.sheetRows} matched=${summary.matched} changed=${summary.changed} issues=${summary.issues} negativeMargin=${summary.negativeMargin}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkCostImport.logReadyForReview", {
      changed: summary.changed,
      issues: summary.issues,
    }),
  });
}
