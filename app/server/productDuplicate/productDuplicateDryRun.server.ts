/**
 * 复制商品 dry-run：读标题 → 算新标题 → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductsForDuplicate } from "../shopify/productDuplicateReader.server";
import {
  PRODUCT_DUPLICATE_MAX_PRODUCTS,
  buildProductDuplicateSummary,
  computeProductDuplicate,
  type ProductDuplicateRule,
  type ProductDuplicateRow,
} from "../../lib/productDuplicate";
import type { ProductDuplicateTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[ProductDuplicate][DryRun]";

export type EnqueueProductDuplicateDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: ProductDuplicateRule;
};

export function enqueueProductDuplicateDryRun(params: EnqueueProductDuplicateDryRunParams): void {
  void runProductDuplicateDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productDuplicate.dryRunFailed", t("productDuplicate.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runProductDuplicateDryRun(params: EnqueueProductDuplicateDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("productDuplicate.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { products, truncated } = await fetchProductsForDuplicate(admin, params.productIds, {
    maxProducts: PRODUCT_DUPLICATE_MAX_PRODUCTS,
  });
  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("productDuplicate.noProductsFound", t("productDuplicate.noProductsFound")),
      startedAt,
    });
    return;
  }

  const rows: ProductDuplicateRow[] = products.map((product) =>
    computeProductDuplicate(product, params.rule),
  );
  const summary = buildProductDuplicateSummary(rows);
  const result: ProductDuplicateTaskResult = {
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("productDuplicate.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
