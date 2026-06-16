import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  DailyOperationsEnvironment,
  DailyOperationsInsight,
  OperationTaskView,
} from "../../server/operations/dailyInspection.server";
import type { TaskQuadrant } from "../../server/operations/diagnosisRules.server";
import { pageColorTokens } from "../page/pageUiStyles";
import {
  axisLabelStyle,
  axisHintStyle,
  matrixAxisLineStyle,
  taskTitleStyle,
  taskSecondaryTextStyle,
  pillButtonStyle,
  listRowMetaStyle,
  metricMetaRowStyle,
  subtleInlineStatStyle,
  overviewMiniLabelStyle,
  overviewMiniValueStyle,
  channelTableWrapStyle,
  summaryCardStyle,
  summaryListItemStyle,
  detailHeroGridStyle,
  detailHeroCardStyle,
  detailTabsWrapStyle,
  detailFocusCardStyle,
  detailContextHeaderStyle,
  detailContextTitleStyle,
  overflowMenuTriggerStyle,
  overflowMenuPopoverStyle,
  overflowMenuItemStyle,
  valueTableStyle,
  valueThStyle,
  valueTdStyle,
} from "./styles";

export const QUADRANTS: TaskQuadrant[] = ["q1", "q2", "q3", "q4"];

/**
 * 矩阵展示顺序：Q1 Q2 / Q3 Q4。
 * 纵轴=紧急程度（上紧急下不紧急），横轴=重要程度（左重要右不重要）。
 */
export const MATRIX_ORDER: TaskQuadrant[] = ["q1", "q2", "q3", "q4"];

export function MatrixUrgencyAxis({
  label,
  highLabel,
  lowLabel,
}: {
  label: string;
  highLabel: string;
  lowLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.35rem",
        width: "2.75rem",
        alignSelf: "stretch",
        padding: "0.15rem 0",
      }}
      aria-hidden
    >
      <span style={axisHintStyle}>{highLabel}</span>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          width: "100%",
          minHeight: 140,
        }}
      >
        <div
          style={{
            ...matrixAxisLineStyle,
            position: "absolute",
            left: "50%",
            top: 4,
            bottom: 4,
            width: 2,
            transform: "translateX(-50%)",
          }}
        />
        <span
          style={{
            ...axisLabelStyle,
            writingMode: "vertical-rl",
            padding: "0.35rem 0.25rem",
            borderRadius: pageColorTokens.radiusControl,
            background: pageColorTokens.surfaceMuted,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            lineHeight: 1.35,
          }}
        >
          {label}
        </span>
      </div>
      <span style={axisHintStyle}>{lowLabel}</span>
    </div>
  );
}

export function MatrixImportanceAxis({
  label,
  highLabel,
  lowLabel,
}: {
  label: string;
  highLabel: string;
  lowLabel: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: "0.55rem",
        paddingTop: "0.15rem",
      }}
      aria-hidden
    >
      <span style={axisHintStyle}>{highLabel}</span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45rem",
          minWidth: 0,
        }}
      >
        <div style={{ ...matrixAxisLineStyle, flex: 1, height: 2 }} />
        <span
          style={{
            ...axisLabelStyle,
            padding: "0.2rem 0.55rem",
            borderRadius: pageColorTokens.radiusControl,
            background: pageColorTokens.surfaceMuted,
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <div style={{ ...matrixAxisLineStyle, flex: 1, height: 2 }} />
      </div>
      <span style={axisHintStyle}>{lowLabel}</span>
    </div>
  );
}

export function priorityTone(priority: string): "critical" | "warning" | "info" {
  if (priority === "P0") return "critical";
  if (priority === "P1") return "warning";
  return "info";
}

export function priorityLabel(
  priority: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (priority === "P0") return t("dailyOps.priorityHigh");
  if (priority === "P1") return t("dailyOps.priorityMedium");
  return t("dailyOps.priorityLow");
}

export function effectTone(effect: InsightEffect): "success" | "info" | "warning" | "critical" {
  if (effect === "revenue") return "success";
  if (effect === "conversion") return "info";
  if (effect === "efficiency") return "warning";
  return "critical";
}

export function effectLabel(
  effect: InsightEffect,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (effect === "revenue") return t("dailyOps.filterEffectRevenue");
  if (effect === "conversion") return t("dailyOps.filterEffectConversion");
  if (effect === "efficiency") return t("dailyOps.filterEffectEfficiency");
  return t("dailyOps.filterEffectRetention");
}

export function statusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  if (status === "done") return "success";
  if (status === "in_progress") return "info";
  if (status === "open") return "warning";
  return "info";
}

export function diagnosisTone(status: string): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

export function insightConfidenceLabel(
  confidence: DailyOperationsInsight["confidence"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (confidence === "high") return t("dailyOps.confidenceHigh");
  if (confidence === "medium") return t("dailyOps.confidenceMedium");
  return t("dailyOps.confidenceLow");
}

export function quadrantLabel(
  quadrant: TaskQuadrant,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return t(`dailyOps.quadrant${quadrant.toUpperCase()}`);
}

export type InsightsView = "today" | "all";
export type InsightEffect = "revenue" | "conversion" | "efficiency" | "retention";
export type DetailSection = "performance" | "risk" | "value" | "task";

export type RiskEnvironmentCard = {
  key: string;
  title: string;
  status: "healthy" | "watch" | "risk";
  source: DataSource;
  primaryMetric: string;
  secondaryMetric: string;
  summary: string;
};

export type TaskPresentation = {
  objective: string;
  impactMetric: string;
  estimatedLift: string;
  roiImpact: string;
  effect: InsightEffect;
};

export type DetailTableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
};

export type DetailTableSection<Row> = {
  key: string;
  title: string;
  subtitle?: string;
  emptyText: string;
  rows: Row[];
  columns: DetailTableColumn<Row>[];
};

export type TaskRelatedSummaryItem = {
  key: string;
  label: string;
  value: string;
};

export type DetailNavTab = {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
};

export type DetailStatItem = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
};

export function formatDeltaPrefix(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value}`;
}

export function taskStatusRank(status: string) {
  switch (status) {
    case "in_progress":
      return 0;
    case "open":
      return 1;
    case "done":
      return 2;
    case "ignored":
      return 3;
    default:
      return 4;
  }
}

export function inferTaskPresentation(
  task: OperationTaskView,
  t: (key: string, options?: Record<string, unknown>) => string,
): TaskPresentation {
  if (
    task.sourceKey === "fulfillment_overdue" ||
    task.sourceKey === "logistics_stale" ||
    task.sourceKey === "routine_shipping"
  ) {
    return {
      objective: t("dailyOps.taskObjectiveFulfillment"),
      impactMetric: t("dailyOps.taskMetricFulfillment"),
      estimatedLift: t("dailyOps.taskLiftFulfillment"),
      roiImpact: t("dailyOps.taskRoiFulfillment"),
      effect: "efficiency",
    };
  }
  if (task.sourceKey === "refund_spike") {
    return {
      objective: t("dailyOps.taskObjectiveRefund"),
      impactMetric: t("dailyOps.taskMetricRefund"),
      estimatedLift: t("dailyOps.taskLiftRefund"),
      roiImpact: t("dailyOps.taskRoiRefund"),
      effect: "retention",
    };
  }
  if (
    task.sourceKey === "inventory_risk" ||
    task.sourceKey === "inventory_replenish_plan"
  ) {
    return {
      objective: t("dailyOps.taskObjectiveInventory"),
      impactMetric: t("dailyOps.taskMetricInventory"),
      estimatedLift: t("dailyOps.taskLiftInventory"),
      roiImpact: t("dailyOps.taskRoiInventory"),
      effect: "revenue",
    };
  }
  return {
    objective: t("dailyOps.taskObjectiveTraffic"),
    impactMetric: t("dailyOps.taskMetricTraffic"),
    estimatedLift: t("dailyOps.taskLiftTraffic"),
    roiImpact: t("dailyOps.taskRoiTraffic"),
    effect: task.sourceKey === "sales_decline" ? "revenue" : "conversion",
  };
}

export function buildTaskPrompt(
  task: OperationTaskView,
  presentation: TaskPresentation,
  taskStatusText: string,
  dueWindowText: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const actionLines =
    task.suggestedActions.length > 0
      ? task.suggestedActions.map((action) => `- ${action}`).join("\n")
      : `- ${t("dailyOps.taskNoSuggestedActions")}`;
  return [
    t("dailyOps.taskPromptHeader"),
    `${t("dailyOps.taskPromptTitle")}：${task.title}`,
    `${t("dailyOps.taskPromptStatus")}：${taskStatusText}`,
    `${t("dailyOps.taskPromptReason")}：${task.triggerReason}`,
    `${t("dailyOps.taskPromptObjective")}：${presentation.objective}`,
    `${t("dailyOps.taskPromptMetric")}：${presentation.impactMetric}`,
    `${t("dailyOps.taskPromptLift")}：${presentation.estimatedLift}`,
    `${t("dailyOps.taskPromptRoi")}：${presentation.roiImpact}`,
    `${t("dailyOps.taskPromptDue")}：${dueWindowText}`,
    task.ownerRole
      ? `${t("dailyOps.taskPromptOwner")}：${task.ownerRole}`
      : `${t("dailyOps.taskPromptOwner")}：${t("dailyOps.taskPromptOwnerUnknown")}`,
    `${t("dailyOps.taskPromptActions")}：\n${actionLines}`,
    "",
    t("dailyOps.taskPromptInstruction"),
  ].join("\n");
}

export function buildRiskEnvironmentCards(
  environments: DailyOperationsEnvironment[],
  t: (key: string, options?: Record<string, unknown>) => string,
): RiskEnvironmentCard[] {
  return environments.map((environment) => {
    if (environment.key === "inventory") {
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: t("dailyOps.riskMetricInventoryValue", {
          count: environment.metrics.riskSkuCount ?? 0,
        }),
        secondaryMetric: t("dailyOps.riskMetricInventoryLoss", {
          amount: environment.metrics.estimatedInventoryLoss ?? 0,
          currency: environment.metrics.currency ?? "",
        }),
        summary: environment.summary,
      };
    }
    if (environment.key === "fulfillment") {
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: t("dailyOps.riskMetricFulfillmentValue", {
          overdue: environment.metrics.overdueOrderCount ?? 0,
          carrier: environment.metrics.carrierIssueCount ?? 0,
        }),
        secondaryMetric: t("dailyOps.riskMetricFulfillmentRate", {
          value: environment.metrics.fulfillmentRate30d ?? 0,
        }),
        summary: environment.summary,
      };
    }
    if (environment.key === "after-sales") {
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: t("dailyOps.riskMetricRefundValue", {
          value: environment.metrics.refundRate30d ?? 0,
        }),
        secondaryMetric: t("dailyOps.riskMetricRefundDelta", {
          value: formatDeltaPrefix(
            typeof environment.metrics.refundRateDelta === "number"
              ? environment.metrics.refundRateDelta
              : null,
          ),
        }),
        summary: environment.summary,
      };
    }
    if (environment.key === "conversion") {
      const hasPixelData = environment.metrics.hasPixelData === 1;
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: hasPixelData
          ? t("dailyOps.riskMetricConversionValue", {
              value: environment.metrics.conversionRate7d ?? "—",
            })
          : t("dailyOps.metricNotConnected"),
        secondaryMetric: hasPixelData
          ? t("dailyOps.riskMetricTrafficValue", {
              value: formatDeltaPrefix(
                typeof environment.metrics.trafficChangeRate === "number"
                  ? environment.metrics.trafficChangeRate
                  : null,
              ),
            })
          : t("dailyOps.riskMetricPixelPending"),
        summary: environment.summary,
      };
    }
    if (environment.key === "new-arrivals") {
      const hasProductOps = environment.source === "real";
      const draftCount = Number(environment.metrics.draftProductCount ?? 0);
      const noImagesCount = Number(environment.metrics.noImagesProductCount ?? 0);
      const noDescCount = Number(environment.metrics.noDescriptionProductCount ?? 0);
      const issueCount = draftCount + noImagesCount + noDescCount;
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: hasProductOps
          ? t("dailyOps.riskMetricNewArrivalValue", {
              draft: draftCount,
              noImages: noImagesCount,
              noDesc: noDescCount,
            })
          : t("dailyOps.riskMetricPending"),
        secondaryMetric: hasProductOps
          ? t("dailyOps.riskMetricNewArrivalIssues", { count: issueCount })
          : t("dailyOps.riskMetricNewArrivalPending"),
        summary: environment.summary,
      };
    }
    if (environment.key === "payments") {
      const hasPaymentData = environment.source === "real";
      const paymentRate = environment.metrics.paymentSuccessRate7d;
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: hasPaymentData
          ? t("dailyOps.riskMetricPaymentValue", {
              value: paymentRate ?? "—",
            })
          : t("dailyOps.riskMetricPending"),
        secondaryMetric: hasPaymentData
          ? t("dailyOps.riskMetricPaymentFailures", {
              count: environment.metrics.paymentFailureCount7d ?? 0,
              successful: environment.metrics.paymentSuccessful7d ?? 0,
              attempts: environment.metrics.paymentAttempts7d ?? 0,
            })
          : t("dailyOps.riskMetricPaymentPending"),
        summary: environment.summary,
      };
    }
    return {
      key: environment.key,
      title: t(environment.titleKey),
      status: environment.status,
      source: environment.source,
      primaryMetric: t("dailyOps.riskMetricPending"),
      secondaryMetric: t("dailyOps.riskMetricRiskControlPending"),
      summary: environment.summary,
    };
  });
}

export const environmentTaskSourceKeys: Record<string, string[]> = {
  inventory: ["inventory_risk", "inventory_replenish_plan"],
  fulfillment: ["fulfillment_overdue", "logistics_stale", "routine_shipping"],
  "after-sales": ["refund_spike"],
  conversion: ["sales_decline", "traffic_conversion_drop"],
};

export function formatDateTimeLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function getObjectArray<T>(input: unknown, key: string): T[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const value = (input as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function buildTaskRelatedSummaryItems(
  relatedObjects: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): TaskRelatedSummaryItem[] {
  const orders = getObjectArray<{ orderNumber?: string }>(relatedObjects, "orders")
    .map((item) => item.orderNumber)
    .filter((value): value is string => Boolean(value));
  const shipments = getObjectArray<{ orderNumber?: string; carrier?: string }>(
    relatedObjects,
    "shipments",
  )
    .map((item) =>
      [item.orderNumber, item.carrier].filter((value): value is string => Boolean(value)).join(" / "),
    )
    .filter(Boolean);
  const skus = getObjectArray<{ sku?: string }>(relatedObjects, "skus")
    .map((item) => item.sku)
    .filter((value): value is string => Boolean(value));
  const topRefundSkus = getObjectArray<{ sku?: string }>(relatedObjects, "topRefundSkus")
    .map((item) => item.sku)
    .filter((value): value is string => Boolean(value));
  const abnormalOrders = getObjectArray<{ orderNumber?: string }>(relatedObjects, "abnormalOrders")
    .map((item) => item.orderNumber)
    .filter((value): value is string => Boolean(value));

  const pickPreview = (values: string[]) =>
    values.length > 4 ? `${values.slice(0, 4).join(", ")} +${values.length - 4}` : values.join(", ");

  const items: TaskRelatedSummaryItem[] = [];
  if (orders.length) {
    items.push({
      key: "orders",
      label: t("orderMonitor.colOrder"),
      value: pickPreview(orders),
    });
  }
  if (shipments.length) {
    items.push({
      key: "shipments",
      label: t("orderMonitor.carrierIssuesTitle"),
      value: pickPreview(shipments),
    });
  }
  if (skus.length) {
    items.push({
      key: "skus",
      label: t("orderMonitor.colSku"),
      value: pickPreview(skus),
    });
  }
  if (topRefundSkus.length) {
    items.push({
      key: "topRefundSkus",
      label: t("orderMonitor.topRefundSkuTitle"),
      value: pickPreview(topRefundSkus),
    });
  }
  if (abnormalOrders.length) {
    items.push({
      key: "abnormalOrders",
      label: t("orderMonitor.abnormalRefundOrdersTitle"),
      value: pickPreview(abnormalOrders),
    });
  }
  return items;
}

export function DetailTableCard<Row>({ section }: { section: DetailTableSection<Row> }) {
  return (
    <div style={detailFocusCardStyle}>
      <div>
        <h3 style={{ ...taskTitleStyle, marginBottom: "0.2rem" }}>{section.title}</h3>
        {section.subtitle ? <p style={taskSecondaryTextStyle}>{section.subtitle}</p> : null}
      </div>
      {section.rows.length === 0 ? (
        <p style={taskSecondaryTextStyle}>{section.emptyText}</p>
      ) : (
        <div style={channelTableWrapStyle}>
          <table style={valueTableStyle}>
            <thead>
              <tr>
                {section.columns.map((column) => (
                  <th key={column.key} style={valueThStyle}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, rowIndex) => (
                <tr key={`${section.key}-${rowIndex}`}>
                  {section.columns.map((column) => (
                    <td key={column.key} style={valueTdStyle}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DetailContextHeader({
  sectionLabel,
  title,
  subtitle,
  badges,
  tabs,
}: {
  sectionLabel: string;
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  tabs?: DetailNavTab[];
}) {
  return (
    <div style={detailContextHeaderStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        <div style={{ ...listRowMetaStyle, gap: "0.4rem" }}>
          <s-badge tone="info">{sectionLabel}</s-badge>
          {badges ?? null}
        </div>
        <h2 style={detailContextTitleStyle}>{title}</h2>
        {subtitle ? <p style={taskSecondaryTextStyle}>{subtitle}</p> : null}
      </div>
      {tabs && tabs.length > 0 ? (
        <div style={detailTabsWrapStyle}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              style={pillButtonStyle(tab.active)}
              onClick={tab.onClick}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DetailStatStrip({
  items,
  isMobile,
}: {
  items: DetailStatItem[];
  isMobile: boolean;
}) {
  return (
    <div
      style={{
        ...detailHeroGridStyle,
        ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
      }}
    >
      {items.map((item) => (
        <div key={item.key} style={detailHeroCardStyle}>
          <span style={overviewMiniLabelStyle}>{item.label}</span>
          <span style={overviewMiniValueStyle}>{item.value}</span>
          {item.hint ? <span style={taskSecondaryTextStyle}>{item.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}

// ── 任务工作台：四象限分组 + 单主操作 + 溢出菜单 ──

export type TaskMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  tone?: "default" | "critical";
  disabled?: boolean;
};

export function TaskOverflowMenu({ items, ariaLabel }: { items: TaskMenuItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} style={{ position: "relative", flex: "0 0 auto" }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        style={overflowMenuTriggerStyle}
        onClick={() => setOpen((prev) => !prev)}
      >
        ⋯
      </button>
      {open ? (
        <div role="menu" style={overflowMenuPopoverStyle}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              style={{
                ...overflowMenuItemStyle(item.tone ?? "default"),
                ...(item.disabled ? { opacity: 0.5, cursor: "not-allowed" } : null),
              }}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SummaryMetricCard({
  label,
  value,
  accent,
  hint,
  hintColor,
  arrow,
}: {
  label: string;
  value: ReactNode;
  accent: string;
  hint?: ReactNode;
  hintColor?: string;
  arrow?: "up" | "down";
}) {
  return (
    <div style={{ ...summaryCardStyle, borderLeft: `3px solid ${accent}` }}>
      <div style={metricMetaRowStyle}>
        <span style={subtleInlineStatStyle}>{label}</span>
      </div>
      <span style={overviewMiniValueStyle}>{value}</span>
      {hint != null ? (
        <span
          style={{
            ...summaryListItemStyle,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            ...(hintColor ? { color: hintColor, fontWeight: 600 } : null),
          }}
        >
          {arrow ? <span aria-hidden="true">{arrow === "up" ? "↑" : "↓"}</span> : null}
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// ── 经营监控：红绿灯雷达 + 行内展开 ──

export type DataSource = "real" | "estimated" | "pending";

export const dataSourceTone: Record<DataSource, "success" | "warning" | "neutral"> = {
  real: "success",
  estimated: "warning",
  pending: "neutral",
};

export function SourceTag({ source }: { source: DataSource }) {
  const { t } = useTranslation();
  const label =
    source === "real"
      ? t("dailyOps.sourceReal")
      : source === "estimated"
        ? t("dailyOps.sourceEstimated")
        : t("dailyOps.sourcePending");
  const tip =
    source === "real"
      ? t("dailyOps.sourceRealTip")
      : source === "estimated"
        ? t("dailyOps.sourceEstimatedTip")
        : t("dailyOps.sourcePendingTip");
  return (
    <s-badge tone={dataSourceTone[source]}>
      <span title={tip}>{label}</span>
    </s-badge>
  );
}

