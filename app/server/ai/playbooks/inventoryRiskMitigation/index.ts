import type {
  PlaybookDefinition,
  PlaybookRunParams,
  PlaybookRunResult,
  PlaybookStepResult,
} from "../../core/playbookRegistry.server";
import { ensureDailySnapshot } from "../../../operations/dailyInspection.server";
import type { InventoryRiskDetail } from "../../../operations/diagnosis.server";

const TOP_SKU_LIMIT = 8;

function money(amount: number, currency: string): string {
  return `${Math.round(amount)} ${currency}`;
}

function formatSellableDays(value: number | null): string {
  if (value === null) return "无销量基线";
  return `${Math.round(value * 10) / 10} 天`;
}

function sortInventoryRisks(items: InventoryRiskDetail[]): InventoryRiskDetail[] {
  return [...items].sort((a, b) => {
    if (b.estimatedLoss !== a.estimatedLoss) {
      return b.estimatedLoss - a.estimatedLoss;
    }
    const aDays = a.sellableDays ?? Number.POSITIVE_INFINITY;
    const bDays = b.sellableDays ?? Number.POSITIVE_INFINITY;
    return aDays - bDays;
  });
}

function buildSummary(params: {
  currency: string;
  riskCount: number;
  watchCount: number;
  estimatedLoss: number;
  topSkus: InventoryRiskDetail[];
  constraints?: string;
}): string {
  const { currency, riskCount, watchCount, estimatedLoss, topSkus, constraints } = params;
  const lines = [
    "## 库存止损方案",
    "",
    `风险概览：高风险 SKU ${riskCount} 个，关注 SKU ${watchCount} 个，预计未来 7 天潜在损失 ${money(estimatedLoss, currency)}。`,
  ];

  if (constraints?.trim()) {
    lines.push(`约束条件：${constraints.trim()}`);
  }

  if (topSkus.length === 0) {
    lines.push("", "当前没有可排序的高风险 SKU，可继续观察补货节奏。");
    return lines.join("\n");
  }

  lines.push("", "优先处理对象：");
  for (const sku of topSkus) {
    lines.push(
      `- ${sku.sku}｜${sku.title}｜可售 ${sku.available}｜日销 ${Math.round(sku.dailySalesVelocity * 10) / 10}｜可售天数 ${formatSellableDays(sku.sellableDays)}｜预计损失 ${money(sku.estimatedLoss, currency)}`,
    );
  }

  lines.push(
    "",
    "建议动作：",
    "- 按预计损失从高到低安排补货或仓间调拨。",
    "- 7 天内可能断货的 SKU，优先确认供应商交期和在途库存。",
    "- 短期无法补货的 SKU，暂停广告投放、限制促销曝光，或引导替代 SKU 承接需求。",
    "- 次日复盘 riskSkuCount 和 estimatedInventoryLoss 是否下降。",
  );

  return lines.join("\n");
}

async function run({
  goal,
  constraints,
  context,
  onStep,
}: PlaybookRunParams): Promise<PlaybookRunResult> {
  const steps: PlaybookStepResult[] = [];
  const shop = context.shop?.trim();

  if (!shop) {
    return {
      ok: false,
      summary: "无法识别当前店铺，暂时不能生成库存止损方案。",
      steps,
    };
  }

  try {
    onStep?.("读取诊断快照", "running");
    const daily = await ensureDailySnapshot(shop);
    onStep?.("读取诊断快照", "completed");
    steps.push({
      step: "读取诊断快照",
      status: "completed",
      output: daily.hasData
        ? `已读取 ${daily.snapshotDate} 经营诊断快照`
        : "暂无可用经营诊断快照",
    });

    if (!daily.hasData) {
      return {
        ok: true,
        summary: "店铺暂无已同步的订单/库存数据，暂时不能生成可靠的库存止损方案。建议先完成历史订单和库存同步。",
        steps,
      };
    }

    onStep?.("风险 SKU 排序", "running");
    const sorted = sortInventoryRisks(daily.detail.inventoryRisks);
    const topSkus = sorted.slice(0, TOP_SKU_LIMIT);
    onStep?.("风险 SKU 排序", "completed");
    steps.push({
      step: "风险 SKU 排序",
      status: "completed",
      output: `已按预计损失和可售天数排序 ${sorted.length} 个库存风险 SKU`,
    });

    onStep?.("止损动作生成", "running");
    const summary = buildSummary({
      currency: daily.metrics.currency,
      riskCount: daily.metrics.riskSkuCount,
      watchCount: daily.metrics.watchSkuCount,
      estimatedLoss: daily.metrics.estimatedInventoryLoss,
      topSkus,
      constraints,
    });
    onStep?.("止损动作生成", "completed");
    steps.push({
      step: "止损动作生成",
      status: "completed",
      output: "库存止损方案已生成",
    });
    const reviewDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      ok: true,
      summary,
      steps,
      data: {
        snapshotDate: daily.snapshotDate,
        riskSkuCount: daily.metrics.riskSkuCount,
        watchSkuCount: daily.metrics.watchSkuCount,
        estimatedInventoryLoss: daily.metrics.estimatedInventoryLoss,
        goal,
        constraints,
        topSkus,
      },
      structuredResult: {
        diagnosis: [
          {
            title: "库存风险需要止损",
            detail: `高风险 SKU ${daily.metrics.riskSkuCount} 个，关注 SKU ${daily.metrics.watchSkuCount} 个。`,
            severity: daily.metrics.riskSkuCount > 0 ? "risk" : "watch",
            metrics: {
              riskSkuCount: daily.metrics.riskSkuCount,
              watchSkuCount: daily.metrics.watchSkuCount,
              estimatedInventoryLoss: daily.metrics.estimatedInventoryLoss,
            },
          },
        ],
        evidence: [
          { label: "高风险 SKU", value: daily.metrics.riskSkuCount, source: "daily_diagnosis" },
          { label: "关注 SKU", value: daily.metrics.watchSkuCount, source: "daily_diagnosis" },
          {
            label: "预计未来 7 天潜在损失",
            value: money(daily.metrics.estimatedInventoryLoss, daily.metrics.currency),
            source: "daily_diagnosis",
          },
          ...topSkus.slice(0, 5).map((sku) => ({
            label: sku.sku,
            value: money(sku.estimatedLoss, daily.metrics.currency),
            detail: `${sku.title}｜可售天数 ${formatSellableDays(sku.sellableDays)}`,
            source: "inventory_risks",
          })),
        ],
        actions: [
          {
            title: "按预计损失排序处理补货或调拨",
            detail: "先处理预计损失最高、可售天数最短的 SKU。",
            priority: "P0",
            status: "proposed",
          },
          {
            title: "确认 7 天内可能断货 SKU 的供应交期",
            detail: "核对供应商交期、在途库存和多仓可调拨量。",
            priority: "P1",
            status: "proposed",
          },
          {
            title: "短期无法补货的 SKU 限流",
            detail: "暂停广告投放、限制促销曝光，或引导替代 SKU 承接需求。",
            priority: "P1",
            status: "proposed",
          },
        ],
        reviewMetrics: [
          {
            key: "riskSkuCount",
            label: "高风险 SKU 数",
            current: daily.metrics.riskSkuCount,
            target: 0,
            direction: "decrease",
          },
          {
            key: "estimatedInventoryLoss",
            label: "预计缺货损失",
            current: daily.metrics.estimatedInventoryLoss,
            target: 0,
            direction: "decrease",
          },
        ],
        followUps: [
          {
            title: "次日复盘库存风险是否下降",
            detail: "重点看 riskSkuCount、estimatedInventoryLoss 和 Top SKU 是否改善。",
            dueAt: reviewDueAt,
          },
        ],
      },
      caseDraft: {
        title: "库存止损方案",
        severity: daily.metrics.riskSkuCount > 0 ? "risk" : "watch",
        reviewDueAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onStep?.("读取诊断快照", "error");
    steps.push({
      step: "读取诊断快照",
      status: "error",
      output: `库存诊断读取失败：${message}`,
    });
    return {
      ok: false,
      summary: `库存止损方案生成失败：${message}`,
      steps,
    };
  }
}

export const inventoryRiskMitigationPlaybook: PlaybookDefinition = {
  name: "inventoryRiskMitigation",
  displayName: "库存止损",
  description:
    "基于每日经营诊断中的高风险 SKU、可售天数和预计损失，生成补货、调拨、限流和替代承接方案。",
  category: "inventory",
  triggerDescription:
    "当用户询问缺货风险、库存止损、哪些 SKU 需要补货、可售天数、库存损失或供应链优先级时触发。",
  steps: [
    { id: "读取诊断快照", label: "读取诊断快照", kind: "data", stage: "dataAlign", runningLabel: "正在读取每日经营诊断快照" },
    { id: "风险 SKU 排序", label: "风险 SKU 排序", kind: "compute", stage: "diagnose", runningLabel: "正在按预计损失和可售天数排序 SKU" },
    { id: "止损动作生成", label: "止损动作生成", kind: "compute", stage: "propose", runningLabel: "正在生成库存止损动作" },
  ],
  presentation: {
    icon: "INV",
    entryTitle: "库存止损",
    entrySubtitle: "找出最该补货、调拨或限流的 SKU",
    evidenceKeys: ["riskSkuCount", "watchSkuCount", "estimatedInventoryLoss"],
    defaultPrompt: "运行 Playbook「库存止损」，基于今日诊断生成库存止损方案。",
    ctaLabel: "生成止损方案",
    runTitle: "库存止损 Playbook",
    reviewMetrics: ["riskSkuCount", "estimatedInventoryLoss"],
  },
  systemPromptExtension:
    "当触发库存止损 Playbook 时，必须基于诊断快照中的 riskSkuCount、watchSkuCount、estimatedInventoryLoss 和 inventoryRisks 输出；不要凭空编造库存、销量或补货数量。",
  run,
};
