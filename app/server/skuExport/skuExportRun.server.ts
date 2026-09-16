/**
 * SKU 导出：变体身份瘦表。只读，任务直接 succeeded。
 */
import { appendLog, completeTask, failTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchSkuExportVariants } from "../shopify/inventoryLevelReader.server";
import {
  SKU_EXPORT_MAX_PRODUCTS,
  SKU_EXPORT_MAX_VARIANTS,
  buildSkuExportCsv,
  buildSkuExportSkipCsv,
  findDuplicateSkuWarnings,
} from "../../lib/skuExport";

const LOG_PREFIX = "[SkuExport][Run]";

export type EnqueueSkuExportParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
};

export function enqueueSkuExport(params: EnqueueSkuExportParams): void {
  void runSkuExport(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("skuExport.dryRunFailed", t("skuExport.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runSkuExport(params: EnqueueSkuExportParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("skuExport.logReading", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const fetched = await fetchSkuExportVariants(
    admin,
    params.productIds.slice(0, SKU_EXPORT_MAX_PRODUCTS),
    SKU_EXPORT_MAX_VARIANTS,
  );
  if (fetched.rows.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("skuExport.noRows", t("skuExport.noRows")),
      startedAt,
    });
    return;
  }
  const warnings = findDuplicateSkuWarnings(fetched.rows);
  await completeTask({
    taskId: params.taskId,
    result: {
      csv: buildSkuExportCsv(fetched.rows),
      warningCsv: warnings.length > 0 ? buildSkuExportSkipCsv(warnings) : undefined,
      summary: {
        products: new Set(fetched.rows.map((row) => row.productId)).size,
        variants: fetched.rows.length,
        warned: warnings.length,
      },
      ...(fetched.truncated ? { truncated: true } : {}),
    },
    actualCredits: 0,
    startedAt,
    finalMessage: msg("skuExport.logReady", { variants: fetched.rows.length }),
  });
}
