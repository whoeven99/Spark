/**
 * 导出库存任务：读水位 → Shopify All states CSV → succeeded。只读。
 */
import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchInventoryLevelsByProductIds } from "../shopify/inventoryLevelReader.server";
import { INVENTORY_QTY_MAX_ROWS } from "../../lib/inventoryQtyEdit";
import { buildInventoryExportCsv } from "../../lib/inventoryCsv";
import type { InventoryExportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[InventoryExport][Run]";

export type EnqueueInventoryExportParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
};

export function enqueueInventoryExport(params: EnqueueInventoryExportParams): void {
  void runInventoryExport(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryExport.dryRunFailed", t("inventoryExport.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runInventoryExport(params: EnqueueInventoryExportParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("inventoryExport.logReading", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { levels, truncated } = await fetchInventoryLevelsByProductIds(admin, params.productIds, {
    maxRows: INVENTORY_QTY_MAX_ROWS,
  });
  const csv = buildInventoryExportCsv(levels);
  const productIds = new Set(levels.map((level) => level.productId));
  const result: InventoryExportTaskResult = {
    csv,
    summary: {
      products: productIds.size,
      rows: levels.length,
      exported: levels.length,
      skipped: 0,
    },
    products: [...productIds].map((productId) => {
      const sample = levels.find((level) => level.productId === productId);
      return { productId, title: sample?.productTitle ?? productId, handle: sample?.handle ?? "" };
    }),
    ...(truncated ? { truncated: true } : {}),
  };
  await completeTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("inventoryExport.logDone", { rows: levels.length }),
  });
}
