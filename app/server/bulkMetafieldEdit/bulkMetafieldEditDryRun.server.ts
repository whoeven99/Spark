/**
 * 批量 Metafield 改写 dry-run 执行器：读定义 + 读商品当前值 → 算目标值 → pending_review。
 *
 * 严格零 mutation，也不调模型（值模板渲染是确定性的，没有 token 成本）。
 * 真正写回在 `bulkMetafieldEditApply.server.ts`，只能由 `/api/bulk-metafield-edit`
 * 在用户二次确认后触发。
 *
 * 三种「整任务失败」而不是「逐行跳过」的情况，都是因为逐行报同一个原因没有信息量：
 *   1. 定义已被删除 —— 一个都写不了；
 *   2. 字段类型不受支持 —— 同上；
 *   3. 字面值不合类型（如给整数字段填 `abc`）—— 每一行都不合，不如让商户改了重来。
 * 只有含占位符的模板才逐行标 `invalid_value`：那种渲染结果确实逐个商品不同。
 */
import { appendLog, failTask, pendingReviewTask } from "../aiTask/aiTaskLogger.server";
import { buildAITaskMessage } from "../../lib/aiTaskMessage";
import { initI18n } from "../../i18n";
import { DEFAULT_LOCALE, normalizeLocale } from "../../i18n/config";
import { unauthenticated } from "../../shopify.server";
import {
  fetchProductMetafieldsByProductIds,
  findProductMetafieldDefinition,
} from "../shopify/productMetafieldReader.server";
import {
  BULK_METAFIELD_EDIT_MAX_PRODUCTS,
  buildBulkMetafieldEditSummary,
  BulkMetafieldEditRuleError,
  computeProductMetafieldChange,
  formatMetafieldFieldKey,
  resolveBulkMetafieldEditPlan,
  type BulkMetafieldEditRow,
  type BulkMetafieldEditRule,
} from "../../lib/bulkMetafieldEdit";
import type { BulkMetafieldEditTaskResult } from "../../lib/aiTaskTypes";

const LOG_PREFIX = "[BulkMetafieldEdit][DryRun]";

export type EnqueueBulkMetafieldEditDryRunParams = {
  taskId: string;
  shop: string;
  locale: string;
  productIds: string[];
  rule: BulkMetafieldEditRule;
};

export function enqueueBulkMetafieldEditDryRun(
  params: EnqueueBulkMetafieldEditDryRunParams,
): void {
  void runBulkMetafieldEditDryRun(params).catch((e) => {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} unhandled taskId=${params.taskId} ${detail}`);
    const t = translator(params.locale);
    void failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkMetafieldEdit.dryRunFailed",
        t("bulkMetafieldEdit.dryRunFailed"),
      ),
      startedAt: Date.now(),
    });
  });
}

function translator(locale: string) {
  const i18n = initI18n(normalizeLocale(locale) ?? DEFAULT_LOCALE);
  return i18n.t.bind(i18n);
}

async function runBulkMetafieldEditDryRun(
  params: EnqueueBulkMetafieldEditDryRunParams,
): Promise<void> {
  const startedAt = Date.now();
  const t = translator(params.locale);
  const msg = (key: string, vars?: Record<string, string | number>) =>
    buildAITaskMessage(key, t(key, vars), vars);

  const fieldKey = formatMetafieldFieldKey(params.rule.namespace, params.rule.key);

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkMetafieldEdit.logReadingDefinition", { field: fieldKey }),
  });

  const { admin } = await unauthenticated.admin(params.shop);
  const definition = await findProductMetafieldDefinition(admin, {
    namespace: params.rule.namespace,
    key: params.rule.key,
  });
  if (!definition) {
    // 商户可能在开卡到确认之间把定义删了；如实报错，不要凭卡片里的旧信息硬写
    await failTask({
      taskId: params.taskId,
      errorMsg: msg("bulkMetafieldEdit.definitionNotFound", { field: fieldKey }),
      startedAt,
    });
    return;
  }

  let plan;
  try {
    plan = resolveBulkMetafieldEditPlan(params.rule, {
      definitionId: definition.definitionId,
      name: definition.name,
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type,
      description: definition.description,
    });
  } catch (e) {
    if (!(e instanceof BulkMetafieldEditRuleError)) throw e;
    await failTask({
      taskId: params.taskId,
      errorMsg: msg("bulkMetafieldEdit.planFailed", { reason: e.message }),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkMetafieldEdit.logReadingProducts", { count: params.productIds.length }),
  });

  const { products, truncated } = await fetchProductMetafieldsByProductIds(
    admin,
    params.productIds,
    {
      namespace: plan.namespace,
      key: plan.key,
      maxProducts: BULK_METAFIELD_EDIT_MAX_PRODUCTS,
    },
  );

  if (products.length === 0) {
    await failTask({
      taskId: params.taskId,
      errorMsg: buildAITaskMessage(
        "bulkMetafieldEdit.noProductsFound",
        t("bulkMetafieldEdit.noProductsFound"),
      ),
      startedAt,
    });
    return;
  }

  await appendLog({
    taskId: params.taskId,
    startedAt,
    message: msg("bulkMetafieldEdit.logComputing", { count: products.length }),
  });

  const rows: BulkMetafieldEditRow[] = products.map((product) =>
    computeProductMetafieldChange(product, plan),
  );
  const summary = buildBulkMetafieldEditSummary(rows, plan.action);

  const result: BulkMetafieldEditTaskResult = {
    rows,
    summary,
    action: plan.action,
    namespace: plan.namespace,
    key: plan.key,
    fieldName: plan.name,
    fieldType: plan.type,
    ...(truncated ? { truncated: true } : {}),
  };

  console.info(
    `${LOG_PREFIX} done taskId=${params.taskId} field=${fieldKey} products=${summary.products} changed=${summary.changed} skipped=${summary.skipped} invalid=${summary.invalidCount}`,
  );

  await pendingReviewTask({
    taskId: params.taskId,
    result: result as unknown as Record<string, unknown>,
    actualCredits: 0,
    startedAt,
    finalMessage: msg("bulkMetafieldEdit.logReadyForReview", {
      changed: summary.changed,
      skipped: summary.skipped,
    }),
  });
}
