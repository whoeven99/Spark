/**
 * 商品导出任务：读 Shopify → 生成 CSV → succeeded。只读，没有 apply。
 */
import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductsForShopifyCsvExport } from "../shopify/productExportReader.server";
import { fetchProductsForCatalog } from "../adsCatalog/productFetcher.server";
import {
  buildTiktokFeedCsv,
  mapShopifyToTiktokFeedCsv,
} from "../adsCatalog/mappers/shopifyToTiktokFeedCsv";
import {
  PRODUCT_EXPORT_MAX_PRODUCTS,
  buildProductExportSkipCsv,
  buildShopifyProductCsv,
  type ProductExportFormat,
  type ProductExportSkip,
} from "../../lib/productExport";
import type { ProductExportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[ProductExport][Run]";

export type EnqueueProductExportParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  format: ProductExportFormat;
};

export function enqueueProductExport(params: EnqueueProductExportParams): void {
  void runProductExport(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productExport.dryRunFailed", t("productExport.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runProductExport(params: EnqueueProductExportParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("productExport.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  let csv = "";
  let skips: ProductExportSkip[] = [];
  let exported = 0;
  let truncated = false;

  if (params.format === "tiktok_csv") {
    const products = await fetchProductsForCatalog(admin, {
      productIds: params.productIds,
      maxProducts: PRODUCT_EXPORT_MAX_PRODUCTS,
    });
    truncated = products.length < params.productIds.length;
    const rows = [];
    for (const product of products) {
      const mapped = mapShopifyToTiktokFeedCsv(product, { shopDomain: params.shop });
      if (mapped.ok) {
        rows.push(mapped.row);
        exported += 1;
      } else {
        skips.push({
          productId: product.id,
          productTitle: product.title,
          reason: mapped.reason,
        });
      }
    }
    csv = buildTiktokFeedCsv(rows);
  } else {
    const fetched = await fetchProductsForShopifyCsvExport(admin, params.productIds, {
      maxProducts: PRODUCT_EXPORT_MAX_PRODUCTS,
    });
    truncated = fetched.truncated;
    csv = buildShopifyProductCsv(fetched.products);
    exported = fetched.products.length;
  }

  if (exported === 0 && skips.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productExport.noProductsFound", t("productExport.noProductsFound")),
      startedAt,
    });
    return;
  }

  const result: ProductExportTaskResult = {
    format: params.format,
    csv,
    skipCsv: skips.length > 0 ? buildProductExportSkipCsv(skips) : undefined,
    summary: {
      products: exported + skips.length,
      exported,
      skipped: skips.length,
      format: params.format,
    },
    skips,
    ...(truncated ? { truncated: true } : {}),
  };

  await completeTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("productExport.logReady", {
      exported,
      skipped: skips.length,
    }),
  });
}
