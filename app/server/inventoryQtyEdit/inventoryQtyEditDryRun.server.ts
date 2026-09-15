/**
 * 库存规则 dry-run：读水位 → 按规则算 available → pending_review。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchInventoryLevelsByProductIds } from "../shopify/inventoryLevelReader.server";
import {
  INVENTORY_QTY_MAX_ROWS,
  buildInventoryQtySummary,
  computeInventoryQtyChange,
  snapshotsForLocation,
  type InventoryQtyRow,
  type InventoryQtyRule,
} from "../../lib/inventoryQtyEdit";
import type { InventoryQtyTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[InventoryQty][DryRun]";

export type EnqueueInventoryQtyDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: InventoryQtyRule;
};

export function enqueueInventoryQtyDryRun(params: EnqueueInventoryQtyDryRunParams): void {
  void runInventoryQtyDryRun(params).catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryQty.dryRunFailed", t("inventoryQty.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runInventoryQtyDryRun(params: EnqueueInventoryQtyDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("inventoryQty.logReading", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const { levels, truncated } = await fetchInventoryLevelsByProductIds(admin, params.productIds, {
    maxRows: INVENTORY_QTY_MAX_ROWS,
  });
  const snapshots = snapshotsForLocation(levels, params.rule.locationId, params.rule.locationName);
  if (snapshots.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryQty.noVariantsFound", t("inventoryQty.noVariantsFound")),
      startedAt,
    });
    return;
  }

  const rows: InventoryQtyRow[] = snapshots.map((snapshot) =>
    computeInventoryQtyChange(snapshot, params.rule),
  );
  const summary = buildInventoryQtySummary(rows);
  const result: InventoryQtyTaskResult = {
    mode: params.rule.mode,
    locationId: params.rule.locationId,
    locationName: params.rule.locationName,
    rows,
    summary,
    ...(truncated ? { truncated: true } : {}),
  };
  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} rows=${summary.rows} changed=${summary.changed}`,
  );
  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("inventoryQty.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
