/**
 * 库存导入 dry-run：解析官方 All states CSV → 匹配水位 → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { parseImportSpreadsheet } from "../productImport/parseImportSpreadsheet.server";
import { fetchProductsForImport } from "../shopify/productImportReader.server";
import { fetchInventoryLevelsByProductIds } from "../shopify/inventoryLevelReader.server";
import { INVENTORY_QTY_MAX_ROWS } from "../../lib/inventoryQtyEdit";
import {
  buildInventoryImportSummary,
  matchInventoryImportRecords,
  parseInventoryCsvSheet,
  type InventoryCsvIssue,
} from "../../lib/inventoryCsv";
import type { InventoryImportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[InventoryImport][DryRun]";

export type EnqueueInventoryImportDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  fileId: string;
};

export function enqueueInventoryImportDryRun(params: EnqueueInventoryImportDryRunParams): void {
  void runInventoryImportDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryImport.dryRunFailed", t("inventoryImport.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runInventoryImportDryRun(params: EnqueueInventoryImportDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("inventoryImport.logReadingFile"),
  });

  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryImport.fileNotFound", t("inventoryImport.fileNotFound")),
      startedAt,
    });
    return;
  }

  const sheet = await parseImportSpreadsheet(file.buffer, file.name);
  const parsed = parseInventoryCsvSheet(sheet.headers, sheet.rows);
  if (parsed.issues.some((issue) => issue.code === "unsupported_format")) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "inventoryImport.unsupportedFormat",
        t("inventoryImport.unsupportedFormat"),
      ),
      startedAt,
    });
    return;
  }

  const { admin } = await unauthenticated.admin(params.shop);
  const handles = [...new Set(parsed.records.map((record) => record.handle).filter(Boolean))];
  const skus = [...new Set(parsed.records.map((record) => record.sku).filter(Boolean))];
  const products = await fetchProductsForImport(admin, { handles, skus, productIds: [] });
  const productIds = products.map((product) => product.productId);
  const { levels, truncated } = await fetchInventoryLevelsByProductIds(admin, productIds, {
    maxRows: INVENTORY_QTY_MAX_ROWS,
  });
  const matched = matchInventoryImportRecords({ records: parsed.records, levels });
  const issues: InventoryCsvIssue[] = [...parsed.issues, ...matched.issues];
  const summary = buildInventoryImportSummary(matched.rows, issues);
  const result: InventoryImportTaskResult = {
    fileName: file.name,
    rows: matched.rows,
    issues,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };
  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("inventoryImport.logReadyForReview", {
      changed: summary.changed,
      issues: summary.issues,
    }),
  });
}
