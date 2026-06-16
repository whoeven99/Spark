import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import {
  ensureDailySnapshot,
  updateOperationTaskStatus,
  type DailyOperationsResult,
  type DailyOperationsEnvironment,
  type DailyOperationsInsight,
  type OperationTaskAction,
  type OperationTaskView,
} from "../server/operations/dailyInspection.server";
import type { TaskQuadrant } from "../server/operations/diagnosisRules.server";
import {
  getShopCostConfig,
  upsertShopCostConfig,
  type ShopCostConfigView,
} from "../server/operations/roi/costConfig.server";
import { ensureSkuCostsFresh } from "../server/operations/roi/skuCostSync.server";
import {
  ensureCustomerValueLayer,
  type CustomerValueAggregates,
} from "../server/operations/customerValue.server";
import {
  computeChannelRoi,
  type ChannelRoiResult,
} from "../server/operations/channelRoi.server";
import {
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  pageColorTokens,
  mobilePageContentStyle,
  pageContentStyle,
  pageEmptyStateStyle,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageAccentBadgeStyle,
} from "./page/pageUiStyles";

type ValueLayerData = {
  costConfig: ShopCostConfigView;
  customers: CustomerValueAggregates;
  channels: ChannelRoiResult;
};

type LoaderData =
  | { ok: true; result: DailyOperationsResult; value: ValueLayerData | null }
  | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    const result = await ensureDailySnapshot(session.shop, {
      shopifyAdmin: admin,
    });

    // 渠道与客户价值层（A 步）：失败不影响诊断与待办主流程
    let value: ValueLayerData | null = null;
    try {
      await ensureSkuCostsFresh(admin, session.shop);
      const costConfig = await getShopCostConfig(session.shop);
      const customers = await ensureCustomerValueLayer(
        session.shop,
        costConfig.defaultGrossMarginPercent,
      );
      const channels = await computeChannelRoi(session.shop, costConfig);
      value = { costConfig, customers, channels };
    } catch (error) {
      console.error("[daily-operations] value layer failed:", error);
    }

    return Response.json({ ok: true, result, value } satisfies LoaderData);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-operations] loader failed:", error);
    return Response.json({ ok: false, error: message } satisfies LoaderData);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  try {
    if (intent === "refresh") {
      await ensureDailySnapshot(session.shop, { force: true });
      return Response.json({ ok: true });
    }
    if (intent === "cost-config") {
      const num = (name: string) => Number(formData.get(name)?.toString() ?? "");
      const config = await upsertShopCostConfig(session.shop, {
        defaultGrossMarginPercent: num("defaultGrossMarginPercent"),
        paymentFeePercent: num("paymentFeePercent"),
        paymentFeeFixed: num("paymentFeeFixed"),
        monthlyFixedCost: num("monthlyFixedCost"),
      });
      // 口径变更后按新毛利率重算客户价值层
      await ensureCustomerValueLayer(session.shop, config.defaultGrossMarginPercent, {
        force: true,
      });
      return Response.json({ ok: true });
    }
    if (intent === "task") {
      const taskId = formData.get("taskId")?.toString() ?? "";
      const taskAction = formData.get("taskAction")?.toString() as
        | OperationTaskAction
        | undefined;
      if (
        !taskId ||
        !taskAction ||
        !["start", "done", "ignore", "reopen"].includes(taskAction)
      ) {
        return Response.json({ ok: false, error: "invalid params" }, { status: 400 });
      }
      const updated = await updateOperationTaskStatus(
        session.shop,
        taskId,
        taskAction,
      );
      if (!updated) {
        return Response.json({ ok: false, error: "task not found" }, { status: 404 });
      }
      return Response.json({ ok: true });
    }
    return Response.json({ ok: false, error: "unsupported intent" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[daily-operations] action failed:", error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};

// ──────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────

const QUADRANTS: TaskQuadrant[] = ["q1", "q2", "q3", "q4"];

/**
 * 矩阵展示顺序：Q1 Q2 / Q3 Q4。
 * 纵轴=紧急程度（上紧急下不紧急），横轴=重要程度（左重要右不重要）。
 */
const MATRIX_ORDER: TaskQuadrant[] = ["q1", "q2", "q3", "q4"];

const quadrantAccentColors: Record<TaskQuadrant, string> = {
  q1: "#dc2626",
  q2: "#ea580c",
  q3: "#4070f4",
  q4: "#6b7280",
};

const quadrantTintColors: Record<TaskQuadrant, string> = {
  q1: "rgba(220, 38, 38, 0.04)",
  q2: "rgba(234, 88, 12, 0.04)",
  q3: "rgba(64, 112, 244, 0.04)",
  q4: "rgba(107, 114, 128, 0.04)",
};

const quadrantCellStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `4px solid ${quadrantAccentColors[quadrant]}`,
  borderRadius: pageColorTokens.radiusCard,
  background: `linear-gradient(180deg, ${quadrantTintColors[quadrant]} 0%, #ffffff 60%)`,
  padding: "0.9rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
  minHeight: "200px",
});

const quadrantCountBadgeStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.5rem",
  height: "1.5rem",
  padding: "0 0.4rem",
  borderRadius: "999px",
  background: quadrantAccentColors[quadrant],
  color: "#fff",
  fontSize: "0.75rem",
  fontWeight: 700,
});

const axisLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: pageColorTokens.textSecondary,
  userSelect: "none",
};

const axisHintStyle: CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  lineHeight: 1.2,
  userSelect: "none",
};

const matrixAxisLineStyle: CSSProperties = {
  background: pageColorTokens.borderSubtle,
  borderRadius: 999,
};

function MatrixUrgencyAxis({
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

function MatrixImportanceAxis({
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

const taskCardStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderLeft: `3px solid ${quadrantAccentColors[quadrant]}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: "1rem",
  background: pageColorTokens.surface,
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
});

const taskCardStateStyle = (status: string): CSSProperties => {
  if (status === "done") {
    return {
      background: "#f9fbfa",
      borderColor: "#dbe7e1",
    };
  }
  if (status === "in_progress") {
    return {
      background: "#fcfcfe",
      boxShadow: "0 0 0 1px rgba(44, 110, 203, 0.08), 0 2px 6px rgba(44, 110, 203, 0.05)",
    };
  }
  return {};
};

const taskTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 700,
  color: pageColorTokens.textBody,
};

const taskMetaTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const taskSecondaryTextStyle: CSSProperties = {
  ...taskMetaTextStyle,
  color: pageColorTokens.textSecondary,
};

const actionListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

function priorityTone(priority: string): "critical" | "warning" | "info" {
  if (priority === "P0") return "critical";
  if (priority === "P1") return "warning";
  return "info";
}

function priorityLabel(
  priority: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (priority === "P0") return t("dailyOps.priorityHigh");
  if (priority === "P1") return t("dailyOps.priorityMedium");
  return t("dailyOps.priorityLow");
}

function effectTone(effect: InsightEffect): "success" | "info" | "warning" | "critical" {
  if (effect === "revenue") return "success";
  if (effect === "conversion") return "info";
  if (effect === "efficiency") return "warning";
  return "critical";
}

function effectLabel(
  effect: InsightEffect,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (effect === "revenue") return t("dailyOps.filterEffectRevenue");
  if (effect === "conversion") return t("dailyOps.filterEffectConversion");
  if (effect === "efficiency") return t("dailyOps.filterEffectEfficiency");
  return t("dailyOps.filterEffectRetention");
}

function statusTone(
  status: string,
): "success" | "warning" | "critical" | "info" {
  if (status === "done") return "success";
  if (status === "in_progress") return "info";
  if (status === "open") return "warning";
  return "info";
}

function diagnosisTone(status: string): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

function insightConfidenceLabel(
  confidence: DailyOperationsInsight["confidence"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (confidence === "high") return t("dailyOps.confidenceHigh");
  if (confidence === "medium") return t("dailyOps.confidenceMedium");
  return t("dailyOps.confidenceLow");
}

function quadrantLabel(
  quadrant: TaskQuadrant,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return t(`dailyOps.quadrant${quadrant.toUpperCase()}`);
}

type InsightsView = "today" | "all";
type TodayTaskTab = "all" | "q1" | "q3" | "in_progress" | "done";
type InsightEffect = "revenue" | "conversion" | "efficiency" | "retention";
type DetailSection = "performance" | "risk" | "value" | "task";

type RiskEnvironmentCard = {
  key: string;
  title: string;
  status: "healthy" | "watch" | "risk";
  source: DataSource;
  primaryMetric: string;
  secondaryMetric: string;
  summary: string;
};

type TaskPresentation = {
  objective: string;
  impactMetric: string;
  estimatedLift: string;
  roiImpact: string;
  effect: InsightEffect;
};

type DetailTableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
};

type DetailTableSection<Row> = {
  key: string;
  title: string;
  subtitle?: string;
  emptyText: string;
  rows: Row[];
  columns: DetailTableColumn<Row>[];
};

type TaskRelatedSummaryItem = {
  key: string;
  label: string;
  value: string;
};

type DetailNavTab = {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
};

type DetailStatItem = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
};

const segmentedNavWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.25rem",
  borderRadius: "999px",
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const segmentedNavButtonStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? pageColorTokens.border : "transparent"}`,
  borderRadius: "999px",
  padding: "0.48rem 0.9rem",
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
  background: active ? pageColorTokens.surface : "transparent",
  boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
});

const insightCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const pillGroupStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const horizontalChipRailStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  overflowX: "auto",
  paddingBottom: "0.15rem",
  scrollbarWidth: "thin",
};

const pillButtonStyle = (active: boolean): CSSProperties => ({
  borderRadius: "999px",
  border: `1px solid ${active ? pageColorTokens.border : pageColorTokens.borderSubtle}`,
  padding: "0.42rem 0.78rem",
  cursor: "pointer",
  background: active ? pageColorTokens.surface : pageColorTokens.surfaceMuted,
  color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
  fontSize: "0.75rem",
  fontWeight: 700,
  boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
});

const insightListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const listSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
};

const listRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr) auto",
  gap: "0.9rem",
  alignItems: "center",
  padding: "0.8rem 0.9rem",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
};

const listRowMainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  minWidth: 0,
};

const listRowMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  alignItems: "center",
  justifyContent: "flex-start",
};

const listRowValueStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
};

const listRowActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  justifyContent: "flex-end",
};

const riskCardStyle = (status: "healthy" | "watch" | "risk"): CSSProperties => ({
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `3px solid ${
    status === "healthy" ? "#15803d" : status === "watch" ? "#d97706" : "#dc2626"
  }`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  minHeight: "168px",
});

const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.55,
};

const toolbarSurfaceStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
  padding: "0.8rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const toolbarLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  letterSpacing: "0.01em",
};

const filterToolbarRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const filterControlWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  minWidth: 0,
  flex: "0 0 auto",
};

const filterSelectStyle: CSSProperties = {
  minWidth: "10rem",
  height: "2rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  fontSize: "0.8125rem",
  padding: "0 0.7rem",
  outline: "none",
};

const metricValueStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.375rem",
  fontWeight: 700,
  lineHeight: 1.2,
  color: pageColorTokens.textPrimary,
};

const metricMetaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const subtleInlineStatStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "999px",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: "0.75rem",
  fontWeight: 600,
};

const quietPanelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "0.7rem 0.8rem",
};

const taskInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.55rem",
};

const taskInfoItemStyle: CSSProperties = {
  ...quietPanelStyle,
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

const taskInfoLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const taskActionsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  paddingTop: "0.15rem",
};

const reviewDeltaCardStyle: CSSProperties = {
  padding: "0.6rem 0.85rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  background: pageColorTokens.surface,
};

const overviewMiniLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const overviewMiniValueStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const valueCardSectionStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const customerTagWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  padding: "0.75rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const channelTableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
};

const caveatPanelStyle: CSSProperties = {
  marginTop: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  padding: "0.75rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const costFormWrapStyle: CSSProperties = {
  padding: "0.85rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "0.7rem",
};

const summaryCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "0.85rem 0.9rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
};

const summaryListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  margin: 0,
};

const summaryListItemStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.5,
};

const detailActionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginTop: "0.15rem",
};

const detailHeroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "0.55rem",
};

const detailHeroCardStyle: CSSProperties = {
  padding: "0.7rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  minWidth: 0,
};

const detailTabsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  padding: "0.7rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const detailSectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const detailFocusCardStyle: CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

const detailInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "0.7rem",
};

const detailInfoCardStyle: CSSProperties = {
  padding: "0.65rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

const detailInfoLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const detailInfoValueStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: pageColorTokens.textBody,
};

const detailTableStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

const monitoringInsightHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const detailContextHeaderStyle: CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const detailContextTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  lineHeight: 1.35,
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const relatedObjectWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  padding: "0.85rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surface,
};

function formatDeltaPrefix(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value}`;
}

function taskStatusRank(status: string) {
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

function inferTaskPresentation(
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

function buildTaskPrompt(
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

function buildRiskEnvironmentCards(
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
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: t("dailyOps.riskMetricPending"),
        secondaryMetric: t("dailyOps.riskMetricNewArrivalPending"),
        summary: environment.summary,
      };
    }
    if (environment.key === "payments") {
      return {
        key: environment.key,
        title: t(environment.titleKey),
        status: environment.status,
        source: environment.source,
        primaryMetric: t("dailyOps.riskMetricPending"),
        secondaryMetric: t("dailyOps.riskMetricPaymentPending"),
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

const environmentTaskSourceKeys: Record<string, string[]> = {
  inventory: ["inventory_risk", "inventory_replenish_plan"],
  fulfillment: ["fulfillment_overdue", "logistics_stale", "routine_shipping"],
  "after-sales": ["refund_spike"],
  conversion: ["sales_decline", "traffic_conversion_drop"],
};

function formatDateTimeLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getObjectArray<T>(input: unknown, key: string): T[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const value = (input as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildTaskRelatedSummaryItems(
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

function DetailTableCard<Row>({ section }: { section: DetailTableSection<Row> }) {
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

function DetailContextHeader({
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

function DetailStatStrip({
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

export default function DailyOperationsPage() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const data = useLoaderData() as LoaderData;
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const busy = fetcher.state !== "idle" || revalidator.state !== "idle";
  const [insightsView, setInsightsView] = useState<InsightsView>("today");
  const detailSection = (searchParams.get("detail") as DetailSection | null) ?? null;
  const riskTabParam =
    (searchParams.get("riskTab") as "environment" | "insights" | "health" | null) ?? null;
  const selectedEnvironmentKey = searchParams.get("environmentKey");
  const selectedInsightKey = searchParams.get("insightKey");
  const selectedTaskId = searchParams.get("taskId");

  const statusText = (status: string) => {
    switch (status) {
      case "healthy":
        return t("dailyOps.statusHealthy");
      case "watch":
        return t("dailyOps.statusWatch");
      default:
        return t("dailyOps.statusRisk");
    }
  };

  const taskStatusText = (status: string) => {
    switch (status) {
      case "open":
        return t("dailyOps.taskStatusOpen");
      case "in_progress":
        return t("dailyOps.taskStatusInProgress");
      case "done":
        return t("dailyOps.taskStatusDone");
      case "ignored":
        return t("dailyOps.taskStatusIgnored");
      default:
        return t("dailyOps.taskStatusAutoClosed");
    }
  };

  const dueWindowText = (window: string) => {
    switch (window) {
      case "today":
        return t("dailyOps.dueWindowToday");
      case "48h":
        return t("dailyOps.dueWindow48h");
      case "this_week":
        return t("dailyOps.dueWindowThisWeek");
      default:
        return t("dailyOps.dueWindowBacklog");
    }
  };

  const submitTaskAction = (taskId: string, taskAction: OperationTaskAction) => {
    fetcher.submit({ intent: "task", taskId, taskAction }, { method: "post" });
  };

  const submitRefresh = () => {
    fetcher.submit({ intent: "refresh" }, { method: "post" });
  };

  const openDetail = (
    section: DetailSection,
    extra?: Partial<{
      riskTab: "environment" | "insights" | "health";
      environmentKey: string;
      insightKey: string;
      taskId: string;
    }>,
  ) => {
    const next = new URLSearchParams(searchParams);
    next.set("detail", section);
    next.delete("riskTab");
    next.delete("environmentKey");
    next.delete("insightKey");
    next.delete("taskId");
    if (extra?.riskTab) next.set("riskTab", extra.riskTab);
    if (extra?.environmentKey) next.set("environmentKey", extra.environmentKey);
    if (extra?.insightKey) next.set("insightKey", extra.insightKey);
    if (extra?.taskId) next.set("taskId", extra.taskId);
    setSearchParams(next);
  };

  const detailReturnTo = useMemo(() => {
    if (!detailSection) return undefined;
    const next = new URLSearchParams(searchParams);
    next.delete("detail");
    next.delete("riskTab");
    next.delete("environmentKey");
    next.delete("insightKey");
    next.delete("taskId");
    const query = next.toString();
    return `/app/daily-operations${query ? `?${query}` : ""}`;
  }, [detailSection, searchParams]);

  return (
    <s-page
      heading={
        detailSection
          ? t(`dailyOps.detailTitle.${detailSection}` as const)
          : t("dailyOps.pageTitle")
      }
    >
      <div
        style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}
      >
        <PageHeaderNav
          title={
            detailSection
              ? t(`dailyOps.detailTitle.${detailSection}` as const)
              : t("dailyOps.pageTitle")
          }
          backLabel={
            detailSection
              ? t("dailyOps.backToOverview")
              : t("common.backToPrevious", { defaultValue: "返回工作台" })
          }
          {...(detailSection
            ? { fallbackPath: "/app/daily-operations", returnTo: detailReturnTo }
            : { workspaceOnly: true })}
          rightAction={
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <s-button
                type="button"
                variant="secondary"
                onClick={submitRefresh}
                {...(busy ? { disabled: true } : {})}
              >
                {busy ? t("dailyOps.refreshing") : t("dailyOps.refresh")}
              </s-button>
            </div>
          }
        />

        {!data.ok ? (
          <div style={pageEmptyStateStyle}>
            <span>{data.error}</span>
          </div>
        ) : !data.result.hasData ? (
          <div style={pageEmptyStateStyle}>
            <span>{t("dailyOps.emptyState")}</span>
          </div>
        ) : (
          <>
            {detailSection ? (
              <DailyOperationsDetail
                key={detailSection}
                detailSection={detailSection}
                result={data.result}
                value={data.value}
                isMobile={isMobile}
                locale={i18n.language}
                statusText={statusText}
                taskStatusText={taskStatusText}
                dueWindowText={dueWindowText}
                selectedTaskId={selectedTaskId}
                selectedEnvironmentKey={selectedEnvironmentKey}
                selectedInsightKey={selectedInsightKey}
                initialRiskTab={riskTabParam}
                onOpenDetail={openDetail}
                onSubmitTaskAction={submitTaskAction}
                busy={busy}
              />
            ) : (
              <DailyOperationsBody
                result={data.result}
                insightsView={insightsView}
                onChangeInsightsView={setInsightsView}
                isMobile={isMobile}
                locale={i18n.language}
                statusText={statusText}
                taskStatusText={taskStatusText}
                onSendTaskToAi={(task, presentation) => {
                  const params = new URLSearchParams(
                    typeof window !== "undefined"
                      ? window.location.search.startsWith("?")
                        ? window.location.search.slice(1)
                        : window.location.search
                      : "",
                  );
                  params.set("panel", "chat");
                  params.set(
                    "prefillTaskPrompt",
                    buildTaskPrompt(
                      task,
                      presentation,
                      taskStatusText(task.status),
                      dueWindowText(task.dueWindow),
                      t,
                    ),
                  );
                  navigate(`/app?${params.toString()}`);
                }}
                onOpenDetail={openDetail}
                onSubmitTaskAction={submitTaskAction}
                busy={busy}
              />
            )}
          </>
        )}
      </div>
    </s-page>
  );
}

function DailyOperationsBody({
  result,
  insightsView,
  onChangeInsightsView,
  isMobile,
  locale,
  statusText,
  taskStatusText,
  onSendTaskToAi,
  onOpenDetail,
  onSubmitTaskAction,
  busy,
}: {
  result: DailyOperationsResult;
  insightsView: InsightsView;
  onChangeInsightsView: (view: InsightsView) => void;
  isMobile: boolean;
  locale: string;
  statusText: (status: string) => string;
  taskStatusText: (status: string) => string;
  onSendTaskToAi: (task: OperationTaskView, presentation: TaskPresentation) => void;
  onOpenDetail: (
    section: DetailSection,
    extra?: Partial<{
      riskTab: "environment" | "insights" | "health";
      environmentKey: string;
      insightKey: string;
      taskId: string;
    }>,
  ) => void;
  onSubmitTaskAction: (taskId: string, action: OperationTaskAction) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [todayTaskTab, setTodayTaskTab] = useState<TodayTaskTab>("all");
  const [allStatusFilter, setAllStatusFilter] = useState("all");
  const [allPriorityFilter, setAllPriorityFilter] = useState("all");
  const [allEffectFilter, setAllEffectFilter] = useState("all");
  const overview = result.overview;
  const hasPixelData = overview.hasPixelData;
  const sessionsValue = overview.sessions7d !== null
    ? String(overview.sessions7d)
    : t("dailyOps.metricNotConnected");
  const conversionValue =
    overview.conversionRate7d !== null
      ? `${overview.conversionRate7d}%`
      : t("dailyOps.metricNotConnected");
  const growthLabel =
    overview.salesGrowthRate === null
      ? t("dailyOps.metricNoBaseline")
      : `${overview.salesGrowthRate >= 0 ? "+" : ""}${overview.salesGrowthRate}%`;
  const sortedTasks = useMemo(
    () =>
      [...result.tasks].sort((left, right) => {
        const rankDiff = taskStatusRank(left.status) - taskStatusRank(right.status);
        if (rankDiff !== 0) return rankDiff;
        const leftTime = new Date(left.resolvedAt ?? left.createdAt).getTime();
        const rightTime = new Date(right.resolvedAt ?? right.createdAt).getTime();
        return rightTime - leftTime;
      }),
    [result.tasks],
  );
  const riskCards = useMemo(
    () => buildRiskEnvironmentCards(result.environments, t),
    [result.environments, t],
  );
  const diagnosisInsights = result.insights;
  const [selectedMonitoringEnvironmentKey, setSelectedMonitoringEnvironmentKey] = useState<string | null>(
    () => result.environments[0]?.key ?? null,
  );
  const reviewImprovedCount =
    result.review?.deltas.filter((delta) => delta.improved === true).length ?? 0;
  const reviewWorsenedCount =
    result.review?.deltas.filter((delta) => delta.improved === false).length ?? 0;
  useEffect(() => {
    if (riskCards.length === 0) {
      setSelectedMonitoringEnvironmentKey(null);
      return;
    }
    if (
      !selectedMonitoringEnvironmentKey ||
      !riskCards.some((card) => card.key === selectedMonitoringEnvironmentKey)
    ) {
      setSelectedMonitoringEnvironmentKey(riskCards[0]?.key ?? null);
    }
  }, [riskCards, selectedMonitoringEnvironmentKey]);
  const selectedMonitoringCard =
    riskCards.find((card) => card.key === selectedMonitoringEnvironmentKey) ?? riskCards[0] ?? null;
  const selectedMonitoringEnvironment = selectedMonitoringCard
    ? result.environments.find((environment) => environment.key === selectedMonitoringCard.key) ?? null
    : null;
  const monitoringInsights = selectedMonitoringEnvironment
    ? diagnosisInsights.filter((item) => item.environmentKeys.includes(selectedMonitoringEnvironment.key))
    : [];
  const monitoringTasks = selectedMonitoringEnvironment
    ? sortedTasks.filter((task) =>
        (environmentTaskSourceKeys[selectedMonitoringEnvironment.key] ?? []).includes(task.sourceKey),
      )
    : [];
  const todayTasks = useMemo(() => {
    if (todayTaskTab === "q1") return sortedTasks.filter((task) => task.quadrant === "q1");
    if (todayTaskTab === "q3") return sortedTasks.filter((task) => task.quadrant === "q3");
    if (todayTaskTab === "in_progress") {
      return sortedTasks.filter((task) => task.status === "in_progress");
    }
    if (todayTaskTab === "done") {
      return sortedTasks.filter((task) => task.status === "done");
    }
    return sortedTasks;
  }, [sortedTasks, todayTaskTab]);
  const allInsightTasks = useMemo(
    () =>
      sortedTasks.filter((task) => {
        if (allStatusFilter !== "all" && task.status !== allStatusFilter) return false;
        if (allPriorityFilter !== "all" && task.priority !== allPriorityFilter) return false;
        if (
          allEffectFilter !== "all" &&
          inferTaskPresentation(task, t).effect !== allEffectFilter
        ) {
          return false;
        }
        return true;
      }),
    [allEffectFilter, allPriorityFilter, allStatusFilter, sortedTasks, t],
  );

  const renderTaskListRow = (task: OperationTaskView) => {
    const presentation = inferTaskPresentation(task, t);
    const closed = ["done", "ignored", "auto_closed"].includes(task.status);
    return (
      <div
        key={task.id}
        style={{
          ...listRowStyle,
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
          ...(closed ? { opacity: 0.74 } : null),
        }}
      >
        <div style={listRowMainStyle}>
          <div style={{ ...listRowMetaStyle, gap: "0.35rem" }}>
            <s-badge tone={priorityTone(task.priority)}>{priorityLabel(task.priority, t)}</s-badge>
            <s-badge tone={effectTone(presentation.effect)}>{effectLabel(presentation.effect, t)}</s-badge>
            <s-badge tone={statusTone(task.status)}>{taskStatusText(task.status)}</s-badge>
          </div>
          <h3 style={taskTitleStyle}>{task.title}</h3>
          <p style={taskSecondaryTextStyle}>
            {t("dailyOps.taskImpactMetricLabel")}: {presentation.impactMetric}
          </p>
        </div>
        <div
          style={{
            ...listRowActionsStyle,
            flexDirection: "column",
            alignItems: isMobile ? "stretch" : "flex-end",
            justifyContent: "flex-start",
          }}
        >
          <s-button
            type="button"
            variant="secondary"
            onClick={() => onSendTaskToAi(task, presentation)}
          >
            {t("dailyOps.actionSendToAi")}
          </s-button>
          <s-button
            type="button"
            variant="tertiary"
            onClick={() => onOpenDetail("task", { taskId: task.id })}
          >
            {t("dailyOps.viewDetail")}
          </s-button>
          {task.status === "open" ? (
            <s-button
              type="button"
              variant="primary"
              onClick={() => onSubmitTaskAction(task.id, "start")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionStart")}
            </s-button>
          ) : null}
          {task.status === "in_progress" ? (
            <s-button
              type="button"
              variant="primary"
              onClick={() => onSubmitTaskAction(task.id, "done")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionDone")}
            </s-button>
          ) : null}
          {closed ? (
            <s-button
              type="button"
              variant="tertiary"
              onClick={() => onSubmitTaskAction(task.id, "reopen")}
              {...(busy ? { disabled: true } : {})}
            >
              {t("dailyOps.actionReopen")}
            </s-button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <section>
        <div
          style={
            isMobile
              ? {
                  ...pageSectionHeaderRowStyle,
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.65rem",
                }
              : pageSectionHeaderRowStyle
          }
        >
          <div style={segmentedNavWrapStyle}>
            <button
              type="button"
              style={segmentedNavButtonStyle(insightsView === "today")}
              onClick={() => onChangeInsightsView("today")}
            >
              {t("dailyOps.todayInsights")}
            </button>
            <button
              type="button"
              style={segmentedNavButtonStyle(insightsView === "all")}
              onClick={() => onChangeInsightsView("all")}
            >
              {t("dailyOps.allInsights")}
            </button>
          </div>
        </div>
        {insightsView === "today" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <PageSurface
              title={t("dailyOps.summaryTitle")}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: isMobile ? "flex-start" : "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  marginBottom: "0.9rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                  <span style={pageAccentBadgeStyle}>
                    {t("dailyOps.snapshotDateLabel", { date: result.snapshotDate })}
                  </span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.generatedAtLabel", {
                      value: new Date(result.generatedAt).toLocaleString(locale),
                    })}
                  </span>
                </div>
              </div>
              <div
                style={{
                  ...summaryGridStyle,
                  ...(isMobile ? { gridTemplateColumns: "1fr 1fr" } : null),
                }}
              >
                <div style={summaryCardStyle}>
                  <div style={metricMetaRowStyle}>
                    <span style={subtleInlineStatStyle}>{t("dailyOps.metricSales7d")}</span>
                  </div>
                  <span style={overviewMiniValueStyle}>
                    {overview.salesAmount7d} {overview.currency}
                  </span>
                  <span style={summaryListItemStyle}>
                    {t("dailyOps.metricGrowth")}: {growthLabel}
                  </span>
                </div>
                <div style={summaryCardStyle}>
                  <div style={metricMetaRowStyle}>
                    <span style={subtleInlineStatStyle}>{t("dailyOps.monitoringTitle")}</span>
                  </div>
                  <span style={overviewMiniValueStyle}>{overview.activeRiskCount}</span>
                  <span style={summaryListItemStyle}>
                    {t("dailyOps.monitoringSummaryCounts", {
                      risk: overview.activeRiskCount,
                      watch: overview.watchRiskCount,
                    })}
                  </span>
                </div>
                <div style={summaryCardStyle}>
                  <div style={metricMetaRowStyle}>
                    <span style={subtleInlineStatStyle}>{t("dailyOps.dataInsightsTitle")}</span>
                  </div>
                  <span style={overviewMiniValueStyle}>{overview.insightCount}</span>
                </div>
                <div style={summaryCardStyle}>
                  <div style={metricMetaRowStyle}>
                    <span style={subtleInlineStatStyle}>{t("dailyOps.taskWorkbenchTitle")}</span>
                  </div>
                  <span style={overviewMiniValueStyle}>{overview.inProgressTaskCount}</span>
                  <span style={summaryListItemStyle}>
                    {t("dailyOps.taskSummaryCounts", {
                      open: overview.openTaskCount,
                      done: overview.doneTaskCount,
                    })}
                  </span>
                </div>
              </div>
              {result.review ? (
                <div
                  style={{
                    ...quietPanelStyle,
                    marginTop: "0.8rem",
                    padding: "0.75rem 0.85rem",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.surfaceMuted,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                  }}
                >
                  <div style={monitoringInsightHeaderStyle}>
                    <strong>{t("dailyOps.summaryReviewTitle")}</strong>
                    <span style={taskSecondaryTextStyle}>
                      {t("dailyOps.summaryReviewInline", {
                        date: result.review.previousDate,
                        improved: reviewImprovedCount,
                        worsened: reviewWorsenedCount,
                      })}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.55rem" }}>
                    {result.review.deltas.map((delta) => (
                      <div
                        key={delta.key}
                        style={{
                          ...reviewDeltaCardStyle,
                          background: pageColorTokens.surface,
                          borderColor: pageColorTokens.divider,
                          borderRadius: pageColorTokens.radiusControl,
                          padding: "0.45rem 0.6rem",
                        }}
                      >
                        <strong>{delta.label}</strong>: {delta.previous} → {delta.current}{" "}
                        <s-badge
                          tone={
                            delta.improved === null
                              ? "info"
                              : delta.improved
                                ? "success"
                                : "critical"
                          }
                        >
                          {delta.improved === null
                            ? t("dailyOps.reviewFlat")
                            : delta.improved
                              ? t("dailyOps.reviewImproved")
                              : t("dailyOps.reviewWorsened")}
                        </s-badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={detailActionRowStyle}>
                <s-button type="button" variant="secondary" onClick={() => onOpenDetail("performance")}>
                  {t("dailyOps.viewDetail")}
                </s-button>
              </div>
            </PageSurface>

            <PageSurface
              title={t("dailyOps.monitoringTitle")}
            >
              {riskCards.length === 0 ? (
                <div style={pageEmptyStateStyle}>{t("dailyOps.monitoringEmpty")}</div>
              ) : (
                <div style={detailSectionStackStyle}>
                  <div style={horizontalChipRailStyle}>
                    {riskCards.map((card) => (
                      <button
                        key={card.key}
                        type="button"
                        style={{
                          ...pillButtonStyle(selectedMonitoringCard?.key === card.key),
                          flex: "0 0 auto",
                        }}
                        onClick={() => setSelectedMonitoringEnvironmentKey(card.key)}
                      >
                        {card.title}
                      </button>
                    ))}
                  </div>
                  {selectedMonitoringCard ? (
                    <div style={detailFocusCardStyle}>
                      <div style={monitoringInsightHeaderStyle}>
                        <div style={listRowMainStyle}>
                          <div style={listRowMetaStyle}>
                            <SourceTag source={selectedMonitoringCard.source} />
                            <s-badge tone={diagnosisTone(selectedMonitoringCard.status)}>
                              {statusText(selectedMonitoringCard.status)}
                            </s-badge>
                          </div>
                          <h3 style={taskTitleStyle}>{selectedMonitoringCard.title}</h3>
                          <p style={taskSecondaryTextStyle}>{selectedMonitoringCard.summary}</p>
                        </div>
                      </div>
                      <div
                        style={{
                          ...detailInfoGridStyle,
                          ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                        }}
                      >
                        <div style={detailInfoCardStyle}>
                          <span style={detailInfoLabelStyle}>{t("dailyOps.metricPrimary")}</span>
                          <span style={detailInfoValueStyle}>{selectedMonitoringCard.primaryMetric}</span>
                        </div>
                        <div style={detailInfoCardStyle}>
                          <span style={detailInfoLabelStyle}>{t("dailyOps.metricSecondary")}</span>
                          <span style={detailInfoValueStyle}>{selectedMonitoringCard.secondaryMetric}</span>
                        </div>
                        <div style={detailInfoCardStyle}>
                          <span style={detailInfoLabelStyle}>{t("dailyOps.monitoringInsightsTitle")}</span>
                          <span style={detailInfoValueStyle}>{monitoringInsights.length}</span>
                        </div>
                        <div style={detailInfoCardStyle}>
                          <span style={detailInfoLabelStyle}>{t("dailyOps.relatedTasksLabel")}</span>
                          <span style={detailInfoValueStyle}>{monitoringTasks.length}</span>
                        </div>
                      </div>
                      <div style={relatedObjectWrapStyle}>
                        <div style={monitoringInsightHeaderStyle}>
                          <strong>{t("dailyOps.monitoringInsightsTitle")}</strong>
                          <span style={taskSecondaryTextStyle}>
                            {t("dailyOps.monitoringTaskCount", { count: monitoringTasks.length })}
                          </span>
                        </div>
                        {monitoringInsights.length === 0 ? (
                          <p style={taskSecondaryTextStyle}>{t("dailyOps.monitoringInsightsEmpty")}</p>
                        ) : (
                          <div style={listSectionStyle}>
                            {monitoringInsights.slice(0, 3).map((item) => (
                              <div
                                key={item.key}
                                style={{
                                  ...listRowStyle,
                                  ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                                }}
                              >
                                <div style={listRowMainStyle}>
                                  <div style={listRowMetaStyle}>
                                    <s-badge tone={diagnosisTone(item.status)}>{statusText(item.status)}</s-badge>
                                    <s-badge>{insightConfidenceLabel(item.confidence, t)}</s-badge>
                                  </div>
                                  <h3 style={taskTitleStyle}>{item.title}</h3>
                                </div>
                                <div style={listRowValueStackStyle}>
                                  <span style={taskMetaTextStyle}>{item.summary}</span>
                                  <span style={taskSecondaryTextStyle}>
                                    {t("dailyOps.insightTaskCount", { count: item.taskCount })}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    ...listRowActionsStyle,
                                    ...(isMobile ? { justifyContent: "flex-start" } : null),
                                  }}
                                >
                                  <s-button
                                    type="button"
                                    variant="tertiary"
                                    onClick={() =>
                                      onOpenDetail("risk", {
                                        riskTab: "insights",
                                        insightKey: item.key,
                                      })
                                    }
                                  >
                                    {t("dailyOps.viewDetail")}
                                  </s-button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              <div style={detailActionRowStyle}>
                <s-button type="button" variant="secondary" onClick={() => onOpenDetail("risk")}>
                  {t("dailyOps.viewDetail")}
                </s-button>
              </div>
            </PageSurface>

            <PageSurface
              title={t("dailyOps.taskWorkbenchTitle")}
              subtitle={t("dailyOps.taskWorkbenchSubtitle")}
            >
              <div style={toolbarSurfaceStyle}>
                <div style={pillGroupStyle}>
                  {[
                    ["all", t("dailyOps.taskTabAll")],
                    ["q1", t("dailyOps.taskTabImportantUrgent")],
                    ["q3", t("dailyOps.taskTabImportant")],
                    ["in_progress", t("dailyOps.taskTabInProgress")],
                    ["done", t("dailyOps.taskTabDone")],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      style={pillButtonStyle(todayTaskTab === key)}
                      onClick={() => setTodayTaskTab(key as TodayTaskTab)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "0.9rem",
                }}
              >
                {todayTasks.length === 0 ? (
                  <div style={pageEmptyStateStyle}>{t("dailyOps.noTasks")}</div>
                ) : (
                  todayTasks.map(renderTaskListRow)
                )}
              </div>
            </PageSurface>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <PageSurface
              title={t("dailyOps.allInsightsTitle")}
            >
              <div style={toolbarSurfaceStyle}>
                <div
                  style={{
                    ...filterToolbarRowStyle,
                    ...(isMobile ? { alignItems: "stretch", gap: "0.65rem" } : null),
                  }}
                >
                  <div
                    style={{
                      ...filterControlWrapStyle,
                      ...(isMobile ? { flexDirection: "column", alignItems: "stretch", flex: "1 1 100%" } : null),
                    }}
                  >
                    <label htmlFor="all-insights-status" style={toolbarLabelStyle}>
                      {t("dailyOps.filterStatusAll")}
                    </label>
                    <select
                      id="all-insights-status"
                      style={{
                        ...filterSelectStyle,
                        ...(isMobile ? { width: "100%", minWidth: 0 } : null),
                      }}
                      value={allStatusFilter}
                      onChange={(event) => setAllStatusFilter(event.target.value)}
                    >
                      <option value="all">{t("dailyOps.filterStatusAll")}</option>
                      <option value="open">{t("dailyOps.taskStatusOpen")}</option>
                      <option value="in_progress">{t("dailyOps.taskStatusInProgress")}</option>
                      <option value="done">{t("dailyOps.taskStatusDone")}</option>
                    </select>
                  </div>
                  <div
                    style={{
                      ...filterControlWrapStyle,
                      ...(isMobile ? { flexDirection: "column", alignItems: "stretch", flex: "1 1 100%" } : null),
                    }}
                  >
                    <label htmlFor="all-insights-priority" style={toolbarLabelStyle}>
                      {t("dailyOps.filterPriorityAll")}
                    </label>
                    <select
                      id="all-insights-priority"
                      style={{
                        ...filterSelectStyle,
                        ...(isMobile ? { width: "100%", minWidth: 0 } : null),
                      }}
                      value={allPriorityFilter}
                      onChange={(event) => setAllPriorityFilter(event.target.value)}
                    >
                      <option value="all">{t("dailyOps.filterPriorityAll")}</option>
                      <option value="P0">{t("dailyOps.priorityHigh")}</option>
                      <option value="P1">{t("dailyOps.priorityMedium")}</option>
                      <option value="P2">{t("dailyOps.priorityLow")}</option>
                    </select>
                  </div>
                  <div
                    style={{
                      ...filterControlWrapStyle,
                      ...(isMobile ? { flexDirection: "column", alignItems: "stretch", flex: "1 1 100%" } : null),
                    }}
                  >
                    <label htmlFor="all-insights-effect" style={toolbarLabelStyle}>
                      {t("dailyOps.filterEffectAll")}
                    </label>
                    <select
                      id="all-insights-effect"
                      style={{
                        ...filterSelectStyle,
                        ...(isMobile ? { width: "100%", minWidth: 0 } : null),
                      }}
                      value={allEffectFilter}
                      onChange={(event) => setAllEffectFilter(event.target.value)}
                    >
                      <option value="all">{t("dailyOps.filterEffectAll")}</option>
                      <option value="revenue">{t("dailyOps.filterEffectRevenue")}</option>
                      <option value="conversion">{t("dailyOps.filterEffectConversion")}</option>
                      <option value="efficiency">{t("dailyOps.filterEffectEfficiency")}</option>
                      <option value="retention">{t("dailyOps.filterEffectRetention")}</option>
                    </select>
                  </div>
                  <div
                    style={{
                      marginLeft: isMobile ? 0 : "auto",
                      ...(isMobile ? { flex: "1 1 100%" } : null),
                    }}
                  >
                    <s-button
                      type="button"
                      variant="tertiary"
                      onClick={() => {
                        setAllStatusFilter("all");
                        setAllPriorityFilter("all");
                        setAllEffectFilter("all");
                      }}
                      {...(isMobile ? { style: { width: "100%" } } : {})}
                    >
                      {t("dailyOps.filterReset")}
                    </s-button>
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "0.9rem",
                }}
              >
                {allInsightTasks.length === 0 ? (
                  <div style={pageEmptyStateStyle}>{t("dailyOps.filterEmpty")}</div>
                ) : (
                  allInsightTasks.map(renderTaskListRow)
                )}
              </div>
            </PageSurface>
          </div>
        )}
        {!hasPixelData ? (
          <p style={{ ...taskSecondaryTextStyle, marginTop: "0.55rem" }}>
            {t("dailyOps.pixelNotConnectedHint")}
          </p>
        ) : null}
      </section>

    </>
  );
}

function DailyOperationsDetail({
  detailSection,
  result,
  value,
  isMobile,
  locale,
  statusText,
  taskStatusText,
  dueWindowText,
  selectedTaskId,
  selectedEnvironmentKey,
  selectedInsightKey,
  initialRiskTab,
  onOpenDetail,
  onSubmitTaskAction,
  busy,
}: {
  detailSection: DetailSection;
  result: DailyOperationsResult;
  value: ValueLayerData | null;
  isMobile: boolean;
  locale: string;
  statusText: (status: string) => string;
  taskStatusText: (status: string) => string;
  dueWindowText: (window: string) => string;
  selectedTaskId: string | null;
  selectedEnvironmentKey: string | null;
  selectedInsightKey: string | null;
  initialRiskTab: "environment" | "insights" | "health" | null;
  onOpenDetail: (
    section: DetailSection,
    extra?: Partial<{
      riskTab: "environment" | "insights" | "health";
      environmentKey: string;
      insightKey: string;
      taskId: string;
    }>,
  ) => void;
  onSubmitTaskAction: (taskId: string, action: OperationTaskAction) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const m = result.metrics;
  const hasPixelData = m.hasPixelData;
  const sessionsValue = hasPixelData ? String(m.sessions7d) : t("dailyOps.metricNotConnected");
  const conversionValue =
    hasPixelData && m.conversionRate7d !== null
      ? `${m.conversionRate7d}%`
      : t("dailyOps.metricNotConnected");
  const growthLabel =
    m.salesGrowthRate === null
      ? t("dailyOps.metricNoBaseline")
      : `${m.salesGrowthRate >= 0 ? "+" : ""}${m.salesGrowthRate}%`;
  const riskCards = buildRiskEnvironmentCards(result.environments, t);
  const diagnosisInsights = result.insights;
  const [riskTab, setRiskTab] = useState<"environment" | "insights" | "health">(
    initialRiskTab ?? "environment",
  );
  const [valueTab, setValueTab] = useState<"framework" | "customers" | "channels" | "cost">(
    "framework",
  );
  const selectedTask = selectedTaskId
    ? result.tasks.find((task) => task.id === selectedTaskId) ?? null
    : null;
  const selectedEnvironment = selectedEnvironmentKey
    ? result.environments.find((environment) => environment.key === selectedEnvironmentKey) ?? null
    : null;
  const selectedEnvironmentCard = selectedEnvironment
    ? riskCards.find((card) => card.key === selectedEnvironment.key) ?? null
    : null;
  const orderedRiskCards = useMemo(() => {
    if (!selectedEnvironmentKey) return riskCards;
    return [...riskCards].sort((left, right) => {
      if (left.key === selectedEnvironmentKey) return -1;
      if (right.key === selectedEnvironmentKey) return 1;
      return 0;
    });
  }, [riskCards, selectedEnvironmentKey]);
  const orderedInsights = useMemo(() => {
    if (!selectedInsightKey) return diagnosisInsights;
    return [...diagnosisInsights].sort((left, right) => {
      if (left.key === selectedInsightKey) return -1;
      if (right.key === selectedInsightKey) return 1;
      return 0;
    });
  }, [diagnosisInsights, selectedInsightKey]);
  const selectedEnvironmentInsights = selectedEnvironment
    ? diagnosisInsights.filter((item) => item.environmentKeys.includes(selectedEnvironment.key))
    : [];
  const selectedEnvironmentTasks = selectedEnvironment
    ? result.tasks.filter((task) =>
        (environmentTaskSourceKeys[selectedEnvironment.key] ?? []).includes(task.sourceKey),
      )
    : [];
  const selectedEnvironmentSections = useMemo<DetailTableSection<any>[]>(() => {
    if (!selectedEnvironment) return [];
    switch (selectedEnvironment.key) {
      case "after-sales":
        return [
          {
            key: "refund-orders",
            title: t("orderMonitor.abnormalRefundOrdersTitle"),
            subtitle: t("dailyOps.detailRelatedObjectsSubtitle"),
            emptyText: t("orderMonitor.emptyAbnormalRefund"),
            rows: result.detail.abnormalRefundOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "rate",
                header: t("orderMonitor.colRefundRatio"),
                render: (row) => (row.rate === null ? "—" : `${row.rate}%`),
              },
              {
                key: "reason",
                header: t("orderMonitor.colReason"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.reason}</span>,
              },
              {
                key: "processedAt",
                header: t("orderMonitor.colProcessedAt"),
                render: (row) => formatDateTimeLabel(row.processedAt),
              },
            ],
          },
          {
            key: "refund-skus",
            title: t("orderMonitor.topRefundSkuTitle"),
            emptyText: t("orderMonitor.emptyRefundSku"),
            rows: result.detail.topRefundSkus,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "qty",
                header: t("orderMonitor.colQty"),
                render: (row) => row.quantity,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "reason",
                header: t("orderMonitor.colReason"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.reason}</span>,
              },
            ],
          },
        ];
      case "fulfillment":
        return [
          {
            key: "overdue-orders",
            title: t("orderMonitor.overdueOrdersTitle"),
            emptyText: t("orderMonitor.emptyOverdue"),
            rows: result.detail.overdueOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "ageHours",
                header: t("orderMonitor.colAgeHours"),
                render: (row) => row.ageHours,
              },
              {
                key: "status",
                header: t("orderMonitor.colStatus"),
                render: (row) => row.fulfillmentStatus,
              },
              {
                key: "customer",
                header: t("orderMonitor.colCustomer"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.customer}</span>,
              },
            ],
          },
          {
            key: "carrier-issues",
            title: t("orderMonitor.carrierIssuesTitle"),
            emptyText: t("orderMonitor.emptyCarrierIssues"),
            rows: result.detail.carrierIssues,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "carrier",
                header: t("orderMonitor.colCarrier"),
                render: (row) => row.carrier,
              },
              {
                key: "tracking",
                header: t("orderMonitor.colTracking"),
                render: (row) => row.trackingNumber,
              },
              {
                key: "shipmentStatus",
                header: t("orderMonitor.colShipmentStatus"),
                render: (row) => row.shipmentStatus,
              },
              {
                key: "ageDays",
                header: t("orderMonitor.colAgeDays"),
                render: (row) => row.ageDays,
              },
            ],
          },
          {
            key: "routine-orders",
            title: t("orderMonitor.unfulfilledOrdersTitle"),
            emptyText: t("orderMonitor.emptyUnfulfilled"),
            rows: result.detail.routineUnfulfilledOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "ageHours",
                header: t("orderMonitor.colAgeHours"),
                render: (row) => row.ageHours,
              },
              {
                key: "status",
                header: t("orderMonitor.colStatus"),
                render: (row) => row.fulfillmentStatus,
              },
              {
                key: "customer",
                header: t("orderMonitor.colCustomer"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.customer}</span>,
              },
            ],
          },
        ];
      case "inventory":
        return [
          {
            key: "inventory-risks",
            title: t("orderMonitor.inventoryRiskTitle"),
            subtitle: t("orderMonitor.inventoryRiskSubtitle", {
              count: result.detail.inventoryRisks.filter((item) => item.risk === "risk").length,
              loss: result.metrics.estimatedInventoryLoss,
              currency: result.metrics.currency,
            }),
            emptyText: t("orderMonitor.emptyInventoryRisk"),
            rows: result.detail.inventoryRisks,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "variant",
                header: t("orderMonitor.colVariantTitle"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.variantTitle}</span>,
              },
              {
                key: "available",
                header: t("orderMonitor.colAvailable"),
                render: (row) => row.available,
              },
              {
                key: "velocity",
                header: t("orderMonitor.colVelocity"),
                render: (row) => row.dailySalesVelocity,
              },
              {
                key: "sellableDays",
                header: t("orderMonitor.colSellableDays"),
                render: (row) => (row.sellableDays === null ? "—" : row.sellableDays),
              },
              {
                key: "risk",
                header: t("orderMonitor.colPriority"),
                render: (row) => (
                  <s-badge tone={diagnosisTone(row.risk)}>{statusText(row.risk)}</s-badge>
                ),
              },
              {
                key: "loss",
                header: t("orderMonitor.colLoss"),
                render: (row) => row.estimatedLoss,
              },
            ],
          },
        ];
      default:
        return [];
    }
  }, [result.detail, result.metrics.currency, result.metrics.estimatedInventoryLoss, selectedEnvironment, statusText, t]);
  const selectedInsight = selectedInsightKey
    ? diagnosisInsights.find((item) => item.key === selectedInsightKey) ?? null
    : null;
  const selectedInsightTasks = selectedInsight
    ? result.tasks.filter((task) => selectedInsight.relatedTaskSourceKeys.includes(task.sourceKey))
    : [];
  const selectedInsightEnvironmentCards = selectedInsight
    ? riskCards.filter((card) => selectedInsight.environmentKeys.includes(card.key))
    : [];
  const selectedInsightSections = useMemo<DetailTableSection<any>[]>(() => {
    if (!selectedInsight) return [];
    switch (selectedInsight.diagnosisKey) {
      case "refund_health":
        return [
          {
            key: "insight-refund-orders",
            title: t("orderMonitor.abnormalRefundOrdersTitle"),
            emptyText: t("orderMonitor.emptyAbnormalRefund"),
            rows: result.detail.abnormalRefundOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "reason",
                header: t("orderMonitor.colReason"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.reason}</span>,
              },
              {
                key: "skus",
                header: t("dailyOps.relatedObjectsLabel"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.skus}</span>,
              },
            ],
          },
          {
            key: "insight-refund-skus",
            title: t("orderMonitor.topRefundSkuTitle"),
            emptyText: t("orderMonitor.emptyRefundSku"),
            rows: result.detail.topRefundSkus,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "amount",
                header: t("orderMonitor.colRefundAmount"),
                render: (row) => row.amount,
              },
              {
                key: "qty",
                header: t("orderMonitor.colQty"),
                render: (row) => row.quantity,
              },
            ],
          },
        ];
      case "inventory_health":
        return [
          {
            key: "insight-inventory-risks",
            title: t("orderMonitor.inventoryRiskTitle"),
            emptyText: t("orderMonitor.emptyInventoryRisk"),
            rows: result.detail.inventoryRisks,
            columns: [
              {
                key: "sku",
                header: t("orderMonitor.colSku"),
                render: (row) => row.sku,
              },
              {
                key: "product",
                header: t("orderMonitor.colProduct"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.title}</span>,
              },
              {
                key: "sellableDays",
                header: t("orderMonitor.colSellableDays"),
                render: (row) => (row.sellableDays === null ? "—" : row.sellableDays),
              },
              {
                key: "priority",
                header: t("orderMonitor.colPriority"),
                render: (row) => (
                  <s-badge tone={diagnosisTone(row.risk)}>{statusText(row.risk)}</s-badge>
                ),
              },
              {
                key: "loss",
                header: t("orderMonitor.colLoss"),
                render: (row) => row.estimatedLoss,
              },
            ],
          },
        ];
      case "fulfillment_health":
      case "logistics_anomaly":
        return [
          {
            key: "insight-overdue-orders",
            title: t("orderMonitor.overdueOrdersTitle"),
            emptyText: t("orderMonitor.emptyOverdue"),
            rows: result.detail.overdueOrders,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "ageHours",
                header: t("orderMonitor.colAgeHours"),
                render: (row) => row.ageHours,
              },
              {
                key: "status",
                header: t("orderMonitor.colStatus"),
                render: (row) => row.fulfillmentStatus,
              },
              {
                key: "customer",
                header: t("orderMonitor.colCustomer"),
                render: (row) => <span style={{ whiteSpace: "normal" }}>{row.customer}</span>,
              },
            ],
          },
          {
            key: "insight-carrier-issues",
            title: t("orderMonitor.carrierIssuesTitle"),
            emptyText: t("orderMonitor.emptyCarrierIssues"),
            rows: result.detail.carrierIssues,
            columns: [
              {
                key: "order",
                header: t("orderMonitor.colOrder"),
                render: (row) => row.orderNumber,
              },
              {
                key: "carrier",
                header: t("orderMonitor.colCarrier"),
                render: (row) => row.carrier,
              },
              {
                key: "shipmentStatus",
                header: t("orderMonitor.colShipmentStatus"),
                render: (row) => row.shipmentStatus,
              },
              {
                key: "ageDays",
                header: t("orderMonitor.colAgeDays"),
                render: (row) => row.ageDays,
              },
            ],
          },
        ];
      default:
        return [];
    }
  }, [result.detail, selectedInsight, statusText, t]);
  const selectedTaskRelatedSummary = selectedTask
    ? buildTaskRelatedSummaryItems(selectedTask.relatedObjects, t)
    : [];
  const reviewImprovedCount =
    result.review?.deltas.filter((delta) => delta.improved === true).length ?? 0;
  const reviewWorsenedCount =
    result.review?.deltas.filter((delta) => delta.improved === false).length ?? 0;
  const riskTabs: DetailNavTab[] = [
    {
      key: "environment",
      label: t("dailyOps.detailTabEnvironment"),
      active: riskTab === "environment",
      onClick: () => {
        setRiskTab("environment");
        onOpenDetail("risk", { riskTab: "environment" });
      },
    },
    {
      key: "insights",
      label: t("dailyOps.detailTabInsights"),
      active: riskTab === "insights",
      onClick: () => {
        setRiskTab("insights");
        onOpenDetail("risk", { riskTab: "insights" });
      },
    },
    {
      key: "health",
      label: t("dailyOps.detailTabHealth"),
      active: riskTab === "health",
      onClick: () => {
        setRiskTab("health");
        onOpenDetail("risk", { riskTab: "health" });
      },
    },
  ];
  const riskContextTitle =
    riskTab === "environment"
      ? selectedEnvironmentCard?.title ?? t("dailyOps.riskEnvironmentTitle")
      : riskTab === "insights"
        ? selectedInsight?.title ?? t("dailyOps.dataInsightsTitle")
        : t("dailyOps.healthTitle");
  const riskContextSubtitle =
    riskTab === "environment"
      ? selectedEnvironment?.summary ??
        (selectedEnvironmentCard ? selectedEnvironmentCard.summary : t("dailyOps.detailRiskSelectEnvironment"))
      : riskTab === "insights"
        ? selectedInsight?.summary ?? t("dailyOps.detailRiskSelectInsight")
        : t("dailyOps.healthSubtitle");
  const valueTabs: DetailNavTab[] = [
    {
      key: "framework",
      label: t("dailyOps.detailTabFramework"),
      active: valueTab === "framework",
      onClick: () => setValueTab("framework"),
    },
    {
      key: "customers",
      label: t("dailyOps.detailTabCustomers"),
      active: valueTab === "customers",
      onClick: () => setValueTab("customers"),
    },
    {
      key: "channels",
      label: t("dailyOps.detailTabChannels"),
      active: valueTab === "channels",
      onClick: () => setValueTab("channels"),
    },
    {
      key: "cost",
      label: t("dailyOps.detailTabCost"),
      active: valueTab === "cost",
      onClick: () => setValueTab("cost"),
    },
  ];

  if (detailSection === "performance") {
    return (
      <div style={detailSectionStackStyle}>
        <DetailContextHeader
          sectionLabel={t("dailyOps.detailTitle.performance")}
          title={t("dailyOps.keyMetricsTitle")}
          subtitle={t("dailyOps.keyMetricsSubtitle", { shop: result.shop })}
          badges={
            <s-badge tone="info">
              {t("dailyOps.generatedAtLabel", {
                value: new Date(result.generatedAt).toLocaleString(locale),
              })}
            </s-badge>
          }
        />
        <DetailStatStrip
          isMobile={isMobile}
          items={[
            {
              key: "sales",
              label: t("dailyOps.metricSales7d"),
              value: `${m.salesAmount7d} ${m.currency}`,
              hint: `${t("dailyOps.metricGrowth")}: ${growthLabel}`,
            },
            {
              key: "conversion",
              label: t("dailyOps.metricGroupConversion"),
              value: conversionValue,
              hint: `${t("dailyOps.metricGroupTraffic")}: ${sessionsValue}`,
            },
            {
              key: "review",
              label: t("dailyOps.detailHeroReview"),
              value: result.review?.resolvedTaskCount ?? 0,
              hint: result.review
                ? t("dailyOps.summaryReviewInline", {
                    date: result.review.previousDate,
                    improved: reviewImprovedCount,
                    worsened: reviewWorsenedCount,
                  })
                : t("dailyOps.reviewResolved", { count: result.review?.resolvedTaskCount ?? 0 }),
            },
          ]}
        />
        <PageSurface
          title={t("dailyOps.keyMetricsTitle")}
          subtitle={t("dailyOps.keyMetricsSubtitle", { shop: result.shop })}
        >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                gap: "0.9rem",
              }}
            >
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupTraffic")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricTrafficChange", {
                      value:
                        m.trafficChangeRate === null
                          ? t("dailyOps.metricNoBaseline")
                          : `${formatDeltaPrefix(m.trafficChangeRate)}%`,
                    })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>{sessionsValue}</h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricTrafficHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupAov")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricAovPrev", { value: m.aovPrev7d })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>
                  {m.aov7d} {m.currency}
                </h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricAovHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupConversion")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricConversionPrev", {
                      value:
                        m.conversionRatePrev7d === null
                          ? t("dailyOps.metricNoBaseline")
                          : `${m.conversionRatePrev7d}%`,
                    })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>{conversionValue}</h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricConversionHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupCost")}</span>
                  <span style={taskSecondaryTextStyle}>
                    {t("dailyOps.metricRefundDeltaShort", {
                      value: `${formatDeltaPrefix(m.refundRateDelta)}pp`,
                    })}
                  </span>
                </div>
                <h3 style={metricValueStyle}>{`${m.refundRate30d}%`}</h3>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricCostHint")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupShortRoi")}</span>
                  <span style={taskSecondaryTextStyle}>{t("dailyOps.metricSales7d")}</span>
                </div>
                <h3 style={metricValueStyle}>{growthLabel}</h3>
                <p style={taskSecondaryTextStyle}>{t("dailyOps.metricShortRoiHintLine1")}</p>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricShortRoiHintLine2")}</p>
              </div>
              <div style={insightCardStyle}>
                <div style={metricMetaRowStyle}>
                  <span style={subtleInlineStatStyle}>{t("dailyOps.metricGroupLongRoi")}</span>
                  <span style={taskSecondaryTextStyle}>{t("dailyOps.customerTitle")}</span>
                </div>
                <h3 style={metricValueStyle}>
                  {value
                    ? `${value.customers.averageDynamicLtv} ${m.currency}`
                    : t("dailyOps.metricNotConnected")}
                </h3>
                <p style={taskSecondaryTextStyle}>{t("dailyOps.metricLongRoiHintLine1")}</p>
                <p style={taskMetaTextStyle}>{t("dailyOps.metricLongRoiHintLine2")}</p>
              </div>
            </div>
            <div style={{ ...detailActionRowStyle, marginTop: "0.75rem" }}>
              <span style={taskSecondaryTextStyle}>
                {t("dailyOps.generatedAtLabel", {
                  value: new Date(result.generatedAt).toLocaleString(locale),
                })}
              </span>
              {result.review ? (
                <span style={taskSecondaryTextStyle}>
                  {t("dailyOps.reviewResolved", { count: result.review.resolvedTaskCount })}
                </span>
              ) : null}
            </div>
            {result.review ? (
              <div
                style={{
                  marginTop: "0.75rem",
                  padding: "0.8rem 0.9rem",
                  borderRadius: pageColorTokens.radiusControl,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  background: pageColorTokens.surfaceMuted,
                }}
              >
                <p style={{ ...taskMetaTextStyle, marginBottom: "0.6rem" }}>
                  {t("dailyOps.summaryReviewInline", {
                    date: result.review.previousDate,
                    improved: reviewImprovedCount,
                    worsened: reviewWorsenedCount,
                  })}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                  {result.review.deltas.map((delta) => (
                    <div key={delta.key} style={reviewDeltaCardStyle}>
                      <strong>{delta.label}</strong>: {delta.previous} → {delta.current}{" "}
                      <s-badge
                        tone={
                          delta.improved === null
                            ? "info"
                            : delta.improved
                              ? "success"
                              : "critical"
                        }
                      >
                        {delta.improved === null
                          ? t("dailyOps.reviewFlat")
                          : delta.improved
                            ? t("dailyOps.reviewImproved")
                            : t("dailyOps.reviewWorsened")}
                      </s-badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
        </PageSurface>
      </div>
    );
  }

  if (detailSection === "risk") {
    return (
      <div style={detailSectionStackStyle}>
        <DetailContextHeader
          sectionLabel={t("dailyOps.detailTitle.risk")}
          title={riskContextTitle}
          subtitle={riskContextSubtitle}
          badges={
            riskTab === "environment" && selectedEnvironmentCard ? (
              <>
                <SourceTag source={selectedEnvironmentCard.source} />
                <s-badge tone={diagnosisTone(selectedEnvironmentCard.status)}>
                  {statusText(selectedEnvironmentCard.status)}
                </s-badge>
              </>
            ) : riskTab === "insights" && selectedInsight ? (
              <>
                <s-badge tone={diagnosisTone(selectedInsight.status)}>
                  {statusText(selectedInsight.status)}
                </s-badge>
                <s-badge>{insightConfidenceLabel(selectedInsight.confidence, t)}</s-badge>
              </>
            ) : (
              <s-badge tone="info">{result.items.length}</s-badge>
            )
          }
          tabs={riskTabs}
        />
        <DetailStatStrip
          isMobile={isMobile}
          items={[
            {
              key: "risk",
              label: t("dailyOps.riskEnvironmentTitle"),
              value: riskCards.filter((card) => card.status === "risk").length,
              hint: t("dailyOps.detailRiskCritical"),
            },
            {
              key: "insights",
              label: t("dailyOps.dataInsightsTitle"),
              value: diagnosisInsights.length,
              hint: t("dailyOps.detailRiskInsights"),
            },
            {
              key: "health",
              label: t("dailyOps.healthTitle"),
              value: result.items.length,
              hint: t("dailyOps.detailRiskHealth"),
            },
          ]}
        />
        {riskTab === "environment" ? (
          <div style={detailSectionStackStyle}>
            <PageSurface
              title={t("dailyOps.riskEnvironmentTitle")}
              subtitle={t("dailyOps.riskEnvironmentSubtitle")}
            >
              <div style={listSectionStyle}>
                {orderedRiskCards.map((card) => (
                  <div
                    key={card.key}
                    style={{
                      ...listRowStyle,
                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                      ...(card.key === selectedEnvironmentKey
                        ? {
                            borderColor: pageColorTokens.borderStrong,
                            boxShadow: "0 0 0 1px rgba(44, 110, 203, 0.08)",
                          }
                        : null),
                    }}
                  >
                    <div style={listRowMainStyle}>
                      <div style={listRowMetaStyle}>
                        <SourceTag source={card.source} />
                        <s-badge tone={diagnosisTone(card.status)}>{statusText(card.status)}</s-badge>
                      </div>
                      <h3 style={taskTitleStyle}>{card.title}</h3>
                      <p style={taskSecondaryTextStyle}>{card.summary}</p>
                    </div>
                    <div style={listRowValueStackStyle}>
                      <span style={taskMetaTextStyle}>{card.primaryMetric}</span>
                      <span style={taskSecondaryTextStyle}>{card.secondaryMetric}</span>
                    </div>
                    <div
                      style={{
                        ...listRowActionsStyle,
                        ...(isMobile ? { justifyContent: "flex-start" } : null),
                      }}
                    >
                      <s-button
                        type="button"
                        variant="tertiary"
                        onClick={() =>
                          onOpenDetail("risk", {
                            riskTab: "environment",
                            environmentKey: card.key,
                          })
                        }
                      >
                        {t("dailyOps.viewDetail")}
                      </s-button>
                    </div>
                  </div>
                ))}
              </div>
            </PageSurface>
            {selectedEnvironmentCard ? (
              <PageSurface
                title={selectedEnvironmentCard.title}
                subtitle={selectedEnvironment?.summary ?? selectedEnvironmentCard.summary}
              >
                <div style={detailFocusCardStyle}>
                  <div style={listRowMetaStyle}>
                    <SourceTag source={selectedEnvironmentCard.source} />
                    <s-badge tone={diagnosisTone(selectedEnvironmentCard.status)}>
                      {statusText(selectedEnvironmentCard.status)}
                    </s-badge>
                  </div>
                  <div
                    style={{
                      ...detailInfoGridStyle,
                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                    }}
                  >
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.metricPrimary")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentCard.primaryMetric}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.metricSecondary")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentCard.secondaryMetric}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.dataInsightsTitle")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentInsights.length}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.taskWorkbenchTitle")}</span>
                      <span style={detailInfoValueStyle}>{selectedEnvironmentTasks.length}</span>
                    </div>
                  </div>
                </div>
                {selectedEnvironmentSections.length > 0 ? (
                  <div style={{ ...detailTableStackStyle, marginTop: "0.9rem" }}>
                    {selectedEnvironmentSections.map((section) => (
                      <DetailTableCard key={section.key} section={section} />
                    ))}
                  </div>
                ) : (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailRelatedObjectsEmpty")}</strong>
                  </div>
                )}
                {selectedEnvironmentTasks.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.relatedTasksLabel")}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {selectedEnvironmentTasks.slice(0, 4).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.75rem",
                            borderRadius: pageColorTokens.radiusControl,
                            border: `1px solid ${pageColorTokens.borderSubtle}`,
                            background: pageColorTokens.surface,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() => onOpenDetail("task", { taskId: task.id })}
                        >
                          <span style={taskMetaTextStyle}>{task.title}</span>
                          <s-badge tone={statusTone(task.status)}>
                            {taskStatusText(task.status)}
                          </s-badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </PageSurface>
            ) : (
              <PageSurface
                title={t("dailyOps.detailRelatedObjectsTitle")}
                subtitle={t("dailyOps.detailRiskSelectEnvironment")}
              >
                <div style={pageEmptyStateStyle}>{t("dailyOps.detailRiskSelectEnvironment")}</div>
              </PageSurface>
            )}
          </div>
        ) : riskTab === "insights" ? (
          <div style={detailSectionStackStyle}>
            <PageSurface
              title={t("dailyOps.dataInsightsTitle")}
              subtitle={t("dailyOps.dataInsightsSubtitle")}
            >
              {orderedInsights.length === 0 ? (
                <p style={taskSecondaryTextStyle}>{t("dailyOps.dataInsightsEmpty")}</p>
              ) : (
                <div style={listSectionStyle}>
                  {orderedInsights.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        ...insightCardStyle,
                        ...(item.key === selectedInsightKey
                          ? {
                              borderColor: pageColorTokens.borderStrong,
                              boxShadow: "0 0 0 1px rgba(44, 110, 203, 0.08)",
                            }
                          : null),
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <h3 style={taskTitleStyle}>{item.title}</h3>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <s-badge tone={diagnosisTone(item.status)}>{statusText(item.status)}</s-badge>
                          <s-badge>{insightConfidenceLabel(item.confidence, t)}</s-badge>
                        </div>
                      </div>
                      <p style={taskMetaTextStyle}>{item.summary}</p>
                      <div style={quietPanelStyle}>
                        {item.evidence.map((line, index) => (
                          <p key={`e-${item.key}-${index}`} style={taskSecondaryTextStyle}>
                            {line}
                          </p>
                        ))}
                      </div>
                      {item.reasoning.length > 0 ? (
                        <div style={quietPanelStyle}>
                          {item.reasoning.map((line, index) => (
                            <p key={`r-${item.key}-${index}`} style={taskMetaTextStyle}>
                              {line}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div style={detailActionRowStyle}>
                        <span style={taskSecondaryTextStyle}>
                          {t("dailyOps.insightTaskCount", { count: item.taskCount })}
                        </span>
                        <s-button
                          type="button"
                          variant="tertiary"
                          onClick={() =>
                            onOpenDetail("risk", {
                              riskTab: "insights",
                              insightKey: item.key,
                            })
                          }
                        >
                          {t("dailyOps.viewDetail")}
                        </s-button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PageSurface>
            {selectedInsight ? (
              <PageSurface title={selectedInsight.title} subtitle={selectedInsight.summary}>
                <div style={detailFocusCardStyle}>
                  <div style={listRowMetaStyle}>
                    <s-badge tone={diagnosisTone(selectedInsight.status)}>
                      {statusText(selectedInsight.status)}
                    </s-badge>
                    <s-badge>{insightConfidenceLabel(selectedInsight.confidence, t)}</s-badge>
                  </div>
                  <div
                    style={{
                      ...detailInfoGridStyle,
                      ...(isMobile ? { gridTemplateColumns: "1fr" } : null),
                    }}
                  >
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.relatedObjectsLabel")}</span>
                      <span style={detailInfoValueStyle}>
                        {selectedInsightSections.length > 0
                          ? selectedInsightSections.reduce((sum, section) => sum + section.rows.length, 0)
                          : "—"}
                      </span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.relatedTasksLabel")}</span>
                      <span style={detailInfoValueStyle}>{selectedInsightTasks.length}</span>
                    </div>
                    <div style={detailInfoCardStyle}>
                      <span style={detailInfoLabelStyle}>{t("dailyOps.riskEnvironmentTitle")}</span>
                      <span style={detailInfoValueStyle}>{selectedInsightEnvironmentCards.length}</span>
                    </div>
                  </div>
                </div>
                <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                  <strong>{t("dailyOps.detailInsightEvidenceTitle")}</strong>
                  {selectedInsight.evidence.map((line, index) => (
                    <p key={`selected-e-${index}`} style={taskSecondaryTextStyle}>
                      {line}
                    </p>
                  ))}
                </div>
                {selectedInsight.reasoning.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailInsightReasoningTitle")}</strong>
                    {selectedInsight.reasoning.map((line, index) => (
                      <p key={`selected-r-${index}`} style={taskMetaTextStyle}>
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {selectedInsightSections.length > 0 ? (
                  <div style={{ ...detailTableStackStyle, marginTop: "0.9rem" }}>
                    {selectedInsightSections.map((section) => (
                      <DetailTableCard key={section.key} section={section} />
                    ))}
                  </div>
                ) : (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailRelatedObjectsEmpty")}</strong>
                  </div>
                )}
                {selectedInsightEnvironmentCards.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.detailInsightEnvironmentsTitle")}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {selectedInsightEnvironmentCards.map((card) => (
                        <button
                          key={card.key}
                          type="button"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.75rem",
                            borderRadius: pageColorTokens.radiusControl,
                            border: `1px solid ${pageColorTokens.borderSubtle}`,
                            background: pageColorTokens.surface,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() =>
                            onOpenDetail("risk", {
                              riskTab: "environment",
                              environmentKey: card.key,
                            })
                          }
                        >
                          <span style={taskMetaTextStyle}>{card.title}</span>
                          <s-badge tone={diagnosisTone(card.status)}>{statusText(card.status)}</s-badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedInsightTasks.length > 0 ? (
                  <div style={{ ...relatedObjectWrapStyle, marginTop: "0.9rem" }}>
                    <strong>{t("dailyOps.relatedTasksLabel")}</strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {selectedInsightTasks.slice(0, 4).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.65rem 0.75rem",
                            borderRadius: pageColorTokens.radiusControl,
                            border: `1px solid ${pageColorTokens.borderSubtle}`,
                            background: pageColorTokens.surface,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                          onClick={() => onOpenDetail("task", { taskId: task.id })}
                        >
                          <span style={taskMetaTextStyle}>{task.title}</span>
                          <s-badge tone={statusTone(task.status)}>
                            {taskStatusText(task.status)}
                          </s-badge>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </PageSurface>
            ) : (
              <PageSurface
                title={t("dailyOps.detailRelatedObjectsTitle")}
                subtitle={t("dailyOps.detailRiskSelectInsight")}
              >
                <div style={pageEmptyStateStyle}>{t("dailyOps.detailRiskSelectInsight")}</div>
              </PageSurface>
            )}
          </div>
        ) : (
          <PageSurface
            title={t("dailyOps.healthTitle")}
            subtitle={t("dailyOps.healthSubtitle")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {result.items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                    padding: "0.75rem 0.9rem",
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    borderRadius: pageColorTokens.radiusControl,
                  }}
                >
                  <s-stack direction={isMobile ? "block" : "inline"} gap="small" alignItems="center">
                    <s-badge tone={diagnosisTone(item.status)}>
                      {item.name}: {statusText(item.status)}
                    </s-badge>
                  </s-stack>
                  {item.evidence.map((line, index) => (
                    <p key={`e-all-${item.key}-${index}`} style={taskSecondaryTextStyle}>
                      {line}
                    </p>
                  ))}
                  {item.reasoning.map((line, index) => (
                    <p key={`r-all-${item.key}-${index}`} style={taskMetaTextStyle}>
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </PageSurface>
        )}
      </div>
    );
  }

  if (detailSection === "task") {
    if (!selectedTask) {
      return <div style={pageEmptyStateStyle}>{t("dailyOps.taskDetailEmpty")}</div>;
    }
    const presentation = inferTaskPresentation(selectedTask, t);
    const closed = ["done", "ignored", "auto_closed"].includes(selectedTask.status);
    return (
      <div style={detailSectionStackStyle}>
        <DetailContextHeader
          sectionLabel={t("dailyOps.detailTitle.task")}
          title={selectedTask.title}
          subtitle={selectedTask.triggerReason}
          badges={
            <>
              <s-badge tone={priorityTone(selectedTask.priority)}>
                {priorityLabel(selectedTask.priority, t)}
              </s-badge>
              <s-badge tone={statusTone(selectedTask.status)}>
                {taskStatusText(selectedTask.status)}
              </s-badge>
              <s-badge>{dueWindowText(selectedTask.dueWindow)}</s-badge>
            </>
          }
        />
        <DetailStatStrip
          isMobile={isMobile}
          items={[
            {
              key: "objective",
              label: t("dailyOps.taskObjectiveLabel"),
              value: presentation.impactMetric,
              hint: presentation.estimatedLift,
            },
            {
              key: "roi",
              label: t("dailyOps.taskRoiImpactLabel"),
              value: taskStatusText(selectedTask.status),
              hint: presentation.roiImpact,
            },
            {
              key: "due",
              label: t("dailyOps.taskPromptDue"),
              value: dueWindowText(selectedTask.dueWindow),
              hint: quadrantLabel(selectedTask.quadrant, t),
            },
          ]}
        />
        <PageSurface title={selectedTask.title} subtitle={selectedTask.triggerReason}>
          <div style={{ ...listRowMetaStyle, marginBottom: "0.8rem" }}>
            <s-badge tone={priorityTone(selectedTask.priority)}>
              {priorityLabel(selectedTask.priority, t)}
            </s-badge>
            <s-badge tone={statusTone(selectedTask.status)}>
              {taskStatusText(selectedTask.status)}
            </s-badge>
            <s-badge>{dueWindowText(selectedTask.dueWindow)}</s-badge>
            {selectedTask.ownerRole ? (
              <span style={taskSecondaryTextStyle}>
                {t("dailyOps.ownerLabel", { value: selectedTask.ownerRole })}
              </span>
            ) : null}
          </div>
          <div style={{ ...taskInfoGridStyle, ...(isMobile ? { gridTemplateColumns: "1fr" } : null) }}>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskObjectiveLabel")}</span>
              <span style={taskMetaTextStyle}>{presentation.objective}</span>
            </div>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskImpactMetricLabel")}</span>
              <span style={taskMetaTextStyle}>{presentation.impactMetric}</span>
            </div>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskEstimatedLiftLabel")}</span>
              <span style={taskMetaTextStyle}>{presentation.estimatedLift}</span>
            </div>
            <div style={taskInfoItemStyle}>
              <span style={taskInfoLabelStyle}>{t("dailyOps.taskRoiImpactLabel")}</span>
              <span style={taskSecondaryTextStyle}>{presentation.roiImpact}</span>
            </div>
          </div>
          {selectedTask.suggestedActions.length > 0 ? (
            <div style={{ ...quietPanelStyle, marginTop: "0.85rem" }}>
              <p style={{ ...taskSecondaryTextStyle, marginBottom: "0.25rem" }}>
                {t("dailyOps.suggestedActionsLabel")}
              </p>
              <ul style={actionListStyle}>
                {selectedTask.suggestedActions.map((action, index) => (
                  <li key={index}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {selectedTaskRelatedSummary.length > 0 ? (
            <div style={{ ...relatedObjectWrapStyle, marginTop: "0.85rem" }}>
              <strong>{t("dailyOps.relatedObjectsLabel")}</strong>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  gap: "0.65rem",
                }}
              >
                {selectedTaskRelatedSummary.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      padding: "0.7rem 0.8rem",
                      borderRadius: pageColorTokens.radiusControl,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                      background: pageColorTokens.surface,
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.2rem",
                    }}
                  >
                    <span style={detailInfoLabelStyle}>{item.label}</span>
                    <span style={{ ...taskMetaTextStyle, whiteSpace: "normal" }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ ...detailActionRowStyle, marginTop: "0.9rem" }}>
            <div style={{ ...listRowMetaStyle, gap: "0.35rem" }}>
              <span style={taskSecondaryTextStyle}>{selectedTask.triggerReason}</span>
            </div>
            <div style={listRowActionsStyle}>
              <s-button
                type="button"
                variant="secondary"
                onClick={() => {
                  const prompt = buildTaskPrompt(
                    selectedTask,
                    presentation,
                    taskStatusText(selectedTask.status),
                    dueWindowText(selectedTask.dueWindow),
                    t,
                  );
                  const params = new URLSearchParams();
                  params.set("panel", "chat");
                  params.set("prefillTaskPrompt", prompt);
                  window.location.href = `/app?${params.toString()}`;
                }}
              >
                {t("dailyOps.actionSendToAi")}
              </s-button>
              {selectedTask.status === "open" ? (
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => onSubmitTaskAction(selectedTask.id, "start")}
                  {...(busy ? { disabled: true } : {})}
                >
                  {t("dailyOps.actionStart")}
                </s-button>
              ) : null}
              {selectedTask.status === "in_progress" ? (
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => onSubmitTaskAction(selectedTask.id, "done")}
                  {...(busy ? { disabled: true } : {})}
                >
                  {t("dailyOps.actionDone")}
                </s-button>
              ) : null}
              {closed ? (
                <s-button
                  type="button"
                  variant="tertiary"
                  onClick={() => onSubmitTaskAction(selectedTask.id, "reopen")}
                  {...(busy ? { disabled: true } : {})}
                >
                  {t("dailyOps.actionReopen")}
                </s-button>
              ) : null}
            </div>
          </div>
        </PageSurface>
      </div>
    );
  }

  return value ? (
    <div style={detailSectionStackStyle}>
      <DetailContextHeader
        sectionLabel={t("dailyOps.detailTitle.value")}
        title={t(`dailyOps.detailTab${valueTab.charAt(0).toUpperCase()}${valueTab.slice(1)}` as const)}
        subtitle={t("dailyOps.valueSubtitle")}
        tabs={valueTabs}
      />
      <DetailStatStrip
        isMobile={isMobile}
        items={[
          {
            key: "customers",
            label: t("dailyOps.customerTitle"),
            value: `${value.customers.averageDynamicLtv} ${value.channels.currency}`,
            hint: t("dailyOps.metricAvgLtv"),
          },
          {
            key: "channels",
            label: t("dailyOps.channelTitle", { days: value.channels.windowDays }),
            value: value.channels.channels.length,
            hint: t("dailyOps.detailValueChannels"),
          },
          {
            key: "cost",
            label: t("dailyOps.costTitle"),
            value: `${value.costConfig.defaultGrossMarginPercent}%`,
            hint: t("dailyOps.detailValueCost"),
          },
        ]}
      />
      <ValueLayerSections value={value} isMobile={isMobile} activeTab={valueTab} />
    </div>
  ) : (
    <div style={pageEmptyStateStyle}>
      <span>{t("dailyOps.valueUnavailable")}</span>
    </div>
  );
}

function QuadrantCell({
  quadrant,
  title,
  desc,
  tasks,
  emptyLabel,
  renderTaskCard,
}: {
  quadrant: TaskQuadrant;
  title: string;
  desc: string;
  tasks: OperationTaskView[];
  emptyLabel: string;
  renderTaskCard: (task: OperationTaskView) => ReactNode;
}) {
  const activeCount = tasks.filter((task) =>
    ["open", "in_progress"].includes(task.status),
  ).length;
  return (
    <div style={quadrantCellStyle(quadrant)}>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "0.9375rem",
              fontWeight: 800,
              color: quadrantAccentColors[quadrant],
            }}
          >
            {title}
          </h3>
          <span style={quadrantCountBadgeStyle(quadrant)}>{activeCount}</span>
        </div>
        <p style={{ ...taskSecondaryTextStyle, marginTop: "0.25rem" }}>{desc}</p>
      </div>
      {tasks.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: pageColorTokens.textSecondary,
            fontSize: "0.8125rem",
          }}
        >
          {emptyLabel}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {tasks.map(renderTaskCard)}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// 渠道与客户价值层（ROI 归一体系 · A 步）
// ──────────────────────────────────────────────

const valueTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
  background: pageColorTokens.surface,
};

const valueThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const valueGroupThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.5rem",
  color: pageColorTokens.textBody,
  borderBottom: `2px solid ${pageColorTokens.border}`,
  borderRight: `1px solid ${pageColorTokens.divider}`,
  fontWeight: 800,
  fontSize: "0.75rem",
  whiteSpace: "nowrap",
  background: pageColorTokens.surfaceMuted,
};

const groupHeadInnerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
};

const valueTdStyle: CSSProperties = {
  padding: "0.72rem 0.6rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const costInputStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: `1px solid ${pageColorTokens.borderInput}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.875rem",
};

const costLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  flex: "1 1 160px",
};

// ── 数据来源标签（区分真实 / 估算 / 待接入占位） ──────────
type DataSource = "real" | "estimated" | "pending";

const dataSourceTone: Record<DataSource, "success" | "warning" | "neutral"> = {
  real: "success",
  estimated: "warning",
  pending: "neutral",
};

function SourceTag({ source }: { source: DataSource }) {
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

const layerCardStyle = (accent: string): CSSProperties => ({
  flex: "1 1 200px",
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `3px solid ${accent}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: "0.85rem 0.95rem",
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
});

const layerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 800,
  color: pageColorTokens.textBody,
};

function LayerLegend() {
  const { t } = useTranslation();
  const layers: Array<{ accent: string; title: string; desc: string; source: DataSource }> = [
    {
      accent: "#007a5a",
      title: t("dailyOps.layerRevenue"),
      desc: t("dailyOps.layerRevenueDesc"),
      source: "real",
    },
    {
      accent: "#ea580c",
      title: t("dailyOps.layerProfit"),
      desc: t("dailyOps.layerProfitDesc"),
      source: "estimated",
    },
    {
      accent: "#6b7280",
      title: t("dailyOps.layerInvestment"),
      desc: t("dailyOps.layerInvestmentDesc"),
      source: "pending",
    },
  ];
  return (
    <PageSurface title={t("dailyOps.layerLegendTitle")}>
      <p style={{ ...taskSecondaryTextStyle, marginTop: 0, marginBottom: "0.75rem" }}>
        {t("dailyOps.layerLegendIntro")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
        {layers.map((layer) => (
          <div key={layer.title} style={layerCardStyle(layer.accent)}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <h4 style={layerTitleStyle}>{layer.title}</h4>
              <SourceTag source={layer.source} />
            </div>
            <p style={{ ...taskSecondaryTextStyle, margin: 0 }}>{layer.desc}</p>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function InvestmentLayerCard() {
  const { t } = useTranslation();
  const items = [
    t("dailyOps.investmentAdSpend"),
    t("dailyOps.investmentSeoCost"),
    t("dailyOps.investmentToolCost"),
  ];
  return (
    <PageSurface
      title={t("dailyOps.investmentTitle")}
      subtitle={t("dailyOps.investmentSubtitle")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <SourceTag source="pending" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.75rem",
              border: `1px dashed ${pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusControl,
              fontSize: "0.8125rem",
              color: pageColorTokens.textSecondary,
              background: pageColorTokens.surfaceMuted,
            }}
          >
            <span>{item}</span>
            <s-badge tone="neutral">{t("dailyOps.investmentNotConnected")}</s-badge>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function ValueLayerSections({
  value,
  isMobile,
  activeTab = "framework",
}: {
  value: ValueLayerData;
  isMobile: boolean;
  activeTab?: "framework" | "customers" | "channels" | "cost";
}) {
  const { t } = useTranslation();
  const { customers, channels } = value;
  const seg = customers.segmentCounts;

  return (
    <>
      <section>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <h2 style={pageSectionMajorTitleStyle}>{t("dailyOps.valueTitle")}</h2>
          <p style={sectionDescriptionStyle}>{t("dailyOps.valueSubtitle")}</p>
        </div>
      </section>

      {activeTab === "framework" ? <LayerLegend /> : null}

      {(activeTab === "framework" || activeTab === "customers") ? (
        <PageSurface
          title={t("dailyOps.customerTitle")}
          subtitle={t("dailyOps.customerSubtitle", {
            total: customers.payingCustomers,
          })}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <SourceTag source="estimated" />
          </div>
          <div style={valueCardSectionStyle}>
            <PageMetricCard
              metrics={[
                {
                  label: t("dailyOps.metricRepeatRate"),
                  value: `${customers.repeatPurchaseRate}%`,
                },
                {
                  label: t("dailyOps.metricAvgScore"),
                  value: String(customers.averageScore),
                },
                {
                  label: t("dailyOps.metricHighValueShare"),
                  value: `${customers.highValueShare}%`,
                },
                {
                  label: t("dailyOps.metricAvgLtv"),
                  value: String(customers.averageDynamicLtv),
                  unit: channels.currency,
                },
              ]}
            />
            <div style={customerTagWrapStyle}>
              <s-badge tone="info">{t("dailyOps.segmentNew")}: {seg.new}</s-badge>
              <s-badge tone="success">{t("dailyOps.segmentActive")}: {seg.active}</s-badge>
              <s-badge tone="success">{t("dailyOps.segmentVip")}: {seg.vip}</s-badge>
              <s-badge tone="warning">{t("dailyOps.segmentAtRisk")}: {seg.at_risk}</s-badge>
              <s-badge>{t("dailyOps.segmentChurned")}: {seg.churned}</s-badge>
              <s-badge tone="critical">
                {t("dailyOps.tagRefundRisk")}: {customers.tagCounts.refund_risk}
              </s-badge>
              <s-badge tone="warning">
                {t("dailyOps.tagDiscountSensitive")}: {customers.tagCounts.discount_sensitive}
              </s-badge>
            </div>
          </div>
        </PageSurface>
      ) : null}

      {(activeTab === "framework" || activeTab === "channels") ? (
        <PageSurface
          title={t("dailyOps.channelTitle", { days: channels.windowDays })}
          subtitle={t("dailyOps.channelSubtitle", {
            share: channels.attributedRevenueShare,
          })}
        >
          {channels.channels.length === 0 ? (
            <p style={taskSecondaryTextStyle}>{t("dailyOps.noChannelData")}</p>
          ) : (
            <div style={channelTableWrapStyle}>
              <table style={valueTableStyle}>
                <thead>
                  <tr>
                    <th style={valueGroupThStyle} colSpan={2}>
                      {t("dailyOps.groupBasic")}
                    </th>
                    <th style={valueGroupThStyle} colSpan={1}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.layerRevenue")} <SourceTag source="real" />
                      </span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={2}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.layerProfit")} <SourceTag source="estimated" />
                      </span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={3}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.groupCustomerQuality")} <SourceTag source="estimated" />
                      </span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={1}>
                      <span style={groupHeadInnerStyle}>
                        {t("dailyOps.layerInvestment")} <SourceTag source="pending" />
                      </span>
                    </th>
                  </tr>
                  <tr>
                    <th style={valueThStyle}>{t("dailyOps.colChannel")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colOrders")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colRevenue")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colProfit")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colMargin")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colNewShare")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colRepeatShare")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colScore")}</th>
                    <th style={valueThStyle}>{t("dailyOps.colRoi")}</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.channels.map((channel) => (
                    <tr key={channel.channelKey}>
                      <td style={{ ...valueTdStyle, fontWeight: 700 }}>{channel.label}</td>
                      <td style={valueTdStyle}>{channel.orderCount}</td>
                      <td style={valueTdStyle}>
                        {channel.revenue} {channels.currency}
                      </td>
                      <td
                        style={{
                          ...valueTdStyle,
                          color:
                            channel.contributionProfit >= 0 ? "#007a5a" : "#dc2626",
                          fontWeight: 700,
                        }}
                      >
                        {channel.contributionProfit}
                      </td>
                      <td style={valueTdStyle}>
                        {channel.contributionMarginPercent === null
                          ? "—"
                          : `${channel.contributionMarginPercent}%`}
                      </td>
                      <td style={valueTdStyle}>{channel.customers.newOrderShare}%</td>
                      <td style={valueTdStyle}>{channel.customers.repeatCustomerShare}%</td>
                      <td style={valueTdStyle}>
                        {channel.customers.averageCustomerValueScore ?? "—"}
                      </td>
                      <td style={valueTdStyle}>
                        <s-badge tone="neutral">{t("dailyOps.roiPendingAds")}</s-badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={caveatPanelStyle}>
            {channels.caveats.map((line, index) => (
              <p key={index} style={{ ...taskSecondaryTextStyle, fontSize: "0.75rem" }}>
                * {line}
              </p>
            ))}
          </div>
        </PageSurface>
      ) : null}

      {activeTab === "framework" ? <InvestmentLayerCard /> : null}
      {(activeTab === "framework" || activeTab === "cost") ? (
        <CostConfigCard costConfig={value.costConfig} isMobile={isMobile} />
      ) : null}
    </>
  );
}

function CostConfigCard({
  costConfig,
  isMobile,
}: {
  costConfig: ShopCostConfigView;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher();
  const saving = fetcher.state !== "idle";

  return (
    <PageSurface
      title={t("dailyOps.costTitle")}
      subtitle={t("dailyOps.costSubtitle")}
    >
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="cost-config" />
        <div
          style={{
            ...costFormWrapStyle,
            display: "flex",
            flexWrap: "wrap",
            gap: "0.9rem",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
          }}
        >
          <label style={costLabelStyle}>
            {t("dailyOps.costMargin")}
            <input
              style={costInputStyle}
              type="number"
              name="defaultGrossMarginPercent"
              step="0.1"
              min="0"
              max="100"
              defaultValue={costConfig.defaultGrossMarginPercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costFeePercent")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeePercent"
              step="0.1"
              min="0"
              max="20"
              defaultValue={costConfig.paymentFeePercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costFeeFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeeFixed"
              step="0.01"
              min="0"
              defaultValue={costConfig.paymentFeeFixed}
            />
          </label>
          <label style={costLabelStyle}>
            {t("dailyOps.costMonthlyFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="monthlyFixedCost"
              step="1"
              min="0"
              defaultValue={costConfig.monthlyFixedCost}
            />
          </label>
          <div style={{ flex: "0 0 auto" }}>
            <s-button
              type="submit"
              variant="primary"
              {...(saving ? { disabled: true } : {})}
            >
              {saving ? t("dailyOps.costSaving") : t("dailyOps.costSave")}
            </s-button>
          </div>
        </div>
      </fetcher.Form>
      {!costConfig.isConfigured ? (
        <p style={{ ...taskSecondaryTextStyle, marginTop: "0.6rem" }}>
          {t("dailyOps.costDefaultHint")}
        </p>
      ) : null}
    </PageSurface>
  );
}
