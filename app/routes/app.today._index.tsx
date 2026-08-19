import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { ensureDailySnapshotOverview, type DailyOperationsOverviewResult } from "../server/operations/dailyInspection.server";
import {
  buildWorkspaceDashboardFromDailyOps,
  emptyWorkspaceDashboardSnapshot,
} from "../server/operations/workspaceDashboard.server";
import { buildWorkspaceTaskSummaries } from "../server/operations/workspaceTaskSummary.server";
import { listMergedUnifiedTaskEntries } from "../server/unifiedTask/unifiedTaskList.server";
import { useFeatureView } from "../lib/featureTrack";
import { mobilePageContentStyle, pageColorTokens, pageContentStyle, pageEmptyStateStyle, pageHintTextStyle, pageMetricCardStyle, pageMetricLabelStyle, pageMetricTileStyle, pageMetricValueStyle, PageSurface, pageSectionSubtitleStyle, pageStatusCardStyle } from "./page/pageUiStyles";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import type { WorkspaceDashboardAlertTone, WorkspaceDashboardMetric, WorkspaceDashboardSnapshot } from "../lib/workspaceDashboardTypes";
import { DestinationPage } from "./component/shared/DestinationPage";

const DASHBOARD_RECENT_TASK_LIMIT = 5;

type LoaderData = {
  dashboardSnapshot: WorkspaceDashboardSnapshot;
  dailyOps: DailyOperationsOverviewResult | null;
};

type CockpitTone = "positive" | "neutral" | "warning" | "critical";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  let dashboardSnapshot = emptyWorkspaceDashboardSnapshot();
  let dailyOps: DailyOperationsOverviewResult | null = null;

  try {
    const [overviewResult, recentTaskEntries] = await Promise.all([
      ensureDailySnapshotOverview(session.shop),
      listMergedUnifiedTaskEntries(session.shop, { limit: DASHBOARD_RECENT_TASK_LIMIT }),
    ]);
    dailyOps = overviewResult;
    dashboardSnapshot = {
      ...buildWorkspaceDashboardFromDailyOps(overviewResult),
      recentTaskSummaries: buildWorkspaceTaskSummaries(recentTaskEntries),
    };
  } catch (error) {
    console.error("[today._index] dashboard snapshot failed:", error);
  }

  return { dashboardSnapshot, dailyOps } satisfies LoaderData;
};

export default function TodayOverview() {
  const { t } = useTranslation();
  const { dashboardSnapshot, dailyOps } = useLoaderData<typeof loader>();
  const navigate = useEmbeddedNavigate();
  const { isMobile } = useResponsiveLayout();
  useFeatureView("today");

  const businessStatus = buildBusinessStatus(dailyOps, t);
  const roiCards = buildRoiCards(dailyOps, t);
  const topFactors = buildTopFactors(dailyOps, t);
  const topInsights = buildTopInsights(dailyOps);
  const actionHints = dashboardSnapshot.suggestions.slice(0, 3);
  const activeTasks = dailyOps?.tasks.filter((task) => task.status === "open" || task.status === "in_progress") ?? [];

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("todayDashboard.title")}
        subtitle={t("todayDashboard.subtitle")}
        titleBarTitle={t("nav.today")}
        backLabel={t("todayDashboard.back")}
        fallbackPath="/app"
        isMobile={isMobile}
        actions={buildTodayActions({
          t,
          snapshot: dashboardSnapshot,
          onOpenReports: () => navigate("/app/insights"),
          onOpenCharts: () => navigate("/app/insights/charts"),
          onOpenDailyOps: () => navigate("/app/today/diagnosis"),
          onOpenTasks: () => navigate("/app/tasks"),
        })}
      >
        {!dailyOps?.hasData ? (
          <div style={pageEmptyStateStyle}>
            <strong>{t("todayDashboard.emptyTitle")}</strong>
            <span style={pageSectionSubtitleStyle}>{dashboardSnapshot.emptyMessage ?? t("dailyOps.emptyState")}</span>
          </div>
        ) : (
          <div style={pageStackStyle}>
            <PageSurface
              title={t("todayDashboard.headerTitle")}
              subtitle={t("todayDashboard.headerSubtitle")}
            >
              <div style={headerTopRowStyle(isMobile)}>
                <div style={headerMainStyle}>
                  <div style={statusBadgeStyle(businessStatus.tone)}>
                    {businessStatus.label}
                  </div>
                  <h3 style={headerSummaryStyle}>{businessStatus.summary}</h3>
                </div>
                <div style={headerMetaStyle}>
                  <span style={pageHintTextStyle}>
                    {t("todayDashboard.generatedAt", {
                      value: dailyOps.generatedAt ? new Date(dailyOps.generatedAt).toLocaleString() : "—",
                    })}
                  </span>
                  <span style={pageHintTextStyle}>
                    {t(`todayDashboard.dataConfidence${businessStatus.dataConfidence}`)}
                  </span>
                </div>
              </div>

              <div style={summaryGridStyle(isMobile, 3)}>
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>{t("todayDashboard.primaryBottleneck")}</div>
                  <div style={summaryValueStyle}>{businessStatus.primaryBottleneck}</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>{t("todayDashboard.biggestOpportunity")}</div>
                  <div style={summaryValueStyle}>{businessStatus.biggestOpportunity}</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>{t("todayDashboard.todayFocus")}</div>
                  <div style={summaryValueStyle}>
                    {actionHints[0] ?? t("todayDashboard.noActionHint")}
                  </div>
                </div>
              </div>
            </PageSurface>

            <PageSurface
              title={t("todayDashboard.metricsTitle")}
              subtitle={t("todayDashboard.metricsSubtitle")}
            >
              <div style={metricGridStyle(isMobile)}>
                {dashboardSnapshot.metrics.map((metric) => (
                  <div key={metric.label} style={metricCardStyle}>
                    <div style={metricTitleRowStyle}>
                      <span style={pageMetricLabelStyle}>{metric.label}</span>
                      {metric.pendingIntegration ? (
                        <span style={subtleBadgeStyle}>{t("todayDashboard.pendingData")}</span>
                      ) : null}
                    </div>
                    <div style={pageMetricValueStyle}>{metric.value}</div>
                    <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
                  </div>
                ))}
              </div>
            </PageSurface>

            <PageSurface
              title={t("todayDashboard.roiTitle")}
              subtitle={t("todayDashboard.roiSubtitle")}
            >
              <div style={summaryGridStyle(isMobile, 3)}>
                {roiCards.map((card) => (
                  <div key={card.key} style={pageStatusCardStyle}>
                    <div style={roiCardHeaderStyle}>
                      <span style={summaryLabelStyle}>{card.title}</span>
                      <span style={statusBadgeStyle(card.tone)}>{card.label}</span>
                    </div>
                    <div style={summaryValueStyle}>{card.summary}</div>
                    {card.meta ? <div style={pageHintTextStyle}>{card.meta}</div> : null}
                  </div>
                ))}
              </div>
            </PageSurface>

            <PageSurface
              title={t("todayDashboard.factorsTitle")}
              subtitle={t("todayDashboard.factorsSubtitle")}
            >
              <div style={summaryGridStyle(isMobile, 3)}>
                {topFactors.map((factor) => (
                  <button
                    key={factor.key}
                    type="button"
                    style={insightButtonStyle(factor.tone)}
                    onClick={() => navigate("/app/insights")}
                  >
                    <div style={roiCardHeaderStyle}>
                      <span style={summaryLabelStyle}>{factor.title}</span>
                      <span style={statusBadgeStyle(factor.tone)}>{factor.statusLabel}</span>
                    </div>
                    <div style={summaryValueStyle}>{factor.summary}</div>
                  </button>
                ))}
              </div>
            </PageSurface>

            <PageSurface
              title={t("todayDashboard.insightsTitle")}
              subtitle={t("todayDashboard.insightsSubtitle")}
            >
              <div style={pageStackCompactStyle}>
                {topInsights.map((insight) => (
                  <button
                    key={insight.key}
                    type="button"
                    style={insightButtonStyle(mapAlertToneToCockpitTone(insight.status === "risk" ? "critical" : "warning"))}
                    onClick={() => navigate("/app/insights")}
                  >
                    <div style={insightHeaderStyle}>
                      <span style={insightTitleStyle}>{insight.title}</span>
                      <span style={subtleBadgeStyle}>{t(`todayDashboard.confidence${insight.confidence}`)}</span>
                    </div>
                    <div style={summaryValueStyle}>{insight.summary}</div>
                    <div style={pageHintTextStyle}>
                      {insight.evidence[0] ?? t("todayDashboard.openReport")}
                    </div>
                  </button>
                ))}
              </div>
            </PageSurface>

            <PageSurface
              title={t("todayDashboard.tasksTitle")}
              subtitle={t("todayDashboard.tasksSubtitle")}
            >
              <div style={tasksGridStyle(isMobile)}>
                <div style={pageStackCompactStyle}>
                  <div style={summaryGridStyle(false, 3)}>
                    <div style={summaryCardStyle}>
                      <div style={summaryLabelStyle}>{t("todayDashboard.openTasks")}</div>
                      <div style={summaryValueStyle}>{dailyOps.overview.openTaskCount}</div>
                    </div>
                    <div style={summaryCardStyle}>
                      <div style={summaryLabelStyle}>{t("todayDashboard.inProgressTasks")}</div>
                      <div style={summaryValueStyle}>{dailyOps.overview.inProgressTaskCount}</div>
                    </div>
                    <div style={summaryCardStyle}>
                      <div style={summaryLabelStyle}>{t("todayDashboard.doneTasks")}</div>
                      <div style={summaryValueStyle}>{dailyOps.overview.doneTaskCount}</div>
                    </div>
                  </div>

                  <div style={pageStackCompactStyle}>
                    {activeTasks.slice(0, 3).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        style={insightButtonStyle(task.priority === "P0" ? "critical" : "warning")}
                        onClick={() => navigate("/app/today/diagnosis")}
                      >
                        <div style={insightHeaderStyle}>
                          <span style={insightTitleStyle}>{task.title}</span>
                          <span style={subtleBadgeStyle}>{task.priority}</span>
                        </div>
                        <div style={summaryValueStyle}>{task.triggerReason}</div>
                        <div style={pageHintTextStyle}>
                          {task.suggestedActions[0] ?? t("todayDashboard.openDiagnosis")}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={pageStackCompactStyle}>
                  {actionHints.map((action) => (
                    <div key={action} style={summaryCardStyle}>
                      <div style={summaryLabelStyle}>{t("todayDashboard.recommendedAction")}</div>
                      <div style={summaryValueStyle}>{action}</div>
                    </div>
                  ))}
                </div>
              </div>
            </PageSurface>
          </div>
        )}
      </DestinationPage>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function buildTodayActions({
  t,
  snapshot,
  onOpenReports,
  onOpenCharts,
  onOpenDailyOps,
  onOpenTasks,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  snapshot: WorkspaceDashboardSnapshot;
  onOpenReports: () => void;
  onOpenCharts: () => void;
  onOpenDailyOps: () => void;
  onOpenTasks: () => void;
}) {
  const riskCount = snapshot.alerts.filter((item) => item.tone === "critical").length;
  const watchCount = snapshot.alerts.filter((item) => item.tone === "warning").length;
  const taskCount = snapshot.recentTaskSummaries.length;

  return [
    {
      key: "reports",
      title: t("todayDashboard.actions.reportsTitle"),
      detail: t("todayDashboard.actions.reportsDetail"),
      badge: t("todayDashboard.actions.reportsBadge", { riskCount, watchCount }),
      onClick: onOpenReports,
    },
    {
      key: "charts",
      title: t("todayDashboard.actions.chartsTitle"),
      detail: t("todayDashboard.actions.chartsDetail"),
      badge: snapshot.hasData ? t("todayDashboard.actions.chartsReady") : t("todayDashboard.pendingData"),
      onClick: onOpenCharts,
    },
    {
      key: "diagnosis",
      title: t("todayDashboard.actions.diagnosisTitle"),
      detail: snapshot.hasData ? t("todayDashboard.actions.diagnosisDetail") : t("todayDashboard.actions.diagnosisEmpty"),
      badge: t("todayDashboard.actions.diagnosisBadge", { count: riskCount + watchCount }),
      onClick: onOpenDailyOps,
    },
    {
      key: "tasks",
      title: t("todayDashboard.actions.tasksTitle"),
      detail: t("todayDashboard.actions.tasksDetail"),
      badge: t("todayDashboard.actions.tasksBadge", { count: taskCount }),
      onClick: onOpenTasks,
    },
  ];
}

function buildBusinessStatus(
  dailyOps: DailyOperationsOverviewResult | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!dailyOps?.hasData) {
    return {
      tone: "warning" as CockpitTone,
      label: t("todayDashboard.statusPending"),
      summary: t("todayDashboard.emptySummary"),
      primaryBottleneck: t("todayDashboard.noBottleneck"),
      biggestOpportunity: t("todayDashboard.noOpportunity"),
      dataConfidence: "Medium",
    };
  }

  const topRiskInsight = dailyOps.insights.find((item) => item.status === "risk");
  const topWatchInsight = dailyOps.insights.find((item) => item.status === "watch");
  const primaryInsight = topRiskInsight ?? topWatchInsight ?? dailyOps.insights[0];
  const biggestOpportunity = dailyOps.review?.deltas.find((item) => item.improved === true)?.label ?? dailyOps.tasks[0]?.title ?? t("todayDashboard.defaultOpportunity");

  if (dailyOps.overview.activeRiskCount > 0) {
    return {
      tone: "critical" as CockpitTone,
      label: t("dailyOps.statusRisk"),
      summary: t("todayDashboard.summaryRisk", {
        riskCount: dailyOps.overview.activeRiskCount,
        taskCount: dailyOps.overview.openTaskCount + dailyOps.overview.inProgressTaskCount,
      }),
      primaryBottleneck: primaryInsight?.title ?? t("todayDashboard.noBottleneck"),
      biggestOpportunity,
      dataConfidence: dailyOps.overview.hasPixelData ? "High" : "Medium",
    };
  }

  if (dailyOps.overview.watchRiskCount > 0) {
    return {
      tone: "warning" as CockpitTone,
      label: t("dailyOps.statusWatch"),
      summary: t("todayDashboard.summaryWatch", {
        watchCount: dailyOps.overview.watchRiskCount,
        insightCount: dailyOps.overview.insightCount,
      }),
      primaryBottleneck: primaryInsight?.title ?? t("todayDashboard.noBottleneck"),
      biggestOpportunity,
      dataConfidence: dailyOps.overview.hasPixelData ? "High" : "Medium",
    };
  }

  return {
    tone: "positive" as CockpitTone,
    label: t("dailyOps.statusHealthy"),
    summary: t("todayDashboard.summaryHealthy"),
    primaryBottleneck: t("todayDashboard.noBottleneck"),
    biggestOpportunity,
    dataConfidence: dailyOps.overview.hasPixelData ? "High" : "Medium",
  };
}

function buildRoiCards(
  dailyOps: DailyOperationsOverviewResult | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): Array<{
  key: string;
  title: string;
  label: string;
  summary: string;
  meta?: string;
  tone: CockpitTone;
}> {
  if (!dailyOps?.hasData) {
    return [
      {
        key: "short",
        title: t("todayDashboard.roiShortTerm"),
        label: t("todayDashboard.pendingData"),
        summary: t("todayDashboard.roiPendingSummary"),
        meta: undefined,
        tone: "warning" as CockpitTone,
      },
      {
        key: "payback",
        title: t("todayDashboard.roiPayback"),
        label: t("todayDashboard.pendingData"),
        summary: t("todayDashboard.roiPaybackPending"),
        meta: undefined,
        tone: "warning" as CockpitTone,
      },
      {
        key: "lifetime",
        title: t("todayDashboard.roiLifetime"),
        label: t("todayDashboard.pendingData"),
        summary: t("todayDashboard.roiLifetimePending"),
        meta: undefined,
        tone: "warning" as CockpitTone,
      },
    ];
  }

  const growth = dailyOps.overview.salesGrowthRate;
  const shortTone: CockpitTone =
    growth !== null && growth < 0 ? "critical" : dailyOps.overview.activeRiskCount > 0 ? "warning" : "positive";

  return [
    {
      key: "short",
      title: t("todayDashboard.roiShortTerm"),
      label:
        growth !== null && growth < 0
          ? t("todayDashboard.stateWeak")
          : dailyOps.overview.activeRiskCount > 0
            ? t("todayDashboard.stateStable")
            : t("todayDashboard.stateStrong"),
      summary:
        growth === null
          ? t("todayDashboard.roiShortNoBaseline")
          : t("todayDashboard.roiShortSummary", {
              growth: `${growth >= 0 ? "+" : ""}${Math.round(growth)}%`,
            }),
      meta: t("todayDashboard.roiShortMeta", { refundRate: `${Math.round(dailyOps.overview.refundRate30d * 10) / 10}%` }),
      tone: shortTone,
    },
    {
      key: "payback",
      title: t("todayDashboard.roiPayback"),
      label: dailyOps.overview.hasPixelData ? t("todayDashboard.stateWatch") : t("todayDashboard.pendingData"),
      summary: dailyOps.overview.hasPixelData
        ? t("todayDashboard.roiPaybackAvailable", {
            sessions: dailyOps.overview.sessions7d ?? 0,
            conversion: dailyOps.overview.conversionRate7d === null ? "—" : `${dailyOps.overview.conversionRate7d}%`,
          })
        : t("todayDashboard.roiPaybackPending"),
      meta: dailyOps.overview.hasPixelData ? t("todayDashboard.roiPaybackMeta") : undefined,
      tone: dailyOps.overview.hasPixelData ? "warning" : "neutral",
    },
    {
      key: "lifetime",
      title: t("todayDashboard.roiLifetime"),
      label: t("todayDashboard.pendingData"),
      summary: t("todayDashboard.roiLifetimePending"),
      meta: t("todayDashboard.roiLifetimeMeta"),
      tone: "neutral",
    },
  ];
}

function buildTopFactors(
  dailyOps: DailyOperationsOverviewResult | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!dailyOps?.hasData) return [];

  const ranked = [...dailyOps.environments].sort((a, b) => statusRank(b.status) - statusRank(a.status));
  return ranked.slice(0, 3).map((item) => ({
    key: item.key,
    title: t(item.titleKey),
    summary: item.summary,
    statusLabel: t(`dailyOps.status${capitalize(item.status)}`),
    tone: mapAlertToneToCockpitTone(item.status === "risk" ? "critical" : item.status === "watch" ? "warning" : "info"),
  }));
}

function buildTopInsights(dailyOps: DailyOperationsOverviewResult | null) {
  if (!dailyOps?.hasData) return [];
  return [...dailyOps.insights]
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.taskCount - a.taskCount)
    .slice(0, 3);
}

function statusRank(status: "healthy" | "watch" | "risk") {
  if (status === "risk") return 2;
  if (status === "watch") return 1;
  return 0;
}

function mapAlertToneToCockpitTone(tone: WorkspaceDashboardAlertTone): CockpitTone {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  return "positive";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function metricDeltaStyle(tone: WorkspaceDashboardMetric["tone"]): CSSProperties {
  const color =
    tone === "positive"
      ? pageColorTokens.brandGreen
      : tone === "negative"
        ? pageColorTokens.critical
        : pageColorTokens.textSecondary;
  return {
    marginTop: "0.35rem",
    fontSize: "0.78rem",
    fontWeight: 700,
    color,
  };
}

function statusBadgeStyle(tone: CockpitTone): CSSProperties {
  const palette =
    tone === "critical"
      ? {
          color: pageColorTokens.criticalText,
          background: pageColorTokens.criticalBg,
          border: "#f2b8ae",
        }
      : tone === "warning"
        ? {
            color: "#9a5b00",
            background: pageColorTokens.warningBg,
            border: "#f1d58d",
          }
        : tone === "positive"
          ? {
              color: pageColorTokens.brandGreenDark,
              background: pageColorTokens.brandGreenLight,
              border: "rgba(0, 128, 96, 0.2)",
            }
          : {
              color: pageColorTokens.textSecondary,
              background: pageColorTokens.surfaceMuted,
              border: pageColorTokens.borderSubtle,
            };

  return {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    padding: "0.2rem 0.55rem",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 700,
    color: palette.color,
    background: palette.background,
    border: `1px solid ${palette.border}`,
  };
}

const pageStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const pageStackCompactStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const headerTopRowStyle = (isMobile: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  alignItems: isMobile ? "stretch" : "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
});

const headerMainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
  minWidth: 0,
};

const headerSummaryStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
  lineHeight: 1.45,
  color: pageColorTokens.textPrimary,
};

const headerMetaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.35rem",
};

const summaryGridStyle = (isMobile: boolean, columns: number): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : `repeat(${columns}, minmax(0, 1fr))`,
  gap: "0.75rem",
});

const summaryCardStyle: CSSProperties = {
  ...pageStatusCardStyle,
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};

const summaryValueStyle: CSSProperties = {
  fontSize: "0.92rem",
  lineHeight: 1.5,
  color: pageColorTokens.textPrimary,
};

const metricGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const metricCardStyle: CSSProperties = {
  ...pageMetricCardStyle,
  padding: "1rem",
};

const metricTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const roiCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  marginBottom: "0.45rem",
};

const subtleBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.2rem 0.5rem",
  borderRadius: 999,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: "0.72rem",
  fontWeight: 700,
};

const insightButtonStyle = (tone: CockpitTone): CSSProperties => ({
  ...summaryCardStyle,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  borderColor:
    tone === "critical"
      ? "#f2b8ae"
      : tone === "warning"
        ? "#f1d58d"
        : pageColorTokens.border,
  background:
    tone === "critical"
      ? pageColorTokens.criticalBg
      : tone === "warning"
        ? pageColorTokens.warningBg
        : pageColorTokens.surface,
});

const insightHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const insightTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const tasksGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.5fr) minmax(0, 1fr)",
  gap: "1rem",
});
