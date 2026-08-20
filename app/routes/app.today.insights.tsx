import { useCallback, useMemo, type CSSProperties } from "react";
import { useLoaderData, useLocation, useNavigate, useSearchParams } from "react-router";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { DestinationFilterBar, DestinationPage } from "./component/shared/DestinationPage";
import {
  PageMetricCard,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageFieldLabelStyle,
  pageSelectStyle,
  pageSectionHeaderRowStyle,
  pageStatusCardStyle,
} from "./page/pageUiStyles";

import { loader } from "../server/operations/businessReportSnapshot.server";
import {
  appendReturnTo,
  buildLiveSnapshots,
  periodItems,
  type ChartKind,
  type InsightItemTone,
  type ModuleFilterKey,
  type ModuleSource,
  type ReportCardTone,
  type ReportRoiLayerCard,
  type ReportSummaryCard,
} from "../server/operations/businessReportSnapshot.shared";

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
  compactGrid: (isMobile: boolean, columns = 3): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : `repeat(${columns}, minmax(0, 1fr))`,
    gap: "0.75rem",
  }),
  conclusionCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.95rem",
    display: "grid",
    gap: "0.35rem",
  } as CSSProperties,
  conclusionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  conclusionBody: {
    fontSize: 13,
    lineHeight: 1.6,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  factorGrid: (isMobile: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "0.75rem",
  }),
  factorCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.95rem",
    display: "grid",
    gap: "0.55rem",
    textAlign: "left" as const,
  } as CSSProperties,
  factorHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.65rem",
    alignItems: "flex-start",
  } as CSSProperties,
  factorTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
  factorMeta: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.4rem",
    alignItems: "center",
  } as CSSProperties,
  factorBadge: (tone: ReportCardTone): CSSProperties => ({
    borderRadius: 999,
    padding: "0.18rem 0.5rem",
    fontSize: 11,
    fontWeight: 700,
    color:
      tone === "negative"
        ? "#b91c1c"
        : tone === "warning"
          ? "#9a3412"
          : tone === "positive"
            ? "#047857"
            : "#334155",
    background:
      tone === "negative"
        ? "#fee2e2"
        : tone === "warning"
          ? "#ffedd5"
          : tone === "positive"
            ? "#dcfce7"
            : "#e5e7eb",
  }),
  factorSummary: {
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  factorEvidenceList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.45rem",
  } as CSSProperties,
  factorEvidenceItem: {
    borderRadius: 999,
    padding: "0.18rem 0.55rem",
    fontSize: 11,
    color: pageColorTokens.textBody,
    background: pageColorTokens.surfaceMuted,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
  } as CSSProperties,
  factorFooter: {
    display: "grid",
    gap: "0.3rem",
  } as CSSProperties,
  factorMetaList: {
    display: "grid",
    gap: "0.25rem",
  } as CSSProperties,
  factorMetaRow: {
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textBody,
  } as CSSProperties,
  factorMetaLabel: {
    color: pageColorTokens.textSecondary,
    fontWeight: 700,
  } as CSSProperties,
  factorAction: {
    fontSize: 12,
    lineHeight: 1.55,
    color: pageColorTokens.textSecondary,
  } as CSSProperties,
  factorLink: {
    fontSize: 12,
    fontWeight: 700,
    color: pageColorTokens.brandBlueDark,
  } as CSSProperties,
  actionList: {
    display: "grid",
    gap: "0.75rem",
  } as CSSProperties,
  actionCard: {
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    borderRadius: pageColorTokens.radiusControl,
    background: "#ffffff",
    padding: "0.9rem",
    display: "grid",
    gap: "0.25rem",
  } as CSSProperties,
  actionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: pageColorTokens.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  } as CSSProperties,
  actionBody: {
    fontSize: 13,
    lineHeight: 1.6,
    color: pageColorTokens.textPrimary,
  } as CSSProperties,
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

function ReportSummaryCardView({ card }: { card: ReportSummaryCard }) {
  return (
    <div style={pageStyles.reportCard(card.tone)}>
      <span style={pageStyles.reportCardLabel}>{card.label}</span>
      <span style={pageStyles.reportCardValue}>{card.value}</span>
      <span style={pageStyles.reportCardDetail}>{card.detail}</span>
    </div>
  );
}

function RoiLayerCardView({
  title,
  card,
}: {
  title: string;
  card: ReportRoiLayerCard;
}) {
  return (
    <div style={pageStyles.reportCard(card.tone)}>
      <span style={pageStyles.reportCardLabel}>{title}</span>
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
  const moduleOptions = useMemo(
    () => [{ key: "all", label: "查看全部模块" }, ...snapshot.modules.map((item) => ({ key: item.key, label: item.title }))],
    [snapshot.modules],
  );

  const currentReturnTo = useMemo(() => {
    const next = new URLSearchParams();
    next.set("period", period);
    if (moduleFilter !== "all") next.set("module", moduleFilter);
    const query = next.toString();
    return `${location.pathname}${query ? `?${query}` : ""}`;
  }, [location.pathname, moduleFilter, period]);

  const buildDetailHref = useCallback(
    (href: string) => appendReturnTo(href, currentReturnTo),
    [currentReturnTo],
  );

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

  const factorCards = useMemo(
    () =>
      (moduleFilter === "all"
        ? snapshot.report.factorCards
        : snapshot.report.factorCards.filter((item) => item.key === moduleFilter)
      ).map((item) => ({
        ...item,
        href: item.href ? buildDetailHref(item.href) : undefined,
      })),
    [buildDetailHref, moduleFilter, snapshot.report.factorCards],
  );

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
          <PageSurface title="报告头部">
            <div style={pageStyles.heroGrid(isMobile)}>
              <PageMetricCard
                accent={snapshot.metricAccent}
                metrics={snapshot.topMetrics}
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
              <ReportSummaryCardView
                card={
                  snapshot.report.cards[2] ?? {
                    label: "数据可信度",
                    value: "待补",
                    detail: "关键数据信号还在继续补齐。",
                    tone: "neutral",
                  }
                }
              />
            </div>
          </PageSurface>

          <PageSurface title="经营结论">
            <div style={pageStyles.compactGrid(isMobile)}>
              {snapshot.report.narratives.map((item) => (
                <div key={item.title} style={pageStyles.conclusionCard}>
                  <div style={pageStyles.conclusionTitle}>{item.title}</div>
                  <div style={pageStyles.conclusionBody}>{item.body}</div>
                </div>
              ))}
            </div>
          </PageSurface>

          <PageSurface title="ROI 三层判断">
            <div style={pageStyles.reportCardGrid(isMobile)}>
              {snapshot.report.roiLayers.map((item) => (
                <RoiLayerCardView key={item.key} title={item.title} card={item} />
              ))}
            </div>
          </PageSurface>

          <PageSurface title="关键因子诊断">
            <div style={pageStyles.factorGrid(isMobile)}>
              {factorCards.map((item) => (
                <button
                  key={item.key}
                  id={`module-${item.key}`}
                  type="button"
                  style={pageStyles.factorCard}
                  onClick={() => {
                    if (item.href) {
                      navigate(item.href);
                      return;
                    }
                    handleModuleChange(item.key);
                  }}
                >
                  <div style={pageStyles.factorHeader}>
                    <div>
                      <div style={pageStyles.factorTitle}>{item.title}</div>
                      <div style={pageStyles.factorSummary}>{item.summary}</div>
                    </div>
                    <div style={pageStyles.factorMeta}>
                      <span style={pageStyles.factorBadge(item.tone)}>{item.statusLabel}</span>
                      <span style={pageStyles.factorBadge("neutral")}>{item.roiLayerLabel}</span>
                      <SourceBadge source={item.source} />
                    </div>
                  </div>

                  <div style={pageStyles.factorEvidenceList}>
                    {item.evidence.map((evidence) => (
                      <span key={`${item.key}-${evidence}`} style={pageStyles.factorEvidenceItem}>
                        {evidence}
                      </span>
                    ))}
                  </div>

                  <div style={pageStyles.factorFooter}>
                    <div style={pageStyles.factorMetaList}>
                      <div style={pageStyles.factorMetaRow}>
                        <span style={pageStyles.factorMetaLabel}>对比基准：</span>
                        <span>{item.comparison}</span>
                      </div>
                      <div style={pageStyles.factorMetaRow}>
                        <span style={pageStyles.factorMetaLabel}>影响路径：</span>
                        <span>{item.impactPath}</span>
                      </div>
                    </div>
                    <div style={pageStyles.factorAction}>
                      <span style={pageStyles.factorMetaLabel}>推荐动作：</span>
                      <span>{item.action}</span>
                    </div>
                    <span style={pageStyles.factorLink}>
                      {item.href ? "查看深钻" : "聚焦该因子"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </PageSurface>

          <PageSurface title="Top 洞察">
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

          <PageSurface title="推荐动作">
            <div style={pageStyles.actionList}>
              {snapshot.report.actions.map((item, index) => (
                <div key={`${index + 1}-${item}`} style={pageStyles.actionCard}>
                  <span style={pageStyles.actionLabel}>{`动作 ${index + 1}`}</span>
                  <span style={pageStyles.actionBody}>{item}</span>
                </div>
              ))}
            </div>
          </PageSurface>

          <PageSurface title="深钻入口">
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
        </div>
      </DestinationPage>
    </div>
  );
}

export default function TodayBusinessInsights() {
  return <BusinessInsightsPage />;
}
