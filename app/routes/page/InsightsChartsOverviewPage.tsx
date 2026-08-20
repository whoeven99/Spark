import { useMemo, type CSSProperties } from "react";
import {
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { appendEmbeddedSearchToPath } from "../../lib/embeddedLocationSearch";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import {
  analysisPageContentStyle,
  mobilePageContentStyle,
  PageHeaderNav,
  PageSectionHeader,
  PageSurface,
  pageColorTokens,
  pageEmptyStateStyle,
  pageHintTextStyle,
  pageMetricCardStyle,
  pageMetricLabelStyle,
  pageMetricTileStyle,
  pageMetricValueStyle,
} from "./pageUiStyles";
import {
  DestinationFilterBar,
  destinationSurfaceStyle,
} from "../component/shared/DestinationPage";
import type {
  AdsOverviewPlatform,
  AdsOverviewReview,
  AdsOverviewSnapshot,
} from "../../server/adsInsights/overview.server";
import type { InsightsOverviewLoaderData } from "../app.insights.charts._index";

const RANGE_OPTIONS = [7, 14, 30] as const;
const COMPARE_OPTIONS = [
  "previous_period",
  "historical_baseline",
  "structural",
] as const;

type CompareMode = (typeof COMPARE_OPTIONS)[number];
type DashboardGroupKey =
  | "roi"
  | "acquisition"
  | "conversion"
  | "merchandising_ops";
type ChartType =
  | "line"
  | "bar"
  | "stacked_bar"
  | "funnel"
  | "table"
  | "cohort_curve";
type ChartDataQuality = "high" | "medium" | "low" | "pending";

type DashboardCard = {
  id: string;
  title: string;
  summary: string;
  chartType: ChartType;
  metrics: string[];
  dataQuality: ChartDataQuality;
  href?: string;
  actionLabel?: string;
};

type DashboardGroup = {
  key: DashboardGroupKey;
  title: string;
  summary: string;
  cards: DashboardCard[];
};

type ChartsDashboard = {
  groups: DashboardGroup[];
};

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number, currency: string | null): string {
  const amount = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency ? `${currency} ${amount}` : amount;
}

function formatRatio(value: number | null, suffix: string): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}${suffix}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

function qualityTone(quality: ChartDataQuality): CSSProperties {
  if (quality === "high") {
    return {
      color: pageColorTokens.brandGreenDark,
      background: pageColorTokens.brandGreenLight,
      border: "1px solid rgba(0, 166, 124, 0.26)",
    };
  }
  if (quality === "medium") {
    return {
      color: "#8a5a00",
      background: "#fff7e0",
      border: "1px solid rgba(185, 137, 0, 0.28)",
    };
  }
  if (quality === "low") {
    return {
      color: pageColorTokens.textSecondary,
      background: pageColorTokens.surfaceMuted,
      border: `1px solid ${pageColorTokens.borderSubtle}`,
    };
  }
  return {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: `1px dashed ${pageColorTokens.borderInput}`,
  };
}

function chartTypeLabel(type: ChartType, t: ReturnType<typeof useTranslation>["t"]): string {
  switch (type) {
    case "line":
      return t("insights.chartTypeLine");
    case "bar":
      return t("insights.chartTypeBar");
    case "stacked_bar":
      return t("insights.chartTypeStackedBar");
    case "funnel":
      return t("insights.chartTypeFunnel");
    case "table":
      return t("insights.chartTypeTable");
    default:
      return t("insights.chartTypeCohort");
  }
}

function qualityLabel(
  quality: ChartDataQuality,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (quality) {
    case "high":
      return t("insights.chartDataQualityHigh");
    case "medium":
      return t("insights.chartDataQualityMedium");
    case "low":
      return t("insights.chartDataQualityLow");
    default:
      return t("insights.chartDataQualityPending");
  }
}

function buildPerformanceHref(
  platform: AdsOverviewPlatform["platform"],
  rangeDays: number,
  search: string,
): string {
  const params = new URLSearchParams(search);
  params.set("platform", platform);
  params.set("range", String(rangeDays));
  params.delete("sandbox");
  return `/app/insights/charts/performance?${params.toString()}`;
}

function buildChartsDashboard(params: {
  overview: AdsOverviewSnapshot;
  compareMode: CompareMode;
  embeddedSearch: string;
  pageSpeedTargetUrl: string | null;
  landingPageLabel: string | null;
  t: ReturnType<typeof useTranslation>["t"];
}): ChartsDashboard {
  const {
    overview,
    compareMode,
    embeddedSearch,
    pageSpeedTargetUrl,
    landingPageLabel,
    t,
  } = params;
  const connectedPlatforms = overview.platforms.filter((item) => item.connected);
  const connectedCount = connectedPlatforms.length;
  const freshPlatforms = connectedPlatforms.filter(
    (item) => item.snapshot && !item.snapshot.stale,
  ).length;
  const bestPlatform = [...connectedPlatforms]
    .filter((item) => item.totals?.roas != null)
    .sort((left, right) => (right.totals?.roas ?? 0) - (left.totals?.roas ?? 0))[0] ?? null;
  const disapprovedTotal = overview.reviews.reduce(
    (sum, review) => sum + review.disapproved,
    0,
  );
  const healthAttentionCount = overview.health.filter((item) => item.state !== "ok").length;
  const primaryPerformanceHref = buildPerformanceHref(
    bestPlatform?.platform ?? "meta",
    overview.rangeDays,
    embeddedSearch,
  );
  const pageSpeedHref = pageSpeedTargetUrl
    ? `/app/settings/pagespeed?url=${encodeURIComponent(pageSpeedTargetUrl)}&strategy=mobile&autorun=1&source=insights-charts`
    : "/app/settings/pagespeed?source=insights-charts";

  const roiCards: DashboardCard[] = [
    {
      id: "short_term_roi",
      title: t("insights.chartCardShortTermRoiTitle"),
      summary:
        overview.totals.roas != null
          ? t("insights.chartCardShortTermRoiSummaryReady", {
              roas: formatRatio(overview.totals.roas, "x"),
            })
          : t("insights.chartCardShortTermRoiSummaryPending"),
      chartType: "line",
      metrics: [
        `${t("insights.kpiSpend")} ${formatMoney(overview.totals.spend, overview.currencyCode)}`,
        `${t("insights.kpiValue")} ${formatMoney(
          overview.totals.conversionsValue,
          overview.currencyCode,
        )}`,
        `${t("insights.kpiRoas")} ${formatRatio(overview.totals.roas, "x")}`,
      ],
      dataQuality: connectedCount > 0 ? "high" : "pending",
      href: primaryPerformanceHref,
      actionLabel: t("insights.chartCardOpenPerformance"),
    },
    {
      id: "channel_roi",
      title: t("insights.chartCardChannelRoiTitle"),
      summary: bestPlatform
        ? t("insights.chartCardChannelRoiSummaryReady", {
            platform: bestPlatform.accountName || bestPlatform.platform,
            roas: formatRatio(bestPlatform.totals?.roas ?? null, "x"),
          })
        : t("insights.chartCardChannelRoiSummaryPending"),
      chartType: "bar",
      metrics: [
        t("insights.chartCardConnectedPlatformsMetric", {
          connected: connectedCount,
          total: overview.platforms.length,
        }),
        t("insights.chartCardFreshSnapshotsMetric", {
          ready: freshPlatforms,
          total: connectedCount,
        }),
      ],
      dataQuality: connectedCount > 0 ? "medium" : "pending",
      href: primaryPerformanceHref,
      actionLabel: t("insights.chartCardOpenPerformance"),
    },
    {
      id: "payback_curve",
      title: t("insights.chartCardPaybackCurveTitle"),
      summary: t("insights.chartCardPaybackCurveSummary"),
      chartType: "cohort_curve",
      metrics: [t("insights.chartCardPendingMetric")],
      dataQuality: "pending",
    },
  ];

  const acquisitionCards: DashboardCard[] = [
    {
      id: "traffic_scale",
      title: t("insights.chartCardTrafficScaleTitle"),
      summary:
        overview.totals.impressions > 0 || overview.totals.clicks > 0
          ? t("insights.chartCardTrafficScaleSummaryReady")
          : t("insights.chartCardTrafficScaleSummaryPending"),
      chartType: "line",
      metrics: [
        `${t("insights.chartMetricImpressions")} ${formatInteger(overview.totals.impressions)}`,
        `${t("insights.chartMetricClicks")} ${formatInteger(overview.totals.clicks)}`,
        `${t("insights.chartMetricCtr")} ${formatPercent(overview.totals.ctr)}`,
      ],
      dataQuality:
        overview.totals.impressions > 0 || overview.totals.clicks > 0 ? "high" : "pending",
      href: primaryPerformanceHref,
      actionLabel: t("insights.chartCardOpenPerformance"),
    },
    {
      id: "channel_quality",
      title: t("insights.chartCardChannelQualityTitle"),
      summary:
        healthAttentionCount > 0
          ? t("insights.chartCardChannelQualitySummaryWatch", {
              count: healthAttentionCount,
            })
          : t("insights.chartCardChannelQualitySummaryReady"),
      chartType: "stacked_bar",
      metrics: [
        t("insights.chartCardHealthMetric", { count: healthAttentionCount }),
        t("insights.chartCardFreshSnapshotsMetric", {
          ready: freshPlatforms,
          total: connectedCount,
        }),
      ],
      dataQuality: connectedCount > 0 ? "medium" : "pending",
      href: appendEmbeddedSearchToPath("/app/ads-catalog", embeddedSearch),
      actionLabel: t("insights.chartCardOpenCatalog"),
    },
    {
      id: "acquisition_cohort",
      title: t("insights.chartCardAcquisitionCohortTitle"),
      summary: t("insights.chartCardAcquisitionCohortSummary", {
        compare:
          compareMode === "historical_baseline"
            ? t("insights.compareHistoricalBaseline")
            : compareMode === "structural"
              ? t("insights.compareStructural")
              : t("insights.comparePreviousPeriod"),
      }),
      chartType: "cohort_curve",
      metrics: [t("insights.chartCardPendingMetric")],
      dataQuality: "pending",
    },
  ];

  const conversionCards: DashboardCard[] = [
    {
      id: "funnel",
      title: t("insights.chartCardFunnelTitle"),
      summary: t("insights.chartCardFunnelSummary"),
      chartType: "funnel",
      metrics: [t("insights.chartCardPendingMetric")],
      dataQuality: "pending",
      href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=conversion_health",
      actionLabel: t("insights.chartCardOpenDiagnosis"),
    },
    {
      id: "landing_page",
      title: t("insights.chartCardLandingPageTitle"),
      summary: landingPageLabel
        ? t("insights.chartCardLandingPageSummaryFocused", { page: landingPageLabel })
        : t("insights.chartCardLandingPageSummary"),
      chartType: "table",
      metrics: [
        landingPageLabel
          ? t("insights.chartCardLandingPageMetricFocused", { page: landingPageLabel })
          : t("insights.chartCardPendingMetric"),
      ],
      dataQuality: pageSpeedTargetUrl ? "medium" : "pending",
      href: pageSpeedHref,
      actionLabel: t("insights.chartCardOpenPageSpeed"),
    },
    {
      id: "site_experience",
      title: t("insights.chartCardSiteExperienceTitle"),
      summary: t("insights.chartCardSiteExperienceSummary"),
      chartType: "table",
      metrics: [t("insights.chartMetricPageSpeedReady")],
      dataQuality: "medium",
      href: pageSpeedHref,
      actionLabel: t("insights.chartCardOpenPageSpeed"),
    },
  ];

  const merchandisingOpsCards: DashboardCard[] = [
    {
      id: "product_review",
      title: t("insights.chartCardProductReviewTitle"),
      summary:
        disapprovedTotal > 0
          ? t("insights.chartCardProductReviewSummaryWatch", { count: disapprovedTotal })
          : t("insights.chartCardProductReviewSummaryReady"),
      chartType: "table",
      metrics: overview.reviews.map((review) =>
        t("insights.chartCardProductReviewMetric", {
          channel:
            review.channel === "gmc"
              ? t("insights.reviewChannelGmc")
              : t("insights.reviewChannelMeta"),
          count: review.disapproved,
        }),
      ),
      dataQuality: hasReviewCoverage(overview.reviews) ? "high" : "pending",
      href: appendEmbeddedSearchToPath("/app/ads-catalog", embeddedSearch),
      actionLabel: t("insights.chartCardOpenCatalog"),
    },
    {
      id: "inventory_flow",
      title: t("insights.chartCardInventoryFlowTitle"),
      summary: t("insights.chartCardInventoryFlowSummary"),
      chartType: "table",
      metrics: [t("insights.chartCardPendingMetric")],
      dataQuality: "pending",
      href: "/app/today/diagnosis?detail=risk&riskTab=environment&environmentKey=inventory",
      actionLabel: t("insights.chartCardOpenDiagnosis"),
    },
    {
      id: "fulfillment_refund",
      title: t("insights.chartCardFulfillmentRefundTitle"),
      summary: t("insights.chartCardFulfillmentRefundSummary"),
      chartType: "table",
      metrics: [t("insights.chartCardPendingMetric")],
      dataQuality: "pending",
      href: "/app/today/orders",
      actionLabel: t("insights.chartCardOpenOrders"),
    },
  ];

  return {
    groups: [
      {
        key: "roi",
        title: t("insights.chartGroupRoiTitle"),
        summary: t("insights.chartGroupRoiSummary"),
        cards: roiCards,
      },
      {
        key: "acquisition",
        title: t("insights.chartGroupAcquisitionTitle"),
        summary: t("insights.chartGroupAcquisitionSummary"),
        cards: acquisitionCards,
      },
      {
        key: "conversion",
        title: t("insights.chartGroupConversionTitle"),
        summary: t("insights.chartGroupConversionSummary"),
        cards: conversionCards,
      },
      {
        key: "merchandising_ops",
        title: t("insights.chartGroupMerchandisingOpsTitle"),
        summary: t("insights.chartGroupMerchandisingOpsSummary"),
        cards: merchandisingOpsCards,
      },
    ],
  };
}

function hasReviewCoverage(reviews: AdsOverviewReview[]): boolean {
  return reviews.some((review) => review.total > 0);
}

export function InsightsChartsOverviewPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useNavigate();
  const { overview, failed } = useLoaderData<InsightsOverviewLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const embeddedSearch = useEmbeddedLocationSearch();

  const rangeDays = overview?.rangeDays ?? 7;
  const compareMode = (
    COMPARE_OPTIONS.includes(
      (searchParams.get("compare") as CompareMode | null) ?? "previous_period",
    )
      ? (searchParams.get("compare") as CompareMode | null)
      : "previous_period"
  ) ?? "previous_period";
  const selectedGroup = (searchParams.get("group") as DashboardGroupKey | null) ?? null;
  const selectedCard = searchParams.get("card");
  const refreshing = revalidator.state !== "idle";
  const pageSpeedTargetUrl = searchParams.get("pageSpeedUrl");
  const landingPageLabel = searchParams.get("landingPage");

  const dashboard = useMemo(
    () =>
      overview
        ? buildChartsDashboard({
            overview,
            compareMode,
            embeddedSearch,
            pageSpeedTargetUrl,
            landingPageLabel,
            t,
          })
        : null,
    [compareMode, embeddedSearch, landingPageLabel, overview, pageSpeedTargetUrl, t],
  );

  const handleRangeChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", next);
    setSearchParams(params, { preventScrollReset: true });
  };

  const handleCompareChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("compare", next);
    setSearchParams(params, { preventScrollReset: true });
  };

  const anyConnected = overview?.platforms.some((item) => item.connected) ?? false;

  return (
    <div style={isMobile ? mobilePageContentStyle : analysisPageContentStyle}>
      <PageHeaderNav
        titleBarTitle={t("nav.insights")}
        title={t("insights.chartsTitle")}
        subtitle={t("insights.chartsSubtitle")}
        backLabel={t("insights.backToToday")}
        fallbackPath="/app/today"
      />

      <div style={toolbarStyle(isMobile)}>
        <div style={toolbarFilterGrid(isMobile)}>
          <DestinationFilterBar
            label={t("insights.rangeLabel")}
            items={RANGE_OPTIONS.map((days) => ({
              key: String(days),
              label: t("insights.rangeDays", { count: days }),
            }))}
            active={String(rangeDays)}
            onChange={handleRangeChange}
          />
          <DestinationFilterBar
            label={t("insights.compareLabel")}
            items={COMPARE_OPTIONS.map((mode) => ({
              key: mode,
              label:
                mode === "previous_period"
                  ? t("insights.comparePreviousPeriod")
                  : mode === "historical_baseline"
                    ? t("insights.compareHistoricalBaseline")
                    : t("insights.compareStructural"),
            }))}
            active={compareMode}
            onChange={handleCompareChange}
          />
        </div>
        <div style={toolbarSideStyle}>
          {overview ? (
            <span style={pageHintTextStyle}>
              {t("insights.windowHint", {
                start: overview.dateStart,
                end: overview.dateEnd,
              })}
            </span>
          ) : null}
          <button
            type="button"
            style={refreshButtonStyle(refreshing)}
            disabled={refreshing}
            onClick={() => revalidator.revalidate()}
          >
            {refreshing ? t("insights.refreshing") : t("insights.refresh")}
          </button>
        </div>
      </div>

      {failed ? <div style={errorBoxStyle}>{t("insights.loadFailed")}</div> : null}

      {!overview ? null : !anyConnected ? (
        <div style={pageEmptyStateStyle}>
          <strong style={{ fontSize: "1rem", color: pageColorTokens.textPrimary }}>
            {t("insights.emptyTitle")}
          </strong>
          <span>{t("insights.emptyBody")}</span>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={() => navigate(appendEmbeddedSearchToPath("/app/ads-catalog", embeddedSearch))}
          >
            {t("insights.emptyCta")}
          </button>
        </div>
      ) : (
        <>
          <PageSurface>
            <PageSectionHeader
              title={t("insights.chartsOverviewSectionTitle")}
              subtitle={t("insights.chartsOverviewSectionSubtitle")}
            />
            <div style={metricGridStyle(isMobile)}>
              <MetricTile
                label={t("insights.kpiSpend")}
                value={formatMoney(overview.totals.spend, overview.currencyCode)}
              />
              <MetricTile
                label={t("insights.kpiRoas")}
                value={formatRatio(overview.totals.roas, "x")}
              />
              <MetricTile
                label={t("insights.kpiConversions")}
                value={formatInteger(overview.totals.conversions)}
              />
              <MetricTile
                label={t("insights.overviewConnectedPlatforms")}
                value={t("insights.overviewConnectedPlatformsValue", {
                  connected: overview.platforms.filter((item) => item.connected).length,
                  total: overview.platforms.length,
                })}
              />
            </div>
          </PageSurface>

          {dashboard?.groups.map((group) => (
            <PageSurface key={group.key} title={group.title}>
              <div style={groupSummaryRowStyle}>
                <div id={`chart-group-${group.key}`} style={groupSummaryStyle}>
                  {group.summary}
                </div>
                {selectedGroup === group.key ? (
                  <span style={selectedGroupBadgeStyle}>{t("insights.chartGroupFocused")}</span>
                ) : null}
              </div>
              <div style={cardGridStyle(isMobile)}>
                {group.cards.map((card) => {
                  const focused = selectedGroup === group.key && selectedCard === card.id;
                  return (
                    <div key={card.id} style={chartCardStyle(focused)}>
                      <div style={chartCardHeaderStyle}>
                        <div style={{ display: "grid", gap: "0.35rem" }}>
                          <div style={cardTitleStyle}>{card.title}</div>
                          <div style={chartCardSummaryStyle}>{card.summary}</div>
                        </div>
                        <div style={chartCardBadgeRowStyle}>
                          <span style={cardTypePillStyle}>
                            {chartTypeLabel(card.chartType, t)}
                          </span>
                          <span style={{ ...dataQualityPillStyle, ...qualityTone(card.dataQuality) }}>
                            {qualityLabel(card.dataQuality, t)}
                          </span>
                        </div>
                      </div>
                      <div style={metricChipWrapStyle}>
                        {card.metrics.map((metric) => (
                          <span key={`${card.id}-${metric}`} style={metricChipStyle}>
                            {metric}
                          </span>
                        ))}
                      </div>
                      {card.href ? (
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => navigate(appendEmbeddedSearchToPath(card.href!, embeddedSearch))}
                        >
                          {card.actionLabel ?? t("insights.chartCardOpenEvidence")}
                        </button>
                      ) : (
                        <span style={pageHintTextStyle}>
                          {t("insights.chartCardPendingAction")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </PageSurface>
          ))}
        </>
      )}
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={pageMetricCardStyle}>
      <div style={pageMetricTileStyle}>
        <p style={pageMetricLabelStyle}>{label}</p>
        <p style={pageMetricValueStyle}>{value}</p>
      </div>
    </div>
  );
}

const toolbarStyle = (isMobile: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  alignItems: isMobile ? "stretch" : "flex-end",
  justifyContent: "space-between",
  gap: "0.75rem",
});

const toolbarFilterGrid = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(220px, max-content))",
  gap: "0.75rem",
});

const toolbarSideStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  flexWrap: "wrap",
};

const metricGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
  gap: "0.75rem",
});

const groupSummaryStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const groupSummaryRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const cardGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const chartCardStyle = (focused: boolean): CSSProperties => ({
  ...destinationSurfaceStyle,
  padding: "1rem",
  display: "grid",
  gap: "0.8rem",
  borderColor: focused ? pageColorTokens.brandBlue : pageColorTokens.borderSubtle,
  boxShadow: focused ? "0 0 0 1px rgba(0, 91, 211, 0.12)" : destinationSurfaceStyle.boxShadow,
  background: focused ? "#f7fbff" : pageColorTokens.surface,
});

const chartCardHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const chartCardSummaryStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const chartCardBadgeRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const cardTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 750,
  color: pageColorTokens.textPrimary,
};

const cardTypePillStyle: CSSProperties = {
  padding: "0.16rem 0.5rem",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const dataQualityPillStyle: CSSProperties = {
  padding: "0.16rem 0.5rem",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
};

const metricChipWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.4rem",
};

const metricChipStyle: CSSProperties = {
  padding: "0.36rem 0.55rem",
  borderRadius: 10,
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const selectedGroupBadgeStyle: CSSProperties = {
  padding: "0.18rem 0.55rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.brandBlueDark,
  background: "#eef4ff",
  border: "1px solid rgba(0, 91, 211, 0.2)",
};

const refreshButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "0.45rem 0.85rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
  color: disabled ? pageColorTokens.textSecondary : pageColorTokens.textBody,
  fontSize: 12,
  fontWeight: 700,
  cursor: disabled ? "default" : "pointer",
  fontFamily: "inherit",
});

const secondaryButtonStyle: CSSProperties = {
  justifySelf: "start",
  padding: "0.4rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textBody,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryButtonStyle: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "none",
  background: pageColorTokens.brandGreen,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const errorBoxStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "1px solid rgba(220, 38, 38, 0.2)",
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  fontSize: 13,
};
