import { useMemo, type CSSProperties } from "react";
import { useLoaderData, useLocation, useNavigate, useSearchParams } from "react-router";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { DestinationFilterBar, DestinationPage } from "./component/shared/DestinationPage";
import {
  PageMetricCard,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageEmptyStateStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageSelectStyle,
  pageSectionHeaderRowStyle,
  pageSectionSubtitleStyle,
  pageStatusCardStyle,
} from "./page/pageUiStyles";

import {
  appendReturnTo,
  buildLiveSnapshots,
  loader,
  periodItems,
  type BusinessModule,
  type ChartKind,
  type InsightItemTone,
  type ModuleChart,
  type ModuleFilterKey,
  type ModuleSource,
  type ReportCardTone,
  type ReportSummaryCard,
} from "../server/operations/businessReportSnapshot.server";

export { loader };

const pageStyles = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  heroGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
    gap: "1rem",
    alignItems: "stretch",
  }),
  coverageList: {
    display: "grid",
    gap: "0.65rem",
  } as CSSProperties,
  overviewGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.25fr) minmax(280px, 0.95fr)",
    gap: "1rem",
    alignItems: "start",
  }),
  controlCard: {
    ...pageStatusCardStyle,
    display: "grid",
    gap: "0.75rem",
    padding: "0.95rem",
  } as CSSProperties,
  controlGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "0.85rem",
  }),
  helperList: {
    display: "grid",
    gap: "0.5rem",
  } as CSSProperties,
  helperItem: {
    display: "flex",
    gap: "0.55rem",
    alignItems: "flex-start",
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  helperDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: pageColorTokens.brandGreen,
    marginTop: 6,
    flexShrink: 0,
  } as CSSProperties,
  coverageItem: {
    ...pageStatusCardStyle,
    display: "grid",
    gap: "0.25rem",
    padding: "0.8rem 0.9rem",
  } as CSSProperties,
  coverageLabel: {
    fontSize: 12,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  coverageValue: {
    fontSize: 14,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  moduleGrid: {
    display: "grid",
    gap: "1rem",
  } as CSSProperties,
  moduleToolbar: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
    gap: "0.85rem",
    alignItems: "end",
    marginBottom: "1rem",
  }),
  moduleCounts: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.45rem",
    alignItems: "center",
    justifyContent: "flex-end",
  } as CSSProperties,
  countBadge: (tone: ModuleSource): CSSProperties => ({
    borderRadius: 999,
    padding: "0.22rem 0.55rem",
    fontSize: 11,
    fontWeight: 700,
    border: `1px solid ${
      tone === "real" ? "#a7f3d0" : tone === "estimated" ? "#c7d2fe" : "#fed7aa"
    }`,
    color: tone === "real" ? "#047857" : tone === "estimated" ? "#3730a3" : "#9a3412",
    background: tone === "real" ? "#ecfdf5" : tone === "estimated" ? "#eef2ff" : "#fff7ed",
  }),
  moduleHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
    marginBottom: "0.85rem",
  } as CSSProperties,
  sourceBadge: (source: ModuleSource): CSSProperties => {
    const tone =
      source === "real"
        ? { color: "#0f766e", background: "#ecfeff", border: "#a5f3fc", label: "真实数据" }
        : source === "estimated"
          ? { color: "#2952d8", background: "#eef2ff", border: "#c7d2fe", label: "估算/待接入" }
          : { color: "#9a3412", background: "#fff7ed", border: "#fed7aa", label: "占位" };
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.2rem 0.55rem",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      color: tone.color,
      background: tone.background,
      border: `1px solid ${tone.border}`,
      whiteSpace: "nowrap",
    };
  },
  moduleSummary: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  moduleContent: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(260px, 0.95fr)",
    gap: "1rem",
    alignItems: "stretch",
  }),
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))",
    gap: "0.6rem",
    marginTop: "0.85rem",
  } as CSSProperties,
  metricItem: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surfaceMuted,
    padding: "0.75rem",
    display: "grid",
    gap: "0.2rem",
  } as CSSProperties,
  metricLabel: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  metricValue: {
    fontSize: 18,
    lineHeight: 1.1,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  metricDelta: {
    fontSize: 11,
    color: pageColorTokens.brandBlueDark,
    fontWeight: 600,
  } as CSSProperties,
  chartCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#fbfcfd",
    padding: "0.85rem",
    display: "grid",
    gap: "0.65rem",
  } as CSSProperties,
  chartTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  chartRow: {
    display: "grid",
    gridTemplateColumns: "92px minmax(0, 1fr) auto",
    gap: "0.55rem",
    alignItems: "center",
  } as CSSProperties,
  chartLabel: {
    fontSize: 12,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  chartTrack: {
    position: "relative" as const,
    height: 8,
    borderRadius: 999,
    background: pageColorTokens.divider,
    overflow: "hidden",
  },
  chartBar: (kind: ChartKind, value: number): CSSProperties => ({
    width: `${Math.max(10, Math.min(100, value))}%`,
    height: "100%",
    borderRadius: 999,
    background:
      kind === "funnel"
        ? "linear-gradient(90deg, #2952d8 0%, #4070f4 100%)"
        : kind === "stack"
          ? "linear-gradient(90deg, #007a5a 0%, #00a67c 100%)"
          : "linear-gradient(90deg, #7c3aed 0%, #4070f4 100%)",
  }),
  chartValue: {
    fontSize: 12,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  insightList: {
    display: "grid",
    gap: "0.75rem",
  } as CSSProperties,
  insightItem: (tone: InsightItemTone): CSSProperties => ({
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${
      tone === "critical"
        ? "#fecaca"
        : tone === "warning"
          ? "#fed7aa"
          : "#c7d2fe"
    }`,
    background:
      tone === "critical"
        ? "#fef2f2"
        : tone === "warning"
          ? "#fff7ed"
          : "#eef2ff",
    padding: "0.8rem 0.9rem",
    display: "grid",
    gap: "0.35rem",
  }),
  insightHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  } as CSSProperties,
  insightTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  insightMeta: {
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap" as const,
    alignItems: "center",
  } as CSSProperties,
  insightBadge: (tone: InsightItemTone): CSSProperties => ({
    borderRadius: 999,
    padding: "0.18rem 0.5rem",
    fontSize: 11,
    fontWeight: 700,
    color:
      tone === "critical"
        ? "#b91c1c"
        : tone === "warning"
          ? "#9a3412"
          : "#3730a3",
    background:
      tone === "critical"
        ? "#fee2e2"
        : tone === "warning"
          ? "#ffedd5"
          : "#e0e7ff",
  }),
  insightMetric: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
    fontWeight: 600,
  } as CSSProperties,
  drilldownGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  drilldownCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.9rem",
    display: "grid",
    gap: "0.35rem",
    cursor: "pointer",
  } as CSSProperties,
  drilldownTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as CSSProperties,
  drilldownTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  drilldownBadge: {
    borderRadius: 999,
    padding: "0.18rem 0.5rem",
    fontSize: 11,
    fontWeight: 700,
    color: pageColorTokens.brandBlueDark,
    background: pageColorTokens.brandBlueLight,
  } as CSSProperties,
  drilldownDetail: {
    fontSize: 12,
    lineHeight: 1.5,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  tableList: {
    display: "grid",
    gap: "0.55rem",
  } as CSSProperties,
  tableItem: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.7rem 0.8rem",
    display: "grid",
    gap: "0.2rem",
  } as CSSProperties,
  tableTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.65rem",
    alignItems: "center",
  } as CSSProperties,
  tableNote: {
    fontSize: 11,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  signalList: {
    display: "grid",
    gap: "0.45rem",
    marginTop: "0.85rem",
  } as CSSProperties,
  signalItem: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-start",
    fontSize: 12,
    lineHeight: 1.5,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: pageColorTokens.brandBlue,
    marginTop: 6,
    flexShrink: 0,
  } as CSSProperties,
  aiGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  reportCardGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  reportCard: (tone: ReportCardTone): CSSProperties => ({
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${
      tone === "positive"
        ? "#a7f3d0"
        : tone === "warning"
          ? "#fed7aa"
          : tone === "negative"
            ? "#fecaca"
            : pageColorTokens.borderSubtle
    }`,
    background:
      tone === "positive"
        ? "#ecfdf5"
        : tone === "warning"
          ? "#fff7ed"
          : tone === "negative"
            ? "#fef2f2"
            : pageColorTokens.surfaceMuted,
    padding: "0.9rem",
    display: "grid",
    gap: "0.25rem",
  }),
  reportCardLabel: {
    fontSize: 12,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  reportCardValue: {
    fontSize: 22,
    lineHeight: 1.1,
    fontWeight: 760,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  reportCardDetail: {
    fontSize: 12,
    lineHeight: 1.5,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  reportContentGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
    gap: "1rem",
    alignItems: "start",
  }),
  aiCard: {
    border: `1px dashed ${pageColorTokens.borderInput}`,
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surfaceMuted,
    padding: "0.95rem",
    display: "grid",
    gap: "0.45rem",
  } as CSSProperties,
  aiTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  aiBody: {
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
};

function SourceBadge({ source }: { source: ModuleSource }) {
  const label =
    source === "real" ? "真实数据" : source === "estimated" ? "估算/待接入" : "占位";
  return <span style={pageStyles.sourceBadge(source)}>{label}</span>;
}

function ModuleChartPreview({ chart }: { chart: ModuleChart }) {
  if (chart.kind === "table") {
    return (
      <div style={pageStyles.chartCard}>
        <div style={pageStyles.chartTitle}>{chart.title}</div>
        <div style={pageStyles.tableList}>
          {chart.items.map((item) => (
            <div key={`${chart.title}-${item.label}`} style={pageStyles.tableItem}>
              <div style={pageStyles.tableTop}>
                <strong style={pageStyles.chartLabel}>{item.label}</strong>
                <span style={pageStyles.chartValue}>{item.display}</span>
              </div>
              {item.note ? <div style={pageStyles.tableNote}>{item.note}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyles.chartCard}>
      <div style={pageStyles.chartTitle}>{chart.title}</div>
      {chart.items.map((item) => (
        <div key={`${chart.title}-${item.label}`} style={pageStyles.chartRow}>
          <span style={pageStyles.chartLabel}>{item.label}</span>
          <div style={pageStyles.chartTrack}>
            <div style={pageStyles.chartBar(chart.kind, item.value)} />
          </div>
          <span style={pageStyles.chartValue}>{item.display}</span>
        </div>
      ))}
    </div>
  );
}

function BusinessModuleCard({
  module,
  isMobile,
}: {
  module: BusinessModule;
  isMobile: boolean;
}) {
  return (
    <PageSurface title={module.title} subtitle={module.subtitle}>
      <div style={pageStyles.moduleHeader}>
        <p style={pageStyles.moduleSummary}>{module.summary}</p>
        <SourceBadge source={module.source} />
      </div>

      <div style={pageStyles.moduleContent(isMobile)}>
        <div>
          <div style={pageStyles.metricGrid}>
            {module.metrics.map((metric) => (
              <div key={`${module.key}-${metric.label}`} style={pageStyles.metricItem}>
                <span style={pageStyles.metricLabel}>{metric.label}</span>
                <span style={pageStyles.metricValue}>{metric.value}</span>
                <span style={pageStyles.metricDelta}>{metric.delta ?? "—"}</span>
              </div>
            ))}
          </div>

          <div style={pageStyles.signalList}>
            {module.signals.map((signal) => (
              <div key={`${module.key}-${signal}`} style={pageStyles.signalItem}>
                <span style={pageStyles.signalDot} />
                <span>{signal}</span>
              </div>
            ))}
          </div>

          <p style={pageHintTextStyle}>{module.actionHint}</p>
        </div>

        <ModuleChartPreview chart={module.chart} />
      </div>
    </PageSurface>
  );
}

function ReportSummaryCardView({ card }: { card: ReportSummaryCard }) {
  return (
    <div style={pageStyles.reportCard(card.tone)}>
      <span style={pageStyles.reportCardLabel}>{card.label}</span>
      <span style={pageStyles.reportCardValue}>{card.value}</span>
      <span style={pageStyles.reportCardDetail}>{card.detail}</span>
    </div>
  );
}

export function BusinessInsightsPage({
  title = "商业洞察",
  subtitle = "把经营数据整理成一份围绕 ROI 的日报，再往下展开各模块细节。",
  backLabel = "返回首页",
  fallbackPath = "/app",
}: {
  title?: string;
  subtitle?: string;
  backLabel?: string;
  fallbackPath?: string;
} = {}) {
  const { liveData } = useLoaderData<typeof loader>();
  const { isMobile } = useResponsiveLayout();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get("period") === "30d" ? "30d" : "7d";
  const moduleFilter = (searchParams.get("module") as ModuleFilterKey | null) ?? "all";
  const snapshots = useMemo(() => buildLiveSnapshots(liveData), [liveData]);
  const snapshot = useMemo(() => snapshots[period], [period, snapshots]);
  const filteredModules = useMemo(
    () => (moduleFilter === "all" ? snapshot.modules : snapshot.modules.filter((item) => item.key === moduleFilter)),
    [moduleFilter, snapshot.modules],
  );
  const moduleOptions = useMemo(
    () => [{ key: "all", label: "查看全部模块" }, ...snapshot.modules.map((item) => ({ key: item.key, label: item.title }))],
    [snapshot.modules],
  );
  const moduleSourceCounts = useMemo(
    () => ({
      real: snapshot.modules.filter((item) => item.source === "real").length,
      estimated: snapshot.modules.filter((item) => item.source === "estimated").length,
      pending: snapshot.modules.filter((item) => item.source === "pending").length,
    }),
    [snapshot.modules],
  );

  const currentReturnTo = useMemo(() => {
    const next = new URLSearchParams();
    next.set("period", period);
    if (moduleFilter !== "all") next.set("module", moduleFilter);
    const query = next.toString();
    return `${location.pathname}${query ? `?${query}` : ""}`;
  }, [location.pathname, moduleFilter, period]);

  const buildDetailHref = (href: string) => {
    return appendReturnTo(href, currentReturnTo);
  };

  const handleModuleChange = (nextKey: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextKey === "all") {
      next.delete("module");
    } else {
      next.set("module", nextKey);
    }
    setSearchParams(next, { replace: true });
    if (nextKey === "all" || typeof document === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById(`module-${nextKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={title}
        subtitle={subtitle}
        backLabel={backLabel}
        fallbackPath={fallbackPath}
        isMobile={isMobile}
      >
        <div style={pageStyles.page}>
          <PageSurface
            title="经营总览"
            subtitle="先把经营结果、数据覆盖和 ROI 阅读入口放到同一屏里。"
          >
            <div style={pageStyles.heroGrid(isMobile)}>
              <PageMetricCard
                accent={snapshot.metricAccent}
                metrics={snapshot.topMetrics}
                footer={snapshot.summary}
              />

              <div style={pageStyles.coverageList}>
                {snapshot.coverage.map((item) => (
                  <div key={item.label} style={pageStyles.coverageItem}>
                    <div style={pageSectionHeaderRowStyle}>
                      <span style={pageStyles.coverageLabel}>{item.label}</span>
                      <SourceBadge source={item.source} />
                    </div>
                    <div style={pageStyles.coverageValue}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: "1rem" }} />

            <div style={pageStyles.overviewGrid(isMobile)}>
              <div style={pageStyles.controlCard}>
                <DestinationFilterBar
                  label="时间范围"
                  items={periodItems}
                  active={period}
                  onChange={(next) => {
                    const params = new URLSearchParams(searchParams);
                    params.set("period", next);
                    params.delete("module");
                    setSearchParams(params, { replace: true });
                  }}
                />

                <div>
                  <label htmlFor="insights-module-select" style={pageFieldLabelStyle}>
                    聚焦模块
                  </label>
                  <select
                    id="insights-module-select"
                    value={moduleFilter}
                    style={{ ...pageSelectStyle(false), marginTop: 0 }}
                    onChange={(event) => handleModuleChange(event.target.value)}
                  >
                    {moduleOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={pageStyles.controlCard}>
                <div style={pageFieldLabelStyle}>本页重点</div>
                <div style={pageStyles.helperList}>
                  {snapshot.highlights.map((item) => (
                    <div key={item} style={pageStyles.helperItem}>
                      <span style={pageStyles.helperDot} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </PageSurface>

          <PageSurface
            title="ROI 日报"
            subtitle="日报先回答：ROI 是否健康、卡在哪个环节、今天先做什么。"
          >
            <p style={{ ...pageSectionSubtitleStyle, margin: "0 0 1rem" }}>{snapshot.report.summary}</p>

            <div style={pageStyles.reportCardGrid(isMobile)}>
              {snapshot.report.cards.map((card) => (
                <ReportSummaryCardView key={card.label} card={card} />
              ))}
            </div>

            <div style={{ height: "1rem" }} />

            <div style={pageStyles.reportContentGrid(isMobile)}>
              <div style={pageStyles.helperList}>
                <div style={pageFieldLabelStyle}>本次判断依据</div>
                {snapshot.report.focus.map((item) => (
                  <div key={item} style={pageStyles.helperItem}>
                    <span style={pageStyles.helperDot} />
                    <span>{item}</span>
                  </div>
                ))}

                <div style={{ height: "0.5rem" }} />
                <div style={pageFieldLabelStyle}>今日优先动作</div>
                {snapshot.report.actions.map((item) => (
                  <div key={item} style={pageStyles.helperItem}>
                    <span style={pageStyles.helperDot} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div style={pageStyles.moduleGrid}>
                {snapshot.report.charts.map((chart) => (
                  <ModuleChartPreview key={chart.title} chart={chart} />
                ))}
              </div>
            </div>
          </PageSurface>

          <PageSurface
            title="关键洞察"
            subtitle="首页先看洞察列表，详情解释和对象排查再往下深钻。"
          >
            <div style={pageStyles.insightList}>
              {snapshot.report.insights.map((item) => (
                <button
                  key={`${item.title}-${item.metric}`}
                  type="button"
                  style={pageStyles.insightItem(item.tone)}
                  onClick={() => {
                    if (item.href) {
                      navigate(buildDetailHref(item.href));
                      return;
                    }
                    if (item.targetKey) handleModuleChange(item.targetKey);
                  }}
                >
                  <div style={pageStyles.insightHeader}>
                    <span style={pageStyles.insightTitle}>{item.title}</span>
                    <div style={pageStyles.insightMeta}>
                      <span style={pageStyles.insightMetric}>{item.metric}</span>
                      <span style={pageStyles.insightBadge(item.tone)}>{item.confidence}置信</span>
                    </div>
                  </div>
                  <span style={pageStyles.drilldownDetail}>{item.detail}</span>
                </button>
              ))}
            </div>
          </PageSurface>

          <PageSurface
            title="深钻入口"
            subtitle="列表负责快速判断，详情负责展开对象、原因、ROI 影响和任务。"
          >
            <div style={pageStyles.drilldownGrid(isMobile)}>
              {snapshot.report.drilldowns.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  style={pageStyles.drilldownCard}
                  onClick={() => navigate(buildDetailHref(item.href))}
                >
                  <div style={pageStyles.drilldownTitleRow}>
                    <span style={pageStyles.drilldownTitle}>{item.title}</span>
                    <span style={pageStyles.drilldownBadge}>{item.badge}</span>
                  </div>
                  <span style={pageStyles.drilldownDetail}>{item.detail}</span>
                </button>
              ))}
            </div>
          </PageSurface>

          <PageSurface
            title="模块化数据视图"
            subtitle="先把流量、成本、转化、售后、利润等经营模块分开展示，后续 AI 只需要读取模块摘要，不直接吞原始杂乱数据。"
          >
            <div style={pageStyles.moduleToolbar(isMobile)}>
              <p style={{ ...pageSectionSubtitleStyle, margin: 0 }}>
                当前展示 {filteredModules.length} / {snapshot.modules.length} 个模块，页面阅读顺序会尽量保持“先结果、再原因、再动作”的单栏节奏。
              </p>
              <div style={pageStyles.moduleCounts}>
                <span style={pageStyles.countBadge("real")}>真实数据 {moduleSourceCounts.real}</span>
                <span style={pageStyles.countBadge("estimated")}>待接入 {moduleSourceCounts.estimated}</span>
                <span style={pageStyles.countBadge("pending")}>占位 {moduleSourceCounts.pending}</span>
              </div>
            </div>

            <div style={pageStyles.moduleGrid}>
              {filteredModules.map((module) => (
                <div key={module.key} id={`module-${module.key}`}>
                  <BusinessModuleCard module={module} isMobile={isMobile} />
                </div>
              ))}
            </div>
          </PageSurface>

          <PageSurface
            title="日报结论"
            subtitle="这里已经开始基于上面的真实数据摘要输出风险、机会和建议动作。"
          >
            <div style={pageStyles.aiGrid(isMobile)}>
              {snapshot.report.narratives.map((item) => (
                <div key={item.title} style={pageStyles.aiCard}>
                  <div style={pageStyles.aiTitle}>{item.title}</div>
                  <div style={pageStyles.aiBody}>{item.body}</div>
                </div>
              ))}
            </div>
          </PageSurface>

          <div style={pageEmptyStateStyle}>
            <strong>当前页面是第一版前端展示骨架</strong>
            <span style={pageSectionSubtitleStyle}>
              {liveData
                ? `当前已基于 ${liveData.shop} 的现有数据能力接入部分真实模块，剩余缺口会继续逐步替换占位。`
                : "当前还没拿到可用的真实数据，所以页面先退回到前端骨架。"}
            </span>
            <span style={{ ...pageSectionSubtitleStyle, marginTop: 0 }}>
              当前建议的实现顺序：{snapshot.nextSteps.join(" -> ")}
            </span>
          </div>
        </div>
      </DestinationPage>
    </div>
  );
}

export default function TodayBusinessInsights() {
  return <BusinessInsightsPage />;
}
