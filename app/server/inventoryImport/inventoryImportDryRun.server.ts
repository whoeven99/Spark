/**
 * 库存导入 dry-run：读官方库存 CSV → 对照店铺在库 → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { parseImportSpreadsheet } from "../productImport/parseImportSpreadsheet.server";
import { fetchShopLocations } from "../shopify/locationReader.server";
import { fetchInventoryImportCatalogByKeys } from "../shopify/inventoryLevelReader.server";
import { mapInventoryCsvHeaders, parseInventoryCsvRecords } from "../../lib/inventoryCsv";
import {
  buildInventoryImportSummary,
  planInventoryImport,
} from "../../lib/inventoryImport";
import { SKU_EXPORT_MAX_VARIANTS } from "../../lib/skuExport";

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
  const mapped = mapInventoryCsvHeaders(sheet.headers);
  const records = parseInventoryCsvRecords(sheet.headers, sheet.rows);
  const { admin } = await unauthenticated.admin(params.shop);
  const locations = await fetchShopLocations(admin);
  const catalog = await fetchInventoryImportCatalogByKeys(
    admin,
    {
      handles: records.map((record) => record.handle).filter(Boolean),
      skus: records.map((record) => record.sku).filter(Boolean),
    },
    locations,
    SKU_EXPORT_MAX_VARIANTS,
  );

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("inventoryImport.logMatching", { count: records.length }),
  });

  const planned = planInventoryImport({
    records,
    products: catalog.products,
    locations: locations.map((item) => ({ id: item.id, name: item.name, writable: item.writable })),
    hasLocationColumn: mapped.columns.location != null,
    hasOnHandNewColumn: mapped.columns.onHandNew != null,
  });
  const summary = buildInventoryImportSummary(planned.rows, planned.issues);

  await pendingReviewTask({
    taskId: params.taskId,
    result: {
      fileName: file.name,
      rows: planned.rows,
      issues: planned.issues,
      summary,
      ...(catalog.truncated ? { truncated: true } : {}),
    },
    actualCredits: 0,
    startedAt,
    finalMessage: msg("inventoryImport.logReadyForReview", {
      changed: summary.changed,
      issues: summary.issues,
    }),
  });
}
