/**
 * 库存导出：读水位 → Shopify 官方库存 CSV → succeeded。只读。
 */
import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchShopLocations } from "../shopify/locationReader.server";
import { fetchInventoryImportCatalog } from "../shopify/inventoryLevelReader.server";
import { buildInventoryCsv, type InventoryCsvExportRow } from "../../lib/inventoryCsv";
import { SKU_EXPORT_MAX_VARIANTS } from "../../lib/skuExport";
import { PRODUCT_EXPORT_MAX_PRODUCTS } from "../../lib/productExport";

const LOG_PREFIX = "[InventoryExport][Run]";

export type EnqueueInventoryExportParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  locationId: string;
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
  const locations = await fetchShopLocations(admin);
  const active = locations.filter((item) => item.isActive);
  const scoped =
    params.locationId === "all" || !params.locationId
      ? active
      : active.filter((item) => item.id === params.locationId);
  if (scoped.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryExport.locationNotFound", t("inventoryExport.locationNotFound")),
      startedAt,
    });
    return;
  }

  const fetched = await fetchInventoryImportCatalog(
    admin,
    params.productIds.slice(0, PRODUCT_EXPORT_MAX_PRODUCTS),
    scoped,
    SKU_EXPORT_MAX_VARIANTS,
  );
  const csvRows: InventoryCsvExportRow[] = [];
  for (const product of fetched.products) {
    for (const variant of product.variants) {
      for (const level of variant.levels) {
        if (!level.stocked && params.locationId === "all") continue;
        csvRows.push({
          handle: product.handle,
          title: product.productTitle,
          option1Name: variant.option1Name,
          option1Value: variant.option1,
          option2Name: variant.option2Name,
          option2Value: variant.option2,
          option3Name: variant.option3Name,
          option3Value: variant.option3,
          sku: variant.sku ?? "",
          location: level.locationName,
          incoming: level.incoming,
          unavailable: level.unavailable,
          committed: level.committed,
          available: level.available,
          onHand: level.onHand,
        });
      }
    }
  }

  if (csvRows.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryExport.noRows", t("inventoryExport.noRows")),
      startedAt,
    });
    return;
  }

  await completeTask({
    taskId: params.taskId,
    result: {
      csv: buildInventoryCsv(csvRows),
      summary: {
        products: fetched.products.length,
        rows: csvRows.length,
        locations: scoped.length,
      },
      ...(fetched.truncated ? { truncated: true } : {}),
    },
    actualCredits: 0,
    startedAt,
    finalMessage: msg("inventoryExport.logReady", { rows: csvRows.length }),
  });
}
