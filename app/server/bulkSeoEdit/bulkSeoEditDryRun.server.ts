/**
 * 批量 SEO 改写 dry-run 执行器：读 Shopify 商品字段 → 按模板渲染 → pending_review。
 *
 * 严格零 mutation，也不调模型（模板渲染是确定性的，没有 token 成本）。
 * 真正写回在 `bulkSeoEditApply.server.ts`，只能由 `/api/bulk-seo-edit`
 * 在用户二次确认后触发。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchProductSeoByProductIds } from "../shopify/productSeoReader.server";
import {
  BULK_SEO_EDIT_MAX_PRODUCTS,
  buildBulkSeoEditSummary,
  computeProductSeoChange,
  type BulkSeoEditRow,
  type BulkSeoEditRule,
} from "../../lib/bulkSeoEdit";
import type { BulkSeoEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkSeoEdit][DryRun]";

export type EnqueueBulkSeoEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkSeoEditRule;
};

export function enqueueBulkSeoEditDryRun(params: EnqueueBulkSeoEditDryRunParams): void {
  void runBulkSeoEditDryRun(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkSeoEdit.dryRunFailed", t("bulkSeoEdit.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkSeoEditDryRun(params: EnqueueBulkSeoEditDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkSeoEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { products, truncated } = await fetchProductSeoByProductIds(admin, params.productIds, {
    maxProducts: BULK_SEO_EDIT_MAX_PRODUCTS,
  });

  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkSeoEdit.noProductsFound", t("bulkSeoEdit.noProductsFound")),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkSeoEdit.logComputing", { count: products.length }),
  });

  const rows: BulkSeoEditRow[] = products.map((product) =>
    computeProductSeoChange(product, params.rule),
  );
  const summary = buildBulkSeoEditSummary(rows);

  const result: BulkSeoEditTaskResult = {
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} products=${summary.products} changed=${summary.changed} skipped=${summary.skipped}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkSeoEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
