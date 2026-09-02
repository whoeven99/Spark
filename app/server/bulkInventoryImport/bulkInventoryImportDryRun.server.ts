/**
 * 库存导入 dry-run：读原始表格 → 按映射解析 → 读所选地点的当前可售量 → pending_review。
 *
 * 严格零 mutation，也不调模型。写回走 `bulkInventoryImportApply.server.ts`，
 * 只能由 `/api/bulk-inventory-import` 在用户二次确认后触发。
 *
 * 这里读到的 `beforeQuantity` 不只是给人看的：写回时它会作为 CAS 比较基准传给
 * Shopify，期间库存被改过的行会被拒绝写入。所以这一步必须读实时值，不能用缓存。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { findLocationById } from "../shopify/locationReader.server";
import { fetchVariantInventoryBySkus } from "../shopify/variantInventoryReader.server";
import { parseSheetBuffer, SheetParseError } from "../sheetImport/parseSheet.server";
import { SheetImportMappingError } from "../../lib/sheetImport";
import {
  BULK_INVENTORY_IMPORT_MAX_ROWS,
  BULK_INVENTORY_IMPORT_MIN_MATCH_RATE,
  buildBulkInventoryImportEntries,
  buildBulkInventoryImportSummary,
  computeBulkInventoryImportRows,
  computeInventoryMatchRate,
  validateInventoryMappingAgainstHeaders,
  type BulkInventoryImportMapping,
} from "../../lib/bulkInventoryImport";
import type { BulkInventoryImportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkInventoryImport][DryRun]";

export type EnqueueBulkInventoryImportDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  fileId: string;
  locationId: string;
  mapping: BulkInventoryImportMapping;
};

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

export function enqueueBulkInventoryImportDryRun(
  params: EnqueueBulkInventoryImportDryRunParams,
): void {
  void runBulkInventoryImportDryRun(params).catch(async (e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    // 解析与映射错误是用户能自己修的，原样透出；其它错误给通用文案
    const userFacing =
      e instanceof SheetParseError || e instanceof SheetImportMappingError
        ? detail
        : t("bulkInventoryImport.dryRunFailed");
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkInventoryImport.dryRunFailed", userFacing),
      startedAt: Date.now(),
    });
  });
}

async function runBulkInventoryImportDryRun(
  params: EnqueueBulkInventoryImportDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkInventoryImport.logReadingFile"),
  });

  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkInventoryImport.fileNotFound",
        t("bulkInventoryImport.fileNotFound"),
      ),
      startedAt,
    });
    return;
  }

  const sheet = parseSheetBuffer(file.buffer, file.name, {
    maxRows: BULK_INVENTORY_IMPORT_MAX_ROWS,
  });
  validateInventoryMappingAgainstHeaders(params.mapping, sheet.headers);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkInventoryImport.logParsedRows", { count: sheet.rows.length }),
  });

  const { entries, issues: parseIssues } = buildBulkInventoryImportEntries(
    sheet.rows,
    params.mapping,
  );
  if (entries.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkInventoryImport.noUsableRows",
        t("bulkInventoryImport.noUsableRows"),
      ),
      startedAt,
    });
    return;
  }

  const { admin } = await unauthenticated.admin(params.shop);

  // 地点可能在开卡之后被停用或删除，写回前先确认它还在
  const location = await findLocationById(admin, params.locationId);
  if (!location) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkInventoryImport.locationNotFound",
        t("bulkInventoryImport.locationNotFound"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkInventoryImport.logMatching", {
      count: entries.length,
      location: location.name,
    }),
  });

  const variants = await fetchVariantInventoryBySkus(
    admin,
    entries.map((entry) => entry.sku),
    location.id,
  );

  const { rows, issues: matchIssues } = computeBulkInventoryImportRows(entries, variants);
  const issues = [...parseIssues, ...matchIssues].sort((a, b) => a.sourceRow - b.sourceRow);
  const summary = buildBulkInventoryImportSummary(sheet.rows.length, rows, issues);

  // 匹配率过低几乎一定是 SKU 列选错了，让用户去预览里一行行看没有意义
  const matchRate = computeInventoryMatchRate(summary);
  if (matchRate < BULK_INVENTORY_IMPORT_MIN_MATCH_RATE) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkInventoryImport.matchRateTooLow",
        t("bulkInventoryImport.matchRateTooLow", {
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

  const result: BulkInventoryImportTaskResult = {
    rows,
    issues,
    summary,
    fileName: file.name,
    locationId: location.id,
    locationName: location.name,
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
    finalMessage: msg("bulkInventoryImport.logReadyForReview", {
      changed: summary.changed,
      issues: summary.issues,
    }),
  });
}
