/**
 * 批量入 / 出 Collection 的 dry-run 执行器：
 * 读合集 → 判断能不能手动增删 → 读商品归属 → 按规则算变更 → pending_review。
 *
 * 严格零 mutation。真正写回在 `bulkCollectionEditApply.server.ts`，只能由
 * `/api/bulk-collection-edit` 在用户二次确认后触发。
 *
 * 智能合集在这里就整任务失败，而不是产出一整屏「跳过」：
 * 成员由规则决定，逐行解释没有意义，用户需要的是「换个手动合集或改规则」。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import {
  fetchCollectionSummary,
  fetchProductCollectionMembership,
} from "../shopify/collectionReader.server";
import {
  BULK_COLLECTION_EDIT_MAX_PRODUCTS,
  buildBulkCollectionEditSummary,
  computeProductCollectionChange,
  type BulkCollectionEditRow,
  type BulkCollectionEditRule,
} from "../../lib/bulkCollectionEdit";
import type { BulkCollectionEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkCollectionEdit][DryRun]";

export type EnqueueBulkCollectionEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkCollectionEditRule;
};

export function enqueueBulkCollectionEditDryRun(
  params: EnqueueBulkCollectionEditDryRunParams,
): void {
  void runBulkCollectionEditDryRun(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCollectionEdit.dryRunFailed",
        t("bulkCollectionEdit.dryRunFailed"),
      ),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkCollectionEditDryRun(
  params: EnqueueBulkCollectionEditDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCollectionEdit.logReadingCollection"),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const collection = await fetchCollectionSummary(admin, params.rule.collectionId);

  if (!collection) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCollectionEdit.collectionNotFound",
        t("bulkCollectionEdit.collectionNotFound"),
      ),
      startedAt,
    });
    return;
  }

  if (collection.ruleDriven) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCollectionEdit.ruleDrivenCollection",
        t("bulkCollectionEdit.ruleDrivenCollection", { collection: collection.title }),
        { collection: collection.title },
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCollectionEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { products, truncated } = await fetchProductCollectionMembership(
    admin,
    params.productIds,
    params.rule.collectionId,
    { maxProducts: BULK_COLLECTION_EDIT_MAX_PRODUCTS },
  );

  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkCollectionEdit.noProductsFound",
        t("bulkCollectionEdit.noProductsFound"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCollectionEdit.logComputing", { count: products.length }),
  });

  const rows: BulkCollectionEditRow[] = products.map((product) =>
    computeProductCollectionChange(product, params.rule),
  );
  const summary = buildBulkCollectionEditSummary(rows);

  const result: BulkCollectionEditTaskResult = {
    rows,
    summary,
    collectionId: collection.collectionId,
    collectionTitle: collection.title,
    action: params.rule.action,
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
    finalMessage: msg("bulkCollectionEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
