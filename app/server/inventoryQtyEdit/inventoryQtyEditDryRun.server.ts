/**
 * 可售库存规则 dry-run。零 mutation。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import { fetchShopLocations } from "../shopify/locationReader.server";
import { fetchInventoryQtyLevels } from "../shopify/inventoryLevelReader.server";
import {
  INVENTORY_QTY_MAX_VARIANTS,
  buildInventoryQtyEditSummary,
  computeInventoryQtyChange,
  type InventoryQtyEditRule,
} from "../../lib/inventoryQtyEdit";

const LOG_PREFIX = "[InventoryQtyEdit][DryRun]";

export type EnqueueInventoryQtyEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: InventoryQtyEditRule;
};

export function enqueueInventoryQtyEditDryRun(params: EnqueueInventoryQtyEditDryRunParams): void {
  void runInventoryQtyEditDryRun(params).catch((error) => {
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId}`, error);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryQtyEdit.dryRunFailed", t("inventoryQtyEdit.dryRunFailed")),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runInventoryQtyEditDryRun(params: EnqueueInventoryQtyEditDryRunParams): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("inventoryQtyEdit.logReading", { count: params.productIds.length }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const locations = await fetchShopLocations(admin);
  const { levels, truncated } = await fetchInventoryQtyLevels(admin, params.productIds, locations, {
    maxVariants: INVENTORY_QTY_MAX_VARIANTS,
    locationId: params.rule.allWritableLocations ? undefined : params.rule.locationId,
  });
  if (levels.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage("inventoryQtyEdit.noVariantsFound", t("inventoryQtyEdit.noVariantsFound")),
      startedAt,
    });
    return;
  }
  const rows = levels.map((level) => computeInventoryQtyChange(level, params.rule));
  const summary = buildInventoryQtyEditSummary(rows);
  await pendingReviewTask({
    taskId: params.taskId,
    result: {
      rows,
      summary,
      locationName: params.rule.locationName,
      mode: params.rule.mode,
      ...(truncated ? { truncated: true } : {}),
    },
    actualCredits: 0,
    startedAt,
    finalMessage: msg("inventoryQtyEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
