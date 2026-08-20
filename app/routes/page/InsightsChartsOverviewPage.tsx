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
import {
  buildLiveSnapshots,
  type BusinessModule,
  type ModuleChart,
  type ModuleSource,
  type Snapshot,
} from "../../server/operations/businessReportSnapshot.shared";
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
  source?: ModuleSource;
  previewTitle?: string;
  previewItems?: Array<{
    label: string;
    display: string;
    note?: string;
  }>;
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

type ChartsLiveData = InsightsOverviewLoaderData["liveData"];

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

function chartTypeFromModule(kind: ModuleChart["kind"]): ChartType {
  switch (kind) {
    case "bars":
      return "bar";
    case "stack":
      return "stacked_bar";
    case "funnel":
      return "funnel";
    default:
      return "table";
  }
}

function moduleSourceToQuality(source: ModuleSource): ChartDataQuality {
  if (source === "real") return "high";
  if (source === "estimated") return "medium";
  return "pending";
}

function findModule(snapshot: Snapshot, key: string): BusinessModule | null {
  return snapshot.modules.find((module) => module.key === key) ?? null;
}

function findMetricValue(module: BusinessModule | null, label: string): string | null {
  return module?.metrics.find((metric) => metric.label === label)?.value ?? null;
}

function buildPreviewItems(module: BusinessModule | null, limit = 3) {
  if (!module) return [];
  return module.chart.items.slice(0, limit).map((item) => ({
    label: item.label,
    display: item.display,
    note: item.note,
  }));
}

function normalizePreviewKey(value: string | null | undefined, fallback = "—"): string {
  return value?.trim() || fallback;
}

function normalizeMatchValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function matchesFocusLabel(label: string, focusLabel: string | null): boolean {
  const normalizedFocus = normalizeMatchValue(focusLabel);
  if (!normalizedFocus) return false;
  return normalizeMatchValue(label) === normalizedFocus;
}

function prioritizeFocusedPreviewItems<
  T extends {
    label: string;
    display: string;
    note?: string;
  },
>(items: T[], focusLabel: string | null): T[] {
  if (!focusLabel) return items;
  return [...items].sort((left, right) => {
    const leftFocused = matchesFocusLabel(left.label, focusLabel);
    const rightFocused = matchesFocusLabel(right.label, focusLabel);
    if (leftFocused === rightFocused) return 0;
    return leftFocused ? -1 : 1;
  });
}

function buildLandingPreviewItems(liveData: ChartsLiveData, limit = 3) {
  const rows = liveData?.ga4?.landingRows ?? [];
  return rows.slice(0, limit).map((row) => {
    const cvr = row.sessions > 0 ? (row.purchases / row.sessions) * 100 : null;
    return {
      label: normalizePreviewKey(row.key, "/"),
      display: `${row.sessions.toLocaleString("en-US")} sessions`,
      note: `${formatMoney(row.revenue, null)} revenue / CVR ${formatPercent(cvr)}`,
    };
  });
}

function buildChannelQualityPreviewItems(
  liveData: ChartsLiveData,
  module: BusinessModule | null,
  limit = 3,
) {
  const rows = liveData?.ga4?.channelRows ?? [];
  if (rows.length > 0) {
    return rows.slice(0, limit).map((row) => {
      const cvr = row.sessions > 0 ? (row.purchases / row.sessions) * 100 : null;
      return {
        label: normalizePreviewKey(row.key),
        display: `${row.sessions.toLocaleString("en-US")} sessions`,
        note: `${formatMoney(row.revenue, null)} revenue / CVR ${formatPercent(cvr)}`,
      };
    });
  }
  return buildPreviewItems(module, limit);
}

function buildInventoryPreviewItems(
  liveData: ChartsLiveData,
  module: BusinessModule | null,
  limit = 3,
) {
  const currency = liveData?.diagnosis?.summaryMetrics.currency ?? null;
  const rows = liveData?.diagnosis?.detail.inventoryRisks ?? [];
  if (rows.length > 0) {
    return rows.slice(0, limit).map((row) => ({
      label: row.sku,
      display: formatMoney(row.estimatedLoss, currency),
      note: `${row.title} / ${row.risk.toUpperCase()} / 可售 ${row.sellableDays ?? "∞"} 天`,
    }));
  }
  return buildPreviewItems(module, limit);
}

function buildAfterSalesPreviewItems(
  liveData: ChartsLiveData,
  module: BusinessModule | null,
  limit = 3,
) {
  const currency = liveData?.diagnosis?.summaryMetrics.currency ?? null;
  const rows = liveData?.diagnosis?.detail.topRefundSkus ?? [];
  if (rows.length > 0) {
    return rows.slice(0, limit).map((row) => ({
      label: row.sku,
      display: formatMoney(row.amount, currency),
      note: `${row.title} / ${row.reason} / Qty ${formatInteger(row.quantity)}`,
    }));
  }
  return buildPreviewItems(module, limit);
}

function buildModuleCard(params: {
  id: string;
  title: string;
  module: BusinessModule | null;
  fallbackSummary: string;
  href?: string;
  actionLabel?: string;
  metrics?: string[];
  previewTitle?: string;
  previewItems?: Array<{
    label: string;
    display: string;
    note?: string;
  }>;
  chartType?: ChartType;
}): DashboardCard {
  const module = params.module;
  return {
    id: params.id,
    title: params.title,
    summary: module?.summary ?? params.fallbackSummary,
    chartType: params.chartType ?? (module ? chartTypeFromModule(module.chart.kind) : "table"),
    metrics:
      params.metrics ??
      (module?.metrics.slice(0, 3).map((metric) => `${metric.label} ${metric.value}`) ?? []),
    dataQuality: module ? moduleSourceToQuality(module.source) : "pending",
    source: module?.source,
    previewTitle: params.previewTitle ?? module?.chart.title,
    previewItems: params.previewItems ?? buildPreviewItems(module),
    href: params.href,
    actionLabel: params.actionLabel,
  };
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

function sourceLabel(
  source: ModuleSource,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  switch (source) {
    case "real":
      return t("insights.chartSourceReal");
    case "estimated":
      return t("insights.chartSourceEstimated");
    default:
      return t("insights.chartSourcePending");
  }
}

function sourceTone(source: ModuleSource): CSSProperties {
  if (source === "real") {
    return {
      color: pageColorTokens.brandGreenDark,
      background: pageColorTokens.brandGreenLight,
      border: "1px solid rgba(0, 166, 124, 0.26)",
    };
  }
  if (source === "estimated") {
    return {
      color: "#8a5a00",
      background: "#fff7e0",
      border: "1px solid rgba(185, 137, 0, 0.28)",
    };
  }
  return {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: `1px dashed ${pageColorTokens.borderInput}`,
  };
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
  overview: AdsOverviewSnapshot | null;
  liveData: ChartsLiveData;
  snapshot: Snapshot;
  compareMode: CompareMode;
  embeddedSearch: string;
  pageSpeedTargetUrl: string | null;
  landingPageLabel: string | null;
  t: ReturnType<typeof useTranslation>["t"];
}): ChartsDashboard {
  const {
    overview,
    liveData,
    snapshot,
    compareMode,
    embeddedSearch,
    pageSpeedTargetUrl,
    landingPageLabel,
    t,
  } = params;
  const connectedPlatforms = overview?.platforms.filter((item) => item.connected) ?? [];
  const connectedCount = connectedPlatforms.length;
  const freshPlatforms = connectedPlatforms.filter(
    (item) => item.snapshot && !item.snapshot.stale,
  ).length;
  const bestPlatform = [...connectedPlatforms]
    .filter((item) => item.totals?.roas != null)
    .sort((left, right) => (right.totals?.roas ?? 0) - (left.totals?.roas ?? 0))[0] ?? null;
  const disapprovedTotal = (overview?.reviews ?? []).reduce(
    (sum, review) => sum + review.disapproved,
    0,
  );
  const healthAttentionCount = (overview?.health ?? []).filter((item) => item.state !== "ok").length;
  const primaryPerformanceHref = buildPerformanceHref(
    bestPlatform?.platform ?? "meta",
    overview?.rangeDays ?? 7,
    embeddedSearch,
  );
  const pageSpeedHref = pageSpeedTargetUrl
    ? `/app/settings/pagespeed?url=${encodeURIComponent(pageSpeedTargetUrl)}&strategy=mobile&autorun=1&source=insights-charts`
    : "/app/settings/pagespeed?source=insights-charts";
  const profitModule = findModule(snapshot, "profit");
  const costModule = findModule(snapshot, "cost");
  const channelModule = findModule(snapshot, "channel");
  const trafficModule = findModule(snapshot, "traffic");
  const conversionModule = findModule(snapshot, "conversion");
  const customerModule = findModule(snapshot, "customerValue");
  const siteExperienceModule = findModule(snapshot, "siteExperience");
  const inventoryModule = findModule(snapshot, "productInventory");
  const afterSalesModule = findModule(snapshot, "afterSales");
  const shortTermRoi = snapshot.report.roiLayers.find((item) => item.key === "short_term") ?? null;
  const paybackRoi = snapshot.report.roiLayers.find((item) => item.key === "payback") ?? null;
  const lifetimeRoi = snapshot.report.roiLayers.find((item) => item.key === "lifetime") ?? null;
  const topLandingMetric = findMetricValue(trafficModule, "Top Landing");
  const landingPreviewItems = buildLandingPreviewItems(liveData);

  const roiCards: DashboardCard[] = [
    buildModuleCard({
      id: "short_term_roi",
      title: t("insights.chartCardShortTermRoiTitle"),
      module: profitModule,
      fallbackSummary:
        shortTermRoi?.detail ??
        t("insights.chartCardShortTermRoiSummaryPending"),
      metrics: [
        `${shortTermRoi?.title ?? t("insights.chartCardShortTermRoiTitle")} ${shortTermRoi?.value ?? "—"}`,
        `${findMetricValue(profitModule, "贡献利润") ?? "贡献利润 —"}`,
        `${findMetricValue(costModule, "广告花费") ?? "广告花费 —"}`,
      ],
      previewTitle: profitModule?.chart.title ?? shortTermRoi?.title,
      href: primaryPerformanceHref,
      actionLabel: t("insights.chartCardOpenPerformance"),
    }),
    buildModuleCard({
      id: "channel_roi",
      title: t("insights.chartCardChannelRoiTitle"),
      module: channelModule,
      fallbackSummary:
        bestPlatform
          ? t("insights.chartCardChannelRoiSummaryReady", {
              platform: bestPlatform.accountName || bestPlatform.platform,
              roas: formatRatio(bestPlatform.totals?.roas ?? null, "x"),
            })
          : t("insights.chartCardChannelRoiSummaryPending"),
      metrics: [
        `${findMetricValue(channelModule, "最高收入渠道") ?? "最高收入渠道 —"}`,
        `${findMetricValue(channelModule, "最高利润渠道") ?? "最高利润渠道 —"}`,
        connectedCount > 0
          ? t("insights.chartCardConnectedPlatformsMetric", {
              connected: connectedCount,
              total: overview?.platforms.length ?? connectedCount,
            })
          : `${findMetricValue(channelModule, "Top 投放平台") ?? "Top 投放平台 —"}`,
      ],
      href: primaryPerformanceHref,
      actionLabel: t("insights.chartCardOpenPerformance"),
    }),
    buildModuleCard({
      id: "payback_curve",
      title: t("insights.chartCardPaybackCurveTitle"),
      module: conversionModule,
      fallbackSummary: paybackRoi?.detail ?? t("insights.chartCardPaybackCurveSummary"),
      metrics: [
        `${paybackRoi?.title ?? t("insights.chartCardPaybackCurveTitle")} ${paybackRoi?.value ?? "—"}`,
        `${findMetricValue(conversionModule, "整体 CVR") ?? "整体 CVR —"}`,
        `${findMetricValue(siteExperienceModule, "性能分") ?? "性能分 —"}`,
      ],
      previewTitle: conversionModule?.chart.title ?? paybackRoi?.title,
      href: "/app/insights?module=conversion",
      actionLabel: t("insights.chartCardOpenEvidence"),
    }),
  ];

  const acquisitionCards: DashboardCard[] = [
    buildModuleCard({
      id: "traffic_scale",
      title: t("insights.chartCardTrafficScaleTitle"),
      module: trafficModule,
      fallbackSummary: t("insights.chartCardTrafficScaleSummaryPending"),
      href: "/app/insights?module=traffic",
      actionLabel: t("insights.chartCardOpenEvidence"),
    }),
    buildModuleCard({
      id: "channel_quality",
      title: t("insights.chartCardChannelQualityTitle"),
      module: channelModule,
      fallbackSummary:
        healthAttentionCount > 0
          ? t("insights.chartCardChannelQualitySummaryWatch", {
              count: healthAttentionCount,
            })
          : t("insights.chartCardChannelQualitySummaryReady"),
      metrics: [
        t("insights.chartCardHealthMetric", { count: healthAttentionCount }),
        connectedCount > 0
          ? t("insights.chartCardFreshSnapshotsMetric", {
              ready: freshPlatforms,
              total: connectedCount,
            })
          : `${findMetricValue(channelModule, "可归因收入占比") ?? "可归因收入占比 —"}`,
        `${findMetricValue(customerModule, "高价值客户占比") ?? "高价值客户占比 —"}`,
      ],
      previewTitle: t("insights.chartCardChannelQualityPreviewTitle"),
      previewItems: buildChannelQualityPreviewItems(liveData, channelModule),
      href: appendEmbeddedSearchToPath("/app/ads-catalog", embeddedSearch),
      actionLabel: t("insights.chartCardOpenCatalog"),
    }),
    buildModuleCard({
      id: "acquisition_cohort",
      title: t("insights.chartCardAcquisitionCohortTitle"),
      module: customerModule,
      fallbackSummary: t("insights.chartCardAcquisitionCohortSummary", {
        compare:
          compareMode === "historical_baseline"
            ? t("insights.compareHistoricalBaseline")
            : compareMode === "structural"
              ? t("insights.compareStructural")
              : t("insights.comparePreviousPeriod"),
      }),
      metrics: [
        `${lifetimeRoi?.title ?? "长期价值"} ${lifetimeRoi?.value ?? "—"}`,
        `${findMetricValue(customerModule, "复购率") ?? "复购率 —"}`,
        `${findMetricValue(customerModule, "平均动态 LTV") ?? "平均动态 LTV —"}`,
      ],
      previewTitle: t("insights.chartCardAcquisitionCohortPreviewTitle"),
      href: "/app/insights?module=customerValue",
      actionLabel: t("insights.chartCardOpenEvidence"),
    }),
  ];

  const conversionCards: DashboardCard[] = [
    buildModuleCard({
      id: "funnel",
      title: t("insights.chartCardFunnelTitle"),
      module: conversionModule,
      fallbackSummary: t("insights.chartCardFunnelSummary"),
      href: "/app/today/diagnosis?detail=risk&riskTab=insights&insightKey=conversion_health",
      actionLabel: t("insights.chartCardOpenDiagnosis"),
    }),
    {
      id: "landing_page",
      title: t("insights.chartCardLandingPageTitle"),
      summary: landingPageLabel
        ? t("insights.chartCardLandingPageSummaryFocused", { page: landingPageLabel })
        : topLandingMetric
          ? `${t("insights.chartCardLandingPageSummary")} ${topLandingMetric}`
          : t("insights.chartCardLandingPageSummary"),
      chartType: "table",
      metrics: [
        landingPageLabel
          ? t("insights.chartCardLandingPageMetricFocused", { page: landingPageLabel })
          : `Top Landing ${topLandingMetric ?? "—"}`,
        `${findMetricValue(trafficModule, "近 7 天 Sessions") ?? "近 7 天 Sessions —"}`,
        `${findMetricValue(conversionModule, "整体 CVR") ?? "整体 CVR —"}`,
      ],
      dataQuality:
        trafficModule && trafficModule.source !== "pending"
          ? moduleSourceToQuality(trafficModule.source)
          : pageSpeedTargetUrl
            ? "medium"
            : "pending",
      source: trafficModule?.source,
      previewTitle: t("insights.chartCardLandingPagePreviewTitle"),
      previewItems:
        landingPreviewItems.length > 0
          ? landingPreviewItems
          : buildPreviewItems(trafficModule),
      href: pageSpeedHref,
      actionLabel: t("insights.chartCardOpenPageSpeed"),
    },
    buildModuleCard({
      id: "site_experience",
      title: t("insights.chartCardSiteExperienceTitle"),
      module: siteExperienceModule,
      fallbackSummary: t("insights.chartCardSiteExperienceSummary"),
      href: pageSpeedHref,
      actionLabel: t("insights.chartCardOpenPageSpeed"),
    }),
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
      metrics: (overview?.reviews ?? []).map((review) =>
        t("insights.chartCardProductReviewMetric", {
          channel:
            review.channel === "gmc"
              ? t("insights.reviewChannelGmc")
              : t("insights.reviewChannelMeta"),
          count: review.disapproved,
        }),
      ),
      dataQuality: hasReviewCoverage(overview?.reviews ?? []) ? "high" : "pending",
      previewTitle: connectedCount > 0 ? t("insights.chartCardOpenCatalog") : undefined,
      previewItems:
        overview?.reviews.slice(0, 3).map((review) => ({
          label:
            review.channel === "gmc"
              ? t("insights.reviewChannelGmc")
              : t("insights.reviewChannelMeta"),
          display: `${review.disapproved}`,
          note: `${review.approved}/${review.total}`,
        })) ?? [],
      href: appendEmbeddedSearchToPath("/app/ads-catalog", embeddedSearch),
      actionLabel: t("insights.chartCardOpenCatalog"),
    },
    buildModuleCard({
      id: "inventory_flow",
      title: t("insights.chartCardInventoryFlowTitle"),
      module: inventoryModule,
      fallbackSummary: t("insights.chartCardInventoryFlowSummary"),
      previewItems: buildInventoryPreviewItems(liveData, inventoryModule),
      href: "/app/today/diagnosis?detail=risk&riskTab=environment&environmentKey=inventory",
      actionLabel: t("insights.chartCardOpenDiagnosis"),
    }),
    buildModuleCard({
      id: "fulfillment_refund",
      title: t("insights.chartCardFulfillmentRefundTitle"),
      module: afterSalesModule,
      fallbackSummary: t("insights.chartCardFulfillmentRefundSummary"),
      previewItems: buildAfterSalesPreviewItems(liveData, afterSalesModule),
      href: "/app/today/orders",
      actionLabel: t("insights.chartCardOpenOrders"),
    }),
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
  const { overview, liveData, failed } = useLoaderData<InsightsOverviewLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const embeddedSearch = useEmbeddedLocationSearch();

  const rangeDaysParam = searchParams.get("range");
  const rangeDays =
    rangeDaysParam === "30" ? 30 : rangeDaysParam === "14" ? 14 : overview?.rangeDays ?? 7;
  const periodKey = rangeDays === 30 ? "30d" : "7d";
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
  const focusCard = searchParams.get("focusCard");
  const focusLabel = searchParams.get("focusLabel");
  const snapshots = useMemo(() => buildLiveSnapshots(liveData), [liveData]);
  const snapshot = useMemo(() => snapshots[periodKey], [periodKey, snapshots]);

  const dashboard = useMemo(
    () =>
      buildChartsDashboard({
        overview,
        liveData,
        snapshot,
        compareMode,
        embeddedSearch,
        pageSpeedTargetUrl,
        landingPageLabel,
        t,
      }),
    [
      compareMode,
      embeddedSearch,
      landingPageLabel,
      liveData,
      overview,
      pageSpeedTargetUrl,
      snapshot,
      t,
    ],
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
  const hasBusinessEvidence = snapshot.modules.some((item) => item.source !== "pending");
  const hasAnyEvidence = anyConnected || hasBusinessEvidence;

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
          ) : liveData?.generatedAt ? (
            <span style={pageHintTextStyle}>
              {new Date(liveData.generatedAt).toLocaleString()}
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

      {!hasAnyEvidence ? (
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
              {snapshot.topMetrics.slice(0, 4).map((metric) => (
                <MetricTile key={metric.label} label={metric.label} value={metric.value} />
              ))}
            </div>
          </PageSurface>

          {dashboard.groups.map((group) => (
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
                  const activeFocusLabel =
                    focusLabel && (focusCard ? card.id === focusCard : card.id === selectedCard)
                      ? focusLabel
                      : null;
                  const previewItems = prioritizeFocusedPreviewItems(
                    card.previewItems ?? [],
                    activeFocusLabel,
                  );
                  return (
                    <div key={card.id} style={chartCardStyle(focused)}>
                      <div style={chartCardHeaderStyle}>
                        <div style={{ display: "grid", gap: "0.35rem" }}>
                          <div style={cardTitleStyle}>{card.title}</div>
                          <div style={chartCardSummaryStyle}>{card.summary}</div>
                        </div>
                        <div style={chartCardBadgeRowStyle}>
                          {card.source ? (
                            <span style={{ ...sourcePillStyle, ...sourceTone(card.source) }}>
                              {sourceLabel(card.source, t)}
                            </span>
                          ) : null}
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
                      {previewItems.length > 0 ? (
                        <div style={previewListStyle}>
                          {card.previewTitle || activeFocusLabel ? (
                            <div style={previewHeaderStyle}>
                              {card.previewTitle ? (
                                <span style={previewTitleStyle}>{card.previewTitle}</span>
                              ) : null}
                              {activeFocusLabel ? (
                                <span style={previewFocusStyle}>{activeFocusLabel}</span>
                              ) : null}
                            </div>
                          ) : null}
                          {previewItems.map((item) => {
                            const itemFocused = matchesFocusLabel(item.label, activeFocusLabel);
                            return (
                              <div
                                key={`${card.id}-${item.label}-${item.display}`}
                                style={previewRowStyle(itemFocused)}
                              >
                                <span style={previewLabelStyle}>{item.label}</span>
                                <span style={previewValueStyle}>{item.display}</span>
                                {item.note ? (
                                  <span style={previewNoteStyle}>{item.note}</span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
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

const sourcePillStyle: CSSProperties = {
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

const previewListStyle: CSSProperties = {
  display: "grid",
  gap: "0.4rem",
  padding: "0.75rem",
  borderRadius: 12,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const previewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap",
};

const previewTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: pageColorTokens.textSecondary,
};

const previewFocusStyle: CSSProperties = {
  padding: "0.16rem 0.45rem",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: pageColorTokens.brandBlueDark,
  background: "#eef4ff",
  border: "1px solid rgba(0, 91, 211, 0.18)",
};

const previewRowStyle = (focused: boolean): CSSProperties => ({
  display: "grid",
  gap: "0.12rem",
  padding: "0.35rem 0.45rem",
  borderRadius: 10,
  background: focused ? "#eef4ff" : "transparent",
  border: focused
    ? "1px solid rgba(0, 91, 211, 0.18)"
    : "1px solid transparent",
});

const previewLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const previewValueStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textBody,
};

const previewNoteStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
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
