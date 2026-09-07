/**
 * 批量合集 dry-run：读合集与归属 → 算进出 → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import {
  fetchCollectionMembershipByProductIds,
  fetchCollectionSnapshot,
} from "../shopify/collectionMembershipReader.server";
import {
  BULK_COLLECTION_EDIT_MAX_PRODUCTS,
  buildBulkCollectionEditSummary,
  computeCollectionMembershipChange,
  type BulkCollectionEditAction,
  type BulkCollectionEditRow,
} from "../../lib/bulkCollectionEdit";
import type { BulkCollectionEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkCollectionEdit][DryRun]";

export type EnqueueBulkCollectionEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  action: BulkCollectionEditAction;
  collectionId: string;
};

export function enqueueBulkCollectionEditDryRun(params: EnqueueBulkCollectionEditDryRunParams): void {
  void runBulkCollectionEditDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
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
  const collection = await fetchCollectionSnapshot(admin, params.collectionId);
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
  if (collection.smart) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("bulkCollectionEdit.ruleDrivenCollection", t("bulkCollectionEdit.ruleDrivenCollection", {
        collection: collection.title,
      }), { collection: collection.title }),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkCollectionEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { products, truncated } = await fetchCollectionMembershipByProductIds(
    admin,
    params.collectionId,
    params.productIds,
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

  const rows: BulkCollectionEditRow[] = products.map((product) =>
    computeCollectionMembershipChange(product, params.action),
  );
  const summary = buildBulkCollectionEditSummary(rows);
  const result: BulkCollectionEditTaskResult = {
    rows,
    summary,
    collectionId: collection.id,
    collectionTitle: collection.title,
    action: params.action,
    ...(truncated ? { truncated: true } : {}),
  };

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
