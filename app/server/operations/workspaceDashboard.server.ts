import type {
  WorkspaceDashboardAlert,
  WorkspaceDashboardAlertTone,
  WorkspaceDashboardMetric,
  WorkspaceDashboardMetricTone,
  WorkspaceDashboardSnapshot,
} from "../../lib/workspaceDashboardTypes";
import type { DiagnosisItemResult } from "./diagnosis.server";
import type { DailyOperationsResult } from "./dailyInspection.server";

export type { WorkspaceDashboardSnapshot } from "../../lib/workspaceDashboardTypes";

const EMPTY_ORDER_MESSAGE =
  "暂无订单数据，无法生成诊断。新订单会自动同步，历史订单请先在补录页执行回填。";

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function formatPctDelta(value: number | null, suffix = "%"): string {
  if (value === null) return "无上期数据";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${round(value)}${suffix}`;
}

function toneHigherIsBetter(delta: number | null): WorkspaceDashboardMetricTone {
  if (delta === null) return "neutral";
  if (delta > 0) return "positive";
  if (delta < 0) return "negative";
  return "neutral";
}

function toneLowerIsBetter(delta: number | null): WorkspaceDashboardMetricTone {
  if (delta === null) return "neutral";
  if (delta < 0) return "positive";
  if (delta > 0) return "negative";
  return "neutral";
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${round(amount, 2)} ${currency}`;
  }
}

function diagnosisAlertTone(status: DiagnosisItemResult["status"]): WorkspaceDashboardAlertTone {
  switch (status) {
    case "risk":
      return "critical";
    case "watch":
      return "warning";
    case "healthy":
      return "info";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function buildAlerts(result: DailyOperationsResult): WorkspaceDashboardAlert[] {
  const fromDiagnosis: WorkspaceDashboardAlert[] = result.items
    .filter((item) => item.status !== "healthy")
    .map((item) => ({
      title: item.name,
      detail: item.evidence[0] ?? item.reasoning[0] ?? "",
      tone: diagnosisAlertTone(item.status),
    }))
    .filter((alert) => alert.detail.length > 0);

  if (fromDiagnosis.length > 0) {
    return fromDiagnosis.slice(0, 5);
  }

  const openTasks = result.tasks.filter((task) =>
    ["open", "in_progress"].includes(task.status),
  );
  const taskAlerts: WorkspaceDashboardAlert[] = openTasks.slice(0, 3).map((task) => {
    const tone: WorkspaceDashboardAlertTone =
      task.quadrant === "q1" ? "critical" : "warning";
    return {
      title: task.title,
      detail: task.triggerReason,
      tone,
    };
  });
  return taskAlerts.filter((alert) => alert.detail.length > 0);
}

function buildSuggestions(result: DailyOperationsResult): string[] {
  const lines: string[] = [];

  for (const item of result.items) {
    if (item.status === "healthy") continue;
    for (const line of item.reasoning) {
      if (!lines.includes(line)) lines.push(line);
    }
  }

  for (const task of result.tasks) {
    if (!["open", "in_progress"].includes(task.status)) continue;
    for (const action of task.suggestedActions) {
      if (!lines.includes(action)) lines.push(action);
    }
  }

  if (result.review) {
    for (const delta of result.review.deltas) {
      if (delta.improved === false) {
        const line = `${delta.label}恶化：${delta.previous} → ${delta.current}`;
        if (!lines.includes(line)) lines.push(line);
      }
    }
  }

  if (lines.length === 0) {
    return ["当前未发现紧急风险，可在每日经营待办中查看完整诊断与四象限任务。"];
  }

  return lines.slice(0, 6);
}

function buildMetrics(result: DailyOperationsResult): WorkspaceDashboardMetric[] {
  const m = result.metrics;
  const orderDelta = pctChange(m.orderCount7d, m.orderCountPrev7d);
  const aovDelta = pctChange(m.aov7d, m.aovPrev7d);

  const riskSkuDelta =
    result.review?.deltas.find((delta) => delta.key === "riskSkuCount") ?? null;
  const riskSkuChange =
    riskSkuDelta !== null
      ? riskSkuDelta.current - riskSkuDelta.previous
      : null;

  return [
    {
      label: "销售额",
      value: formatMoney(m.salesAmount7d, m.currency),
      delta: formatPctDelta(m.salesGrowthRate),
      tone: toneHigherIsBetter(m.salesGrowthRate),
    },
    {
      label: "订单数",
      value: String(m.orderCount7d),
      delta: formatPctDelta(orderDelta),
      tone: toneHigherIsBetter(orderDelta),
    },
    {
      label: "转化率",
      value: "—",
      delta: "需 Shopify 弃购或 Analytics",
      tone: "neutral",
      pendingIntegration: true,
    },
    {
      label: "客单价",
      value: formatMoney(m.aov7d, m.currency),
      delta: formatPctDelta(aovDelta),
      tone: toneHigherIsBetter(aovDelta),
    },
    {
      label: "退款率",
      value: `${round(m.refundRate30d)}%`,
      delta: `${m.refundRateDelta >= 0 ? "+" : ""}${round(m.refundRateDelta)}pp`,
      tone: toneLowerIsBetter(m.refundRateDelta),
    },
    {
      label: "库存风险 SKU",
      value: String(m.riskSkuCount),
      delta:
        riskSkuChange === null
          ? watchSkuCountLabel(m.watchSkuCount)
          : `${riskSkuChange >= 0 ? "+" : ""}${riskSkuChange}`,
      tone:
        riskSkuChange === null
          ? m.riskSkuCount > 0
            ? "negative"
            : "neutral"
          : toneLowerIsBetter(riskSkuChange),
    },
  ];
}

function watchSkuCountLabel(watchSkuCount: number): string {
  if (watchSkuCount <= 0) return "关注 SKU 0";
  return `关注 SKU ${watchSkuCount}`;
}

export function emptyWorkspaceDashboardSnapshot(): WorkspaceDashboardSnapshot {
  return {
    hasData: false,
    emptyMessage: EMPTY_ORDER_MESSAGE,
    metrics: [
      { label: "销售额", value: "—", delta: "—", tone: "neutral" },
      { label: "订单数", value: "—", delta: "—", tone: "neutral" },
      { label: "转化率", value: "—", delta: "—", tone: "neutral", pendingIntegration: true },
      { label: "客单价", value: "—", delta: "—", tone: "neutral" },
      { label: "退款率", value: "—", delta: "—", tone: "neutral" },
      { label: "库存风险 SKU", value: "—", delta: "—", tone: "neutral" },
    ],
    alerts: [],
    suggestions: [EMPTY_ORDER_MESSAGE],
    recentTaskSummaries: [],
  };
}

export function buildWorkspaceDashboardFromDailyOps(
  result: DailyOperationsResult,
): WorkspaceDashboardSnapshot {
  if (!result.hasData) {
    return emptyWorkspaceDashboardSnapshot();
  }

  return {
    hasData: true,
    snapshotDate: result.snapshotDate,
    generatedAt: result.generatedAt,
    metrics: buildMetrics(result),
    alerts: buildAlerts(result),
    suggestions: buildSuggestions(result),
    recentTaskSummaries: [],
  };
}
