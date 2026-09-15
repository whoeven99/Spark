/**
 * 商品导出任务：读 Shopify → 生成 CSV → succeeded。只读，没有 apply。
 */
import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { fetchProductsForShopifyCsvExport } from "../shopify/productExportReader.server";
import { fetchProductsForCatalog } from "../adsCatalog/productFetcher.server";
import {
  buildTiktokFeedCsv,
  mapShopifyToTiktokFeedCsv,
} from "../adsCatalog/mappers/shopifyToTiktokFeedCsv";
import {
  buildAmazonProductCsv,
  buildTemuProductCsv,
  buildTiktokShopProductCsv,
} from "../../lib/productExportPlatformCsv";
import {
  PRODUCT_EXPORT_MAX_PRODUCTS,
  buildProductExportSkipCsv,
  buildShopifyProductCsv,
  countProductExportWarned,
  normalizeProductExportSkipReason,
  type ProductExportFormat,
  type ProductExportPreviewProduct,
  type ProductExportSkip,
} from "../../lib/productExport";
import type { ProductExportTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[ProductExport][Run]";

const PLATFORM_CSV_BUILDERS: Partial<
  Record<ProductExportFormat, typeof buildAmazonProductCsv>
> = {
  amazon_csv: buildAmazonProductCsv,
  temu_csv: buildTemuProductCsv,
  tiktok_shop_csv: buildTiktokShopProductCsv,
};

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

function localizeReasonCsv(
  rows: ProductExportSkip[],
  t: (key: string, options?: Record<string, string>) => string,
): string | undefined {
  if (rows.length === 0) return undefined;
  return buildProductExportSkipCsv(rows, (reason) =>
    t(`productExport.skipReason.${reason}`, { defaultValue: reason }),
  );
}

async function runTiktokCatalogExport(
  admin: ShopifyAdminGraphqlClient,
  params: EnqueueProductExportParams,
): Promise<{
  csv: string;
  skips: ProductExportSkip[];
  exportedProducts: ProductExportPreviewProduct[];
  truncated: boolean;
}> {
  const products = await fetchProductsForCatalog(admin, {
    productIds: params.productIds,
    maxProducts: PRODUCT_EXPORT_MAX_PRODUCTS,
  });
  const rows = [];
  const skips: ProductExportSkip[] = [];
  const exportedProducts: ProductExportPreviewProduct[] = [];
  for (const product of products) {
    const mapped = mapShopifyToTiktokFeedCsv(product, { shopDomain: params.shop });
    const preview = { productId: product.id, title: product.title, handle: product.handle };
    if (mapped.ok) {
      rows.push(mapped.row);
      exportedProducts.push(preview);
    } else {
      skips.push({
        productId: product.id,
        productTitle: product.title,
        reason: normalizeProductExportSkipReason(mapped.reason),
      });
    }
  }
  return {
    csv: buildTiktokFeedCsv(rows),
    skips,
    exportedProducts,
    truncated: products.length < params.productIds.length,
  };
}

async function runShopifyFamilyExport(
  admin: ShopifyAdminGraphqlClient,
  params: EnqueueProductExportParams,
): Promise<{
  csv: string;
  skips: ProductExportSkip[];
  warnings: ProductExportSkip[];
  exportedProducts: ProductExportPreviewProduct[];
  truncated: boolean;
}> {
  const fetched = await fetchProductsForShopifyCsvExport(admin, params.productIds, {
    maxProducts: PRODUCT_EXPORT_MAX_PRODUCTS,
  });
  const builder = PLATFORM_CSV_BUILDERS[params.format];
  if (builder) {
    const mapped = builder(fetched.products);
    return { ...mapped, truncated: fetched.truncated };
  }
  return {
    csv: buildShopifyProductCsv(fetched.products),
    skips: [],
    warnings: [],
    exportedProducts: fetched.products
      .filter((product) => Boolean(product.id))
      .map((product) => ({
        productId: product.id as string,
        title: product.title,
        handle: product.handle,
      })),
    truncated: fetched.truncated,
  };
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
  const built =
    params.format === "tiktok_csv"
      ? { ...(await runTiktokCatalogExport(admin, params)), warnings: [] as ProductExportSkip[] }
      : await runShopifyFamilyExport(admin, params);

  const exported = built.exportedProducts.length;
  if (exported === 0 && built.skips.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productExport.noProductsFound", t("productExport.noProductsFound")),
      startedAt,
    });
    return;
  }

  const warned = countProductExportWarned(built.warnings);
  const result: ProductExportTaskResult = {
    format: params.format,
    csv: built.csv,
    skipCsv: localizeReasonCsv(built.skips, t),
    warningCsv: localizeReasonCsv(built.warnings, t),
    summary: {
      products: exported + built.skips.length,
      exported,
      skipped: built.skips.length,
      ...(warned > 0 ? { warned } : {}),
      format: params.format,
    },
    skips: built.skips,
    ...(built.warnings.length > 0 ? { warnings: built.warnings } : {}),
    products: built.exportedProducts,
    ...(built.truncated ? { truncated: true } : {}),
  };

  await completeTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage:
      warned > 0
        ? msg("productExport.logReadyWithWarnings", {
            exported,
            skipped: built.skips.length,
            warned,
          })
        : msg("productExport.logReady", { exported, skipped: built.skips.length }),
  });
}
