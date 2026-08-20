import { useMemo, type CSSProperties } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { resolveDateWindow } from "../../server/adsInsights/dateRange.server";
import {
  analysisPageContentStyle,
  mobilePageContentStyle,
  PageHeaderNav,
  PageSurface,
  pageColorTokens,
  pageEmptyStateStyle,
  pageHintTextStyle,
  pageMetricCardStyle,
  pageMetricLabelStyle,
  pageMetricTileStyle,
  pageMetricValueStyle,
} from "./pageUiStyles";
import { DestinationFilterBar } from "../component/shared/DestinationPage";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import type { InsightsOverviewLoaderData } from "../app.insights.charts._index";

const RANGE_OPTIONS = [7, 14, 30] as const;
const Y_AXIS_RATIOS = [0, 0.5, 1] as const;
const LINE_COLORS = ["#005bd3", "#008060", "#c05717"] as const;

type MetricFormat = "number" | "money" | "percent" | "ratio";

type SummaryMetric = {
  label: string;
  value: string;
};

type ChartPoint = {
  label: string;
  value: number;
};

type ChartSeries = {
  label: string;
  color: string;
  points: ChartPoint[];
};

type ComparisonItem = {
  label: string;
  value: number;
};

type FunnelStep = {
  label: string;
  count: number;
  rateFromPrev: number | null;
};

type ObjectListRow = {
  label: string;
  value: string;
  detail?: string;
};

type ChartsLiveData = NonNullable<InsightsOverviewLoaderData["liveData"]>;
type DataDirection = "roi" | "acquisition" | "conversion" | "operations";

function resolveDataDirection(value: string | null): DataDirection {
  if (
    value === "roi" ||
    value === "acquisition" ||
    value === "conversion" ||
    value === "operations"
  ) {
    return value;
  }
  return "roi";
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const normalized = rawMax / magnitude;
  const rounded =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number | null | undefined, currencyCode: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const amount = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currencyCode ? `${currencyCode} ${amount}` : amount;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}x`;
}

function formatAxisValue(
  value: number,
  format: MetricFormat,
  currencyCode: string | null,
): string {
  if (format === "money") return formatMoney(value, currencyCode);
  if (format === "percent") return `${Math.round(value)}%`;
  if (format === "ratio") return `${value.toFixed(1)}x`;
  return value.toLocaleString("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  });
}

function formatPointValue(
  value: number,
  format: MetricFormat,
  currencyCode: string | null,
): string {
  if (format === "money") return formatMoney(value, currencyCode);
  if (format === "percent") return formatPercent(value);
  if (format === "ratio") return formatRatio(value);
  return formatInteger(value);
}

function formatDateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[2]}-${match[3]}`;
}

function calculateRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function isPaidChannel(label: string): boolean {
  return [
    "paid",
    "display",
    "cross-network",
    "affiliate",
    "shopping",
    "cpc",
    "ppc",
  ].some((keyword) => label.includes(keyword));
}

function isSearchChannel(label: string): boolean {
  return label.includes("organic search") || label === "search";
}

function buildTrafficBuckets(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
): ComparisonItem[] {
  const rows = liveData.ga4?.channelRows ?? [];
  let paid = 0;
  let search = 0;
  let organic = 0;

  for (const row of rows) {
    const normalized = row.key.trim().toLowerCase();
    if (isPaidChannel(normalized)) {
      paid += row.sessions;
      continue;
    }
    if (isSearchChannel(normalized)) {
      search += row.sessions;
      continue;
    }
    organic += row.sessions;
  }

  return [
    { label: t("insights.chartTrafficPaid"), value: paid },
    { label: t("insights.chartTrafficSearch"), value: search },
    { label: t("insights.chartTrafficOrganic"), value: organic },
  ];
}

function buildTopMetrics(
  liveData: ChartsLiveData,
  currencyCode: string | null,
  t: ReturnType<typeof useTranslation>["t"],
): SummaryMetric[] {
  const salesTrend = liveData.shopifyReports?.salesTrend ?? [];
  const storefrontFunnel = liveData.shopifyReports?.storefrontFunnel;
  const ga4Summary = liveData.ga4?.summary;
  const diagnosisMetrics = liveData.diagnosis?.summaryMetrics;

  const sessions =
    storefrontFunnel?.sessions ??
    ga4Summary?.totalSessions ??
    diagnosisMetrics?.sessions7d ??
    0;
  const revenue =
    salesTrend.length > 0
      ? sum(salesTrend.map((point) => point.sales))
      : ga4Summary?.totalRevenue ?? diagnosisMetrics?.salesAmount7d ?? 0;
  const orders =
    salesTrend.length > 0
      ? sum(salesTrend.map((point) => point.orders))
      : storefrontFunnel?.completedCheckout ??
        ga4Summary?.totalPurchases ??
        diagnosisMetrics?.orderCount7d ??
        0;
  const cvr =
    storefrontFunnel != null
      ? calculateRate(storefrontFunnel.completedCheckout, storefrontFunnel.sessions)
      : ga4Summary != null
        ? calculateRate(ga4Summary.totalPurchases, ga4Summary.totalSessions)
        : diagnosisMetrics?.conversionRate7d ?? null;
  const roas = liveData.ads?.totalRoas ?? null;

  return [
    { label: t("insights.chartMetricSessions"), value: formatInteger(sessions) },
    { label: t("insights.chartMetricRevenue"), value: formatMoney(revenue, currencyCode) },
    { label: t("insights.chartMetricOrders"), value: formatInteger(orders) },
    { label: t("insights.chartMetricCvr"), value: formatPercent(cvr) },
    { label: t("insights.chartMetricRoas"), value: formatRatio(roas) },
  ];
}

function buildRevenueSeries(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
): ChartSeries[] {
  const salesTrend = liveData.shopifyReports?.salesTrend ?? [];
  if (salesTrend.length > 0) {
    return [
      {
        label: t("insights.chartRevenueSeries"),
        color: LINE_COLORS[0],
        points: salesTrend.map((point) => ({
          label: formatDateLabel(point.date),
          value: point.sales,
        })),
      },
    ];
  }

  const ga4Series = liveData.ga4?.timeSeries ?? [];
  if (ga4Series.length > 0) {
    return [
      {
        label: t("insights.chartRevenueSeries"),
        color: LINE_COLORS[0],
        points: ga4Series.map((point) => ({
          label: formatDateLabel(point.key),
          value: point.revenue,
        })),
      },
    ];
  }

  return [];
}

function buildOrderAfterSalesSeries(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const salesTrend = liveData.shopifyReports?.salesTrend ?? [];
  const refundTrend = liveData.shopifyReports?.refundTrend ?? [];
  const ga4Series = liveData.ga4?.timeSeries ?? [];

  const orderCountSeries: ChartSeries[] =
    salesTrend.length > 0
      ? [
          {
            label: t("insights.chartOrdersCount"),
            color: LINE_COLORS[0],
            points: salesTrend.map((point) => ({
              label: formatDateLabel(point.date),
              value: point.orders,
            })),
          },
        ]
      : ga4Series.length > 0
        ? [
            {
              label: t("insights.chartOrdersCount"),
              color: LINE_COLORS[0],
              points: ga4Series.map((point) => ({
                label: formatDateLabel(point.key),
                value: point.purchases,
              })),
            },
          ]
        : [];

  const orderAmountSeries = buildRevenueSeries(liveData, t);

  const refundSeries: ChartSeries[] =
    refundTrend.length > 0
      ? [
          {
            label: t("insights.chartRefundQuantity"),
            color: LINE_COLORS[2],
            points: refundTrend.map((point) => ({
              label: formatDateLabel(point.date),
              value: point.returnedQuantity,
            })),
          },
        ]
      : [];

  return { orderCountSeries, orderAmountSeries, refundSeries };
}

function buildFulfillmentSeries(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
): ChartSeries[] {
  const fulfillmentTrend = liveData.shopifyReports?.fulfillmentTrend ?? [];
  return [
    {
      label: t("insights.chartFulfillmentFulfilled"),
      color: LINE_COLORS[1],
      points: fulfillmentTrend.map((point) => ({
        label: formatDateLabel(point.date),
        value: point.fulfilled,
      })),
    },
    {
      label: t("insights.chartFulfillmentShipped"),
      color: LINE_COLORS[0],
      points: fulfillmentTrend.map((point) => ({
        label: formatDateLabel(point.date),
        value: point.shipped,
      })),
    },
  ].filter((series) => series.points.length > 0);
}

function buildFunnelData(liveData: ChartsLiveData, rangeDays: number): FunnelStep[] {
  const storefrontFunnel = liveData.shopifyReports?.storefrontFunnel;
  const conversionMetrics = liveData.diagnosis?.items.find(
    (item) => item.key === "conversion_health",
  )?.metrics;
  const ga4Series = liveData.ga4?.timeSeries ?? [];
  const ga4Summary = liveData.ga4?.summary;
  const diagnosisMetrics = liveData.diagnosis?.summaryMetrics;

  const sessions =
    storefrontFunnel?.sessions ??
    ga4Summary?.totalSessions ??
    (rangeDays === 7 ? diagnosisMetrics?.sessions7d : null) ??
    0;
  const addToCart =
    storefrontFunnel?.cartAdditions ??
    sum(ga4Series.map((point) => point.itemsAddedToCart)) ??
    0;
  const reachedCheckout =
    storefrontFunnel?.reachedCheckout ??
    Number(conversionMetrics?.checkoutStarted7d ?? 0);
  const completedCheckout =
    storefrontFunnel?.completedCheckout ??
    Number(conversionMetrics?.checkoutCompleted7d ?? ga4Summary?.totalPurchases ?? 0);

  const steps = [
    { label: "visit", count: sessions },
    { label: "cart", count: addToCart },
    { label: "checkout", count: reachedCheckout },
    { label: "order", count: completedCheckout },
  ];

  return steps.map((step, index) => ({
    label: step.label,
    count: step.count,
    rateFromPrev:
      index === 0 ? null : calculateRate(step.count, Math.max(steps[index - 1]?.count ?? 0, 0)),
  }));
}

function buildAdsComparisons(liveData: ChartsLiveData) {
  const platforms = liveData.ads?.platformSummaries ?? [];
  const sorted = [...platforms].sort((left, right) => right.spend - left.spend);

  return {
    traffic: sorted.map((item) => ({
      label: item.accountName || item.platform,
      value: item.clicks,
    })),
    conversions: sorted.map((item) => ({
      label: item.accountName || item.platform,
      value: item.conversions,
    })),
    roi: sorted.map((item) => ({
      label: item.accountName || item.platform,
      value: item.roas ?? 0,
    })),
  };
}

function buildRoiPlatformRows(
  liveData: ChartsLiveData,
  currencyCode: string | null,
  t: ReturnType<typeof useTranslation>["t"],
): ObjectListRow[] {
  return [...(liveData.ads?.platformSummaries ?? [])]
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 5)
    .map((item) => ({
      label: item.accountName || item.platform,
      value: formatRatio(item.roas),
      detail: [
        `${t("insights.chartMetricSpend")}: ${formatMoney(item.spend, item.currencyCode ?? currencyCode)}`,
        `${t("insights.chartMetricConversions")}: ${formatInteger(item.conversions)}`,
      ].join(" · "),
    }));
}

function buildAcquisitionChannelRows(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
): ObjectListRow[] {
  return (liveData.ga4?.channelRows ?? []).slice(0, 5).map((row) => ({
    label: row.key,
    value: formatInteger(row.sessions),
    detail: [
      `${t("insights.chartMetricUsers")}: ${formatInteger(row.users)}`,
      `${t("insights.chartMetricPurchases")}: ${formatInteger(row.purchases)}`,
    ].join(" · "),
  }));
}

function buildLandingPageRows(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
): ObjectListRow[] {
  return (liveData.ga4?.landingRows ?? []).slice(0, 5).map((row) => ({
    label: row.key,
    value: formatPercent(calculateRate(row.purchases, row.sessions)),
    detail: [
      `${t("insights.chartMetricSessions")}: ${formatInteger(row.sessions)}`,
      `${t("insights.chartMetricPurchases")}: ${formatInteger(row.purchases)}`,
    ].join(" · "),
  }));
}

function buildRefundSpikeRows(
  refundSeries: ChartSeries[],
  t: ReturnType<typeof useTranslation>["t"],
): ObjectListRow[] {
  const points = refundSeries[0]?.points ?? [];
  return [...points]
    .sort((left, right) => right.value - left.value)
    .slice(0, 5)
    .map((point) => ({
      label: point.label,
      value: formatInteger(point.value),
      detail: t("insights.chartRefundSpikeDetail"),
    }));
}

function buildFulfillmentGapRows(
  liveData: ChartsLiveData,
  t: ReturnType<typeof useTranslation>["t"],
): ObjectListRow[] {
  const rows = liveData.shopifyReports?.fulfillmentTrend ?? [];
  return [...rows]
    .map((row) => ({
      date: formatDateLabel(row.date),
      gap: Math.max(row.shipped - row.fulfilled, 0),
      fulfilled: row.fulfilled,
      shipped: row.shipped,
    }))
    .sort((left, right) => right.gap - left.gap)
    .slice(0, 5)
    .map((row) => ({
      label: row.date,
      value: formatInteger(row.gap),
      detail: [
        `${t("insights.chartFulfillmentShipped")}: ${formatInteger(row.shipped)}`,
        `${t("insights.chartFulfillmentFulfilled")}: ${formatInteger(row.fulfilled)}`,
      ].join(" · "),
    }));
}

function hasSeriesData(series: ChartSeries[]): boolean {
  return series.some((item) => item.points.some((point) => point.value > 0));
}

function hasComparisonData(items: ComparisonItem[]): boolean {
  return items.some((item) => item.value > 0);
}

function MetricTile({ label, value }: SummaryMetric) {
  return (
    <div style={pageMetricCardStyle}>
      <div style={pageMetricTileStyle}>
        <p style={pageMetricLabelStyle}>{label}</p>
        <p style={pageMetricValueStyle}>{value}</p>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div style={chartEmptyStyle}>{label}</div>;
}

function LineChart({
  series,
  format,
  currencyCode,
}: {
  series: ChartSeries[];
  format: MetricFormat;
  currencyCode: string | null;
}) {
  const points = series[0]?.points ?? [];
  if (!hasSeriesData(series) || points.length === 0) {
    return <EmptyChart label="—" />;
  }

  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = niceMax(
    Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value))),
  );
  const getX = (index: number) =>
    padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const getY = (value: number) => padding.top + innerHeight - (value / maxValue) * innerHeight;
  const xLabelIndices =
    points.length <= 6
      ? points.map((_, index) => index)
      : [0, ...Array.from({ length: 4 }, (_, index) => Math.round(((index + 1) / 5) * (points.length - 1))), points.length - 1];

  return (
    <div style={chartFrameStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img">
        {Y_AXIS_RATIOS.map((ratio) => {
          const y = padding.top + innerHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke={pageColorTokens.borderSubtle}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill={pageColorTokens.textSecondary}
              >
                {formatAxisValue(maxValue * ratio, format, currencyCode)}
              </text>
            </g>
          );
        })}
        {series.map((item) => {
          const path = item.points
            .map((point, index) => {
              const command = index === 0 ? "M" : "L";
              return `${command} ${getX(index).toFixed(1)} ${getY(point.value).toFixed(1)}`;
            })
            .join(" ");

          return (
            <g key={item.label}>
              <path
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {item.points.map((point, index) => (
                <circle
                  key={`${item.label}-${point.label}`}
                  cx={getX(index)}
                  cy={getY(point.value)}
                  r={3.5}
                  fill={item.color}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          );
        })}
        {xLabelIndices.map((index) => (
          <text
            key={`${points[index]?.label ?? index}-${index}`}
            x={getX(index)}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill={pageColorTokens.textSecondary}
          >
            {points[index]?.label}
          </text>
        ))}
      </svg>
      <div style={legendStyle}>
        {series.map((item) => (
          <span key={item.label} style={legendItemStyle}>
            <span style={{ ...legendDotStyle, background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function VerticalBarChart({
  items,
  format,
  currencyCode,
}: {
  items: ComparisonItem[];
  format: MetricFormat;
  currencyCode: string | null;
}) {
  if (!hasComparisonData(items)) {
    return <EmptyChart label="—" />;
  }

  const maxValue = niceMax(Math.max(...items.map((item) => item.value), 0));

  return (
    <div style={barGroupStyle}>
      {items.map((item, index) => {
        const heightRatio = item.value > 0 ? Math.max(0.08, item.value / maxValue) : 0;
        return (
          <div key={item.label} style={barColumnStyle}>
            <div style={barTrackStyle}>
              <div
                style={{
                  ...barFillStyle,
                  height: `${heightRatio * 100}%`,
                  background: LINE_COLORS[index % LINE_COLORS.length],
                }}
              />
            </div>
            <div style={barValueStyle}>{formatPointValue(item.value, format, currencyCode)}</div>
            <div style={barLabelStyle}>{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBarChart({
  items,
  format,
  currencyCode,
}: {
  items: ComparisonItem[];
  format: MetricFormat;
  currencyCode: string | null;
}) {
  if (!hasComparisonData(items)) {
    return <EmptyChart label="—" />;
  }

  const maxValue = Math.max(...items.map((item) => item.value), 0);

  return (
    <div style={horizontalListStyle}>
      {items.map((item, index) => {
        const width = maxValue > 0 ? Math.max(0.08, item.value / maxValue) : 0;
        return (
          <div key={item.label} style={horizontalRowStyle}>
            <div style={horizontalRowHeaderStyle}>
              <span style={horizontalLabelStyle}>{item.label}</span>
              <span style={horizontalValueStyle}>
                {formatPointValue(item.value, format, currencyCode)}
              </span>
            </div>
            <div style={horizontalTrackStyle}>
              <div
                style={{
                  ...horizontalFillStyle,
                  width: `${width * 100}%`,
                  background: LINE_COLORS[index % LINE_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FunnelChart({
  steps,
  t,
}: {
  steps: FunnelStep[];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (!steps.some((step) => step.count > 0)) {
    return <EmptyChart label="—" />;
  }

  const labelMap: Record<string, string> = {
    visit: t("insights.chartFunnelVisit"),
    cart: t("insights.chartFunnelAddToCart"),
    checkout: t("insights.chartFunnelCheckout"),
    order: t("insights.chartFunnelOrder"),
  };
  const maxCount = Math.max(...steps.map((step) => step.count), 1);

  return (
    <div style={funnelStyle}>
      {steps.map((step, index) => {
        const width = Math.max(0.2, step.count / maxCount);
        return (
          <div key={step.label} style={funnelRowStyle}>
            <div style={funnelHeaderStyle}>
              <span style={funnelLabelStyle}>{labelMap[step.label] ?? step.label}</span>
              <span style={funnelValueStyle}>{formatInteger(step.count)}</span>
            </div>
            <div style={funnelTrackStyle}>
              <div
                style={{
                  ...funnelFillStyle,
                  width: `${width * 100}%`,
                  opacity: 1 - index * 0.12,
                }}
              />
            </div>
            <div style={funnelRateStyle}>
              {step.rateFromPrev == null ? "—" : formatPercent(step.rateFromPrev)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompactMetricGrid({
  metrics,
}: {
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <div style={compactMetricGridStyle}>
      {metrics.map((metric) => (
        <div key={metric.label} style={compactMetricCardStyle}>
          <span style={compactMetricLabelStyle}>{metric.label}</span>
          <strong style={compactMetricValueStyle}>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ObjectList({
  title,
  valueLabel,
  rows,
}: {
  title: string;
  valueLabel: string;
  rows: ObjectListRow[];
}) {
  return (
    <div style={objectListCardStyle}>
      <div style={objectListHeaderStyle}>
        <span style={objectListTitleStyle}>{title}</span>
        <span style={objectListValueLabelStyle}>{valueLabel}</span>
      </div>
      {rows.length > 0 ? (
        <div style={objectListStyle}>
          {rows.map((row) => (
            <div key={`${row.label}-${row.value}`} style={objectRowStyle}>
              <div style={objectRowMainStyle}>
                <span style={objectRowLabelStyle}>{row.label}</span>
                {row.detail ? <span style={objectRowDetailStyle}>{row.detail}</span> : null}
              </div>
              <strong style={objectRowValueStyle}>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <EmptyChart label="—" />
      )}
    </div>
  );
}

export function InsightsChartsOverviewPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const { liveData, failed } = useLoaderData<InsightsOverviewLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();

  const rangeDaysParam = searchParams.get("range");
  const rangeDays =
    rangeDaysParam === "30" ? 30 : rangeDaysParam === "14" ? 14 : 7;
  const windowRange = useMemo(() => resolveDateWindow(rangeDays), [rangeDays]);
  const activeDirection = resolveDataDirection(searchParams.get("group"));
  const refreshing = revalidator.state !== "idle";

  const currencyCode =
    liveData?.shopifyReports?.currencyCode ??
    liveData?.ads?.currencyCode ??
    liveData?.diagnosis?.summaryMetrics.currency ??
    null;

  const topMetrics = useMemo(
    () => (liveData ? buildTopMetrics(liveData, currencyCode, t) : []),
    [currencyCode, liveData, t],
  );
  const trafficBuckets = useMemo(
    () => (liveData ? buildTrafficBuckets(liveData, t) : []),
    [liveData, t],
  );
  const revenueSeries = useMemo(
    () => (liveData ? buildRevenueSeries(liveData, t) : []),
    [liveData, t],
  );
  const { orderCountSeries, orderAmountSeries, refundSeries } = useMemo(
    () =>
      liveData
        ? buildOrderAfterSalesSeries(liveData, t)
        : { orderCountSeries: [], orderAmountSeries: [], refundSeries: [] },
    [liveData, t],
  );
  const fulfillmentSeries = useMemo(
    () => (liveData ? buildFulfillmentSeries(liveData, t) : []),
    [liveData, t],
  );
  const funnelSteps = useMemo(
    () => (liveData ? buildFunnelData(liveData, rangeDays) : []),
    [liveData, rangeDays],
  );
  const adsComparisons = useMemo(
    () =>
      liveData
        ? buildAdsComparisons(liveData)
        : { traffic: [], conversions: [], roi: [] },
    [liveData],
  );

  const storefrontFunnel = liveData?.shopifyReports?.storefrontFunnel ?? null;
  const fulfillmentMetrics = liveData?.diagnosis?.summaryMetrics ?? null;
  const roiPlatformRows = useMemo(
    () => (liveData ? buildRoiPlatformRows(liveData, currencyCode, t) : []),
    [currencyCode, liveData, t],
  );
  const acquisitionChannelRows = useMemo(
    () => (liveData ? buildAcquisitionChannelRows(liveData, t) : []),
    [liveData, t],
  );
  const landingPageRows = useMemo(
    () => (liveData ? buildLandingPageRows(liveData, t) : []),
    [liveData, t],
  );
  const refundSpikeRows = useMemo(() => buildRefundSpikeRows(refundSeries, t), [refundSeries, t]);
  const fulfillmentGapRows = useMemo(
    () => (liveData ? buildFulfillmentGapRows(liveData, t) : []),
    [liveData, t],
  );
  const directionItems = useMemo(
    () => [
      { key: "roi" as const, label: t("insights.chartGroupRoiTitle") },
      { key: "acquisition" as const, label: t("insights.chartGroupAcquisitionTitle") },
      { key: "conversion" as const, label: t("insights.chartGroupConversionTitle") },
      {
        key: "operations" as const,
        label: t("insights.chartGroupMerchandisingOpsTitle"),
      },
    ],
    [t],
  );
  const directionSummary = useMemo(() => {
    switch (activeDirection) {
      case "roi":
        return {
          title: t("insights.chartGroupRoiTitle"),
          summary: t("insights.chartGroupRoiSummary"),
          metrics: [
            topMetrics[1],
            topMetrics[4],
            topMetrics[2],
          ].filter(Boolean),
        };
      case "acquisition":
        return {
          title: t("insights.chartGroupAcquisitionTitle"),
          summary: t("insights.chartGroupAcquisitionSummary"),
          metrics: [
            topMetrics[0],
            {
              label: t("insights.chartTrafficTopSource"),
              value: liveData?.ga4?.channelRows?.[0]?.key ?? "—",
            },
            {
              label: t("insights.chartTrafficPaid"),
              value: formatInteger(
                trafficBuckets.find(
                  (item) => item.label === t("insights.chartTrafficPaid"),
                )?.value,
              ),
            },
          ],
        };
      case "conversion":
        return {
          title: t("insights.chartGroupConversionTitle"),
          summary: t("insights.chartGroupConversionSummary"),
          metrics: [
            topMetrics[3],
            {
              label: t("insights.chartFunnelCartConversion"),
              value: formatPercent(
                storefrontFunnel
                  ? calculateRate(storefrontFunnel.cartAdditions, storefrontFunnel.sessions)
                  : calculateRate(funnelSteps[1]?.count ?? 0, funnelSteps[0]?.count ?? 0),
              ),
            },
            {
              label: t("insights.chartFunnelOrderConversion"),
              value: formatPercent(
                storefrontFunnel
                  ? calculateRate(
                      storefrontFunnel.completedCheckout,
                      storefrontFunnel.reachedCheckout,
                    )
                  : calculateRate(funnelSteps[3]?.count ?? 0, funnelSteps[2]?.count ?? 0),
              ),
            },
          ],
        };
      case "operations":
      default:
        return {
          title: t("insights.chartGroupMerchandisingOpsTitle"),
          summary: t("insights.chartGroupMerchandisingOpsSummary"),
          metrics: [
            topMetrics[2],
            {
              label: t("insights.chartRefundQuantity"),
              value: formatInteger(
                refundSeries.reduce(
                  (total, series) =>
                    total + series.points.reduce((sum, point) => sum + point.value, 0),
                  0,
                ),
              ),
            },
            {
              label: t("insights.chartFulfillmentOverdue"),
              value: formatInteger(fulfillmentMetrics?.overdueOrderCount),
            },
          ],
        };
    }
  }, [
    activeDirection,
    fulfillmentMetrics?.overdueOrderCount,
    funnelSteps,
    liveData?.ga4?.channelRows,
    refundSeries,
    storefrontFunnel,
    t,
    topMetrics,
    trafficBuckets,
  ]);
  const hasAnyData = Boolean(
    hasComparisonData(trafficBuckets) ||
      hasSeriesData(revenueSeries) ||
      hasSeriesData(orderCountSeries) ||
      hasSeriesData(refundSeries) ||
      hasSeriesData(fulfillmentSeries) ||
      funnelSteps.some((step) => step.count > 0) ||
      hasComparisonData(adsComparisons.traffic) ||
      hasComparisonData(adsComparisons.conversions) ||
      hasComparisonData(adsComparisons.roi),
  );

  const handleRangeChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", next);
    setSearchParams(params, { preventScrollReset: true });
  };
  const handleDirectionChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("group", next);
    setSearchParams(params, { preventScrollReset: true });
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : analysisPageContentStyle}>
      <PageHeaderNav
        titleBarTitle={t("nav.insights")}
        title={t("insights.chartsTitle")}
        subtitle={t("insights.chartCenterPageSubtitle")}
        backLabel={t("insights.backToToday")}
        fallbackPath="/app/today"
      />

      <div style={toolbarStyle(isMobile)}>
        <DestinationFilterBar
          label={t("insights.rangeLabel")}
          items={RANGE_OPTIONS.map((days) => ({
            key: String(days),
            label: t("insights.rangeDays", { count: days }),
          }))}
          active={String(rangeDays)}
          onChange={handleRangeChange}
        />
        <div style={toolbarSideStyle}>
          <span style={pageHintTextStyle}>
            {t("insights.windowHint", {
              start: windowRange.dateStart,
              end: windowRange.dateEnd,
            })}
          </span>
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

      <SegmentedPageTabs
        activeTab={activeDirection}
        items={directionItems}
        ariaLabel={t("insights.chartsTitle")}
        density="compact"
        onTabChange={handleDirectionChange}
      />

      {failed ? <div style={errorBoxStyle}>{t("insights.loadFailed")}</div> : null}

      {!hasAnyData ? (
        <div style={pageEmptyStateStyle}>
          <strong style={{ fontSize: "1rem", color: pageColorTokens.textPrimary }}>
            {t("insights.chartCenterEmptyTitle")}
          </strong>
          <span>{t("insights.chartCenterEmptyBody")}</span>
        </div>
      ) : (
        <>
          <PageSurface
            title={directionSummary.title}
            subtitle={directionSummary.summary}
          >
            <div style={summaryGridStyle(isMobile)}>
              {directionSummary.metrics.map((metric) => (
                <MetricTile key={metric.label} {...metric} />
              ))}
            </div>
          </PageSurface>

          {activeDirection === "acquisition" ? (
            <PageSurface title={t("insights.chartCenterTrafficTitle")}>
              <div style={sectionStackStyle}>
                <VerticalBarChart
                  items={trafficBuckets}
                  format="number"
                  currencyCode={currencyCode}
                />
                <CompactMetricGrid
                  metrics={[
                    {
                      label: t("insights.chartTrafficSessions"),
                      value:
                        liveData?.ga4?.summary?.totalSessions != null
                          ? formatInteger(liveData.ga4.summary.totalSessions)
                          : "—",
                    },
                    {
                      label: t("insights.chartTrafficTopSource"),
                      value: liveData?.ga4?.channelRows?.[0]?.key ?? "—",
                    },
                    {
                      label: t("insights.chartTrafficTopLanding"),
                      value: liveData?.ga4?.landingRows?.[0]?.key ?? "—",
                    },
                  ]}
                />
                <div style={objectGridStyle(isMobile)}>
                  <ObjectList
                    title={t("insights.chartTopChannelsTitle")}
                    valueLabel={t("insights.chartMetricSessions")}
                    rows={acquisitionChannelRows}
                  />
                  <ObjectList
                    title={t("insights.chartTopLandingPagesTitle")}
                    valueLabel={t("insights.chartMetricCvr")}
                    rows={landingPageRows}
                  />
                </div>
              </div>
            </PageSurface>
          ) : null}

          {activeDirection === "roi" ? (
            <>
              <PageSurface title={t("insights.chartCenterRevenueTitle")}>
                <LineChart
                  series={revenueSeries}
                  format="money"
                  currencyCode={currencyCode}
                />
              </PageSurface>

              <PageSurface title={t("insights.chartCenterAdsTitle")}>
                <div style={subChartGridStyle(isMobile)}>
                  <div style={subChartCardStyle}>
                    <div style={subChartTitleStyle}>{t("insights.chartAdsTraffic")}</div>
                    <HorizontalBarChart
                      items={adsComparisons.traffic}
                      format="number"
                      currencyCode={currencyCode}
                    />
                  </div>
                  <div style={subChartCardStyle}>
                    <div style={subChartTitleStyle}>{t("insights.chartAdsConversions")}</div>
                    <HorizontalBarChart
                      items={adsComparisons.conversions}
                      format="number"
                      currencyCode={currencyCode}
                    />
                  </div>
                  <div style={subChartCardStyle}>
                    <div style={subChartTitleStyle}>{t("insights.chartAdsRoi")}</div>
                    <HorizontalBarChart
                      items={adsComparisons.roi}
                      format="ratio"
                      currencyCode={currencyCode}
                    />
                  </div>
                </div>
              </PageSurface>

              <PageSurface title={t("insights.chartTopPlatformsTitle")}>
                <ObjectList
                  title={t("insights.chartTopPlatformsTitle")}
                  valueLabel={t("insights.chartMetricRoas")}
                  rows={roiPlatformRows}
                />
              </PageSurface>
            </>
          ) : null}

          {activeDirection === "conversion" ? (
            <PageSurface title={t("insights.chartCenterFunnelTitle")}>
              <div style={sectionStackStyle}>
                <CompactMetricGrid
                  metrics={[
                    {
                      label: t("insights.chartFunnelClickConversion"),
                      value: formatPercent(
                        storefrontFunnel
                          ? calculateRate(
                              storefrontFunnel.completedCheckout,
                              storefrontFunnel.sessions,
                            )
                          : calculateRate(
                              funnelSteps[3]?.count ?? 0,
                              funnelSteps[0]?.count ?? 0,
                            ),
                      ),
                    },
                    {
                      label: t("insights.chartFunnelCartConversion"),
                      value: formatPercent(
                        storefrontFunnel
                          ? calculateRate(
                              storefrontFunnel.cartAdditions,
                              storefrontFunnel.sessions,
                            )
                          : calculateRate(
                              funnelSteps[1]?.count ?? 0,
                              funnelSteps[0]?.count ?? 0,
                            ),
                      ),
                    },
                    {
                      label: t("insights.chartFunnelOrderConversion"),
                      value: formatPercent(
                        storefrontFunnel
                          ? calculateRate(
                              storefrontFunnel.completedCheckout,
                              storefrontFunnel.reachedCheckout,
                            )
                          : calculateRate(
                              funnelSteps[3]?.count ?? 0,
                              funnelSteps[2]?.count ?? 0,
                            ),
                      ),
                    },
                  ]}
                />
                <FunnelChart steps={funnelSteps} t={t} />
                <ObjectList
                  title={t("insights.chartTopLandingPagesTitle")}
                  valueLabel={t("insights.chartMetricCvr")}
                  rows={landingPageRows}
                />
              </div>
            </PageSurface>
          ) : null}

          {activeDirection === "operations" ? (
            <>
              <PageSurface title={t("insights.chartCenterOrderAfterSalesTitle")}>
                <div style={subChartGridStyle(isMobile)}>
                  <div style={subChartCardStyle}>
                    <div style={subChartTitleStyle}>{t("insights.chartOrdersCount")}</div>
                    <LineChart
                      series={orderCountSeries}
                      format="number"
                      currencyCode={currencyCode}
                    />
                  </div>
                  <div style={subChartCardStyle}>
                    <div style={subChartTitleStyle}>{t("insights.chartOrdersAmount")}</div>
                    <LineChart
                      series={orderAmountSeries}
                      format="money"
                      currencyCode={currencyCode}
                    />
                  </div>
                  <div style={subChartCardStyle}>
                    <div style={subChartTitleStyle}>{t("insights.chartRefundQuantity")}</div>
                    <LineChart
                      series={refundSeries}
                      format="number"
                      currencyCode={currencyCode}
                    />
                  </div>
                </div>
              </PageSurface>

              <PageSurface title={t("insights.chartCenterFulfillmentTitle")}>
                <div style={sectionStackStyle}>
                  <CompactMetricGrid
                    metrics={[
                      {
                        label: t("insights.chartFulfillmentOverdue"),
                        value: formatInteger(fulfillmentMetrics?.overdueOrderCount),
                      },
                      {
                        label: t("insights.chartFulfillmentCarrierIssues"),
                        value: formatInteger(fulfillmentMetrics?.carrierIssueCount),
                      },
                    ]}
                  />
                  <LineChart
                    series={fulfillmentSeries}
                    format="number"
                    currencyCode={currencyCode}
                  />
                  <div style={objectGridStyle(isMobile)}>
                    <ObjectList
                      title={t("insights.chartRefundSpikeTitle")}
                      valueLabel={t("insights.chartRefundQuantity")}
                      rows={refundSpikeRows}
                    />
                    <ObjectList
                      title={t("insights.chartFulfillmentGapTitle")}
                      valueLabel={t("insights.chartFulfillmentGapMetric")}
                      rows={fulfillmentGapRows}
                    />
                  </div>
                </div>
              </PageSurface>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

const toolbarStyle = (isMobile: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  justifyContent: "space-between",
  alignItems: isMobile ? "stretch" : "flex-end",
  gap: "0.75rem",
});

const toolbarSideStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  flexWrap: "wrap",
};

const summaryGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
  gap: "0.75rem",
});

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const subChartGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.85rem",
});

const objectGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
  gap: "0.85rem",
});

const subChartCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 14,
  background: pageColorTokens.surfaceMuted,
  padding: "0.85rem",
  display: "grid",
  gap: "0.75rem",
};

const subChartTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const chartFrameStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const chartEmptyStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minHeight: 180,
  borderRadius: 14,
  border: `1px dashed ${pageColorTokens.borderInput}`,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceMuted,
};

const legendStyle: CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  flexWrap: "wrap",
  fontSize: 12,
  color: pageColorTokens.textSecondary,
};

const legendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const legendDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
};

const barGroupStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "0.85rem",
  alignItems: "end",
  minHeight: 260,
};

const barColumnStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  justifyItems: "center",
};

const barTrackStyle: CSSProperties = {
  width: "100%",
  minHeight: 180,
  borderRadius: 14,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "flex",
  alignItems: "flex-end",
  padding: "0.6rem",
};

const barFillStyle: CSSProperties = {
  width: "100%",
  borderRadius: 10,
  minHeight: 12,
};

const barValueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const barLabelStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textBody,
  textAlign: "center",
};

const horizontalListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const horizontalRowStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const horizontalRowHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const horizontalLabelStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textBody,
};

const horizontalValueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const horizontalTrackStyle: CSSProperties = {
  width: "100%",
  height: 10,
  borderRadius: 999,
  background: pageColorTokens.divider,
  overflow: "hidden",
};

const horizontalFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
};

const funnelStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const funnelRowStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const funnelHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const funnelLabelStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textBody,
};

const funnelValueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const funnelTrackStyle: CSSProperties = {
  width: "100%",
  height: 18,
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  overflow: "hidden",
};

const funnelFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #2952d8 0%, #4070f4 100%)",
};

const funnelRateStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textSecondary,
};

const compactMetricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.75rem",
};

const compactMetricCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 12,
  background: pageColorTokens.surfaceMuted,
  padding: "0.75rem",
  display: "grid",
  gap: "0.25rem",
};

const compactMetricLabelStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textSecondary,
};

const compactMetricValueStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.2,
  color: pageColorTokens.textPrimary,
};

const objectListCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 14,
  background: pageColorTokens.surfaceMuted,
  padding: "0.85rem",
  display: "grid",
  gap: "0.75rem",
};

const objectListHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
};

const objectListTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const objectListValueLabelStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textSecondary,
};

const objectListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const objectRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.75rem",
  paddingBottom: "0.65rem",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
};

const objectRowMainStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  minWidth: 0,
};

const objectRowLabelStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  wordBreak: "break-word",
};

const objectRowDetailStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textSecondary,
  wordBreak: "break-word",
};

const objectRowValueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  whiteSpace: "nowrap",
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

const errorBoxStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "1px solid rgba(220, 38, 38, 0.2)",
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  fontSize: 13,
};
