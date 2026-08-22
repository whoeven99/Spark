import prisma from "../../db.server";
import { TODAY_ALL_COUNTRIES } from "../../lib/todayGeo.shared";
import type {
  TodayBusinessModuleKey,
  TodayMetricAction,
  TodayMetricDetail,
  TodayOverviewModule,
  TodayRoiFactor,
  TodayRoiMetric,
  TodayMetricStatus,
  TodayMetricTable,
} from "../../lib/todayMetricModules";
import {
  getTodayMetricDetail,
  getTodayOverviewModules,
  getTodayRoiMonitor,
} from "../../lib/todayMetricModules";
import type {
  TodayDecisionReport,
  TodayDecisionReportKey,
  TodayEvidenceGroup,
  TodayHeader,
  TodayMetricCard,
  TodayMetricStatus as TodayReportStatus,
  TodayObjectCard,
  TodayOverviewReport,
  TodayReasonCard,
  TodayRoiSummary,
  TodaySummaryMetric,
} from "../../lib/todayReportTypes";
import { readNumericCell } from "../../lib/shopifyReports";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { executeShopifyqlQuery } from "../shopifyql/shopifyqlQuery.server";
import { computeChannelRoi } from "./channelRoi.server";
import { getShopCostConfig } from "./roi/costConfig.server";
import { loadSkuCostMap } from "./roi/skuCostSync.server";

type TodayCountryKey = string;

export type TodayCountryOption = {
  key: TodayCountryKey;
  label: string;
  orderCount: number;
  sessions: number | null;
};

export type TodayFilterState = {
  selectedCountry: TodayCountryKey;
  selectedCountryLabel: string;
  countries: TodayCountryOption[];
  dataNotes: string[];
};

export type TodayOverviewData = {
  filters: TodayFilterState;
  roiMonitor: {
    metrics: TodayRoiMetric[];
    factors: TodayRoiFactor[];
    chartPath: string;
    reportPath: string;
  };
  modules: TodayOverviewModule[];
};

export type TodayDetailData = {
  filters: TodayFilterState;
  detail: TodayMetricDetail;
};

export type TodayOverviewReportData = {
  filters: TodayFilterState;
  report: TodayOverviewReport;
};

export type TodayDecisionReportData = {
  filters: TodayFilterState;
  report: TodayDecisionReport;
};

type OrderFact = {
  shopifyOrderId: string;
  createdAt: Date;
  totalPrice: number;
  subtotalPrice: number;
  totalDiscounts: number;
  sourceName: string | null;
  referringSite: string | null;
  utmSource: string | null;
  isFirstOrder: boolean;
  currency: string;
  shippingCountryCode: string | null;
  billingCountryCode: string | null;
};

type SessionScopeData = {
  summary: {
    sessions: number;
    pageviews: number;
    conversionRate: number;
    sessionsWithCartAdditions: number;
    sessionsThatReachedCheckout: number;
    sessionsThatCompletedCheckout: number;
  };
  trend: Array<{
    day: string;
    sessions: number;
    pageviews: number;
    conversionRate: number;
    sessionsWithCartAdditions: number;
    sessionsThatReachedCheckout: number;
    sessionsThatCompletedCheckout: number;
  }>;
  referrers: Array<{
    referrer: string;
    sessions: number;
    conversionRate: number;
  }>;
};

type DayBucket = {
  day: string;
  orders: number;
  revenue: number;
  subtotal: number;
  discounts: number;
  paymentFees: number;
  firstOrders: number;
  refundLoss: number;
};

type OrderScopeData = {
  currency: string;
  defaultGrossMarginPercent: number;
  sevenDayBuckets: DayBucket[];
  baselineBuckets: DayBucket[];
  sevenDayTotals: DayBucket;
  baselineTotals: DayBucket;
  channelRows: Array<{
    channel: string;
    orders: number;
    revenue: number;
    discounts: number;
    refundLoss: number;
    firstOrderShare: number;
    estimatedReturnMultiple: number | null;
  }>;
};

const ORDER_LOOKBACK_DAYS = 37;
const COUNTRY_OPTION_WINDOW_DAYS = 90;

function buildFallbackFilters(
  requestedCountry: string | null | undefined,
  dataNotes: string[],
): TodayFilterState {
  const filters = buildCountryOptions(
    normalizeCountryKey(requestedCountry) ?? requestedCountry ?? null,
    new Map(),
    new Map(),
  );
  filters.dataNotes.push(...dataNotes);
  return filters;
}

function buildFallbackDetail(
  metric: TodayBusinessModuleKey,
  requestedCountry: string | null | undefined,
  note: string,
): TodayDetailData {
  return {
    filters: buildFallbackFilters(requestedCountry, [note]),
    detail: getTodayMetricDetail(metric),
  };
}

const COUNTRY_DISPLAY_NAMES = new Intl.DisplayNames(["zh-CN"], { type: "region" });

const REFERRER_CHANNELS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /google\./i, key: "Google" },
  { pattern: /facebook\.|fb\.com/i, key: "Facebook" },
  { pattern: /instagram\./i, key: "Instagram" },
  { pattern: /tiktok\./i, key: "TikTok" },
  { pattern: /bing\./i, key: "Bing" },
  { pattern: /youtube\./i, key: "YouTube" },
  { pattern: /pinterest\./i, key: "Pinterest" },
  { pattern: /twitter\.|x\.com/i, key: "X" },
];

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shortDay(dateOrKey: Date | string): string {
  const date = typeof dateOrKey === "string" ? new Date(`${dateOrKey}T00:00:00.000Z`) : dateOrKey;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", timeZone: "UTC" }).format(date);
}

function regionLabel(code: string): string {
  return `${COUNTRY_DISPLAY_NAMES.of(code) ?? code} (${code})`;
}

function normalizeCountryKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function resolveOrderCountry(order: Pick<OrderFact, "shippingCountryCode" | "billingCountryCode">): string | null {
  return normalizeCountryKey(order.shippingCountryCode) ?? normalizeCountryKey(order.billingCountryCode);
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("zh-CN");
}

function formatCurrency(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString("zh-CN")}`;
  }
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

function formatPercentPoints(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}pp`;
}

function formatDeltaPercent(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta * 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function formatMultiple(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}x`;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function sumBuckets(buckets: DayBucket[]): DayBucket {
  return buckets.reduce<DayBucket>(
    (acc, bucket) => ({
      day: bucket.day,
      orders: acc.orders + bucket.orders,
      revenue: acc.revenue + bucket.revenue,
      subtotal: acc.subtotal + bucket.subtotal,
      discounts: acc.discounts + bucket.discounts,
      paymentFees: acc.paymentFees + bucket.paymentFees,
      firstOrders: acc.firstOrders + bucket.firstOrders,
      refundLoss: acc.refundLoss + bucket.refundLoss,
    }),
    {
      day: "",
      orders: 0,
      revenue: 0,
      subtotal: 0,
      discounts: 0,
      paymentFees: 0,
      firstOrders: 0,
      refundLoss: 0,
    },
  );
}

function estimatedReturnMultiple(bucket: Pick<DayBucket, "revenue" | "subtotal" | "discounts" | "paymentFees" | "refundLoss">, defaultMarginPercent: number): number | null {
  const margin = Math.max(0, Math.min(100, defaultMarginPercent)) / 100;
  const estimatedCogs = bucket.subtotal * (1 - margin);
  const estimatedCost = estimatedCogs + bucket.discounts + bucket.paymentFees + bucket.refundLoss;
  if (estimatedCost <= 0) return null;
  return bucket.revenue / estimatedCost;
}

function classifyChannel(order: Pick<OrderFact, "utmSource" | "sourceName" | "referringSite">): string {
  const utm = order.utmSource?.trim().toLowerCase();
  if (utm) return utm;
  const referrer = order.referringSite?.trim();
  if (referrer) {
    for (const { pattern, key } of REFERRER_CHANNELS) {
      if (pattern.test(referrer)) return key;
    }
    return "引荐流量";
  }
  const source = order.sourceName?.trim().toLowerCase();
  if (source && source !== "web") return source;
  return "直接访问";
}

function toneFromDelta(delta: number, warning = -0.05, critical = -0.15): "positive" | "warning" | "critical" {
  if (delta <= critical) return "critical";
  if (delta <= warning) return "warning";
  return "positive";
}

function statusFromRatio(value: number, watch: number, risk: number): TodayMetricStatus["status"] {
  if (value <= risk) return "risk";
  if (value <= watch) return "watch";
  return "healthy";
}

async function loadOrderFacts(shop: string, now: Date): Promise<OrderFact[]> {
  const todayStart = startOfUtcDay(now);
  const since = addDays(todayStart, -ORDER_LOOKBACK_DAYS);
  return prisma.shopOrder.findMany({
    where: {
      shop,
      status: { not: "cancelled" },
      createdAt: { gte: since, lt: todayStart },
    },
    select: {
      shopifyOrderId: true,
      createdAt: true,
      totalPrice: true,
      subtotalPrice: true,
      totalDiscounts: true,
      sourceName: true,
      referringSite: true,
      utmSource: true,
      isFirstOrder: true,
      currency: true,
      shippingCountryCode: true,
      billingCountryCode: true,
    },
  });
}

async function loadOrderCountryCounts(shop: string, now: Date): Promise<Map<string, number>> {
  const todayStart = startOfUtcDay(now);
  const since = addDays(todayStart, -COUNTRY_OPTION_WINDOW_DAYS);
  const rows = await prisma.shopOrder.findMany({
    where: {
      shop,
      status: { not: "cancelled" },
      createdAt: { gte: since, lt: todayStart },
    },
    select: {
      shippingCountryCode: true,
      billingCountryCode: true,
    },
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeCountryKey(row.shippingCountryCode) ?? normalizeCountryKey(row.billingCountryCode);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function loadSessionCountryCounts(admin: ShopifyAdminGraphqlClient): Promise<Map<string, number>> {
  const query =
    "FROM sessions SHOW sessions WHERE session_country_code IS NOT NULL SINCE -30d UNTIL today GROUP BY session_country_code ORDER BY sessions DESC LIMIT 20";
  const result = await executeShopifyqlQuery(admin, query);
  if (!result.ok) return new Map();
  const counts = new Map<string, number>();
  for (const row of result.rows) {
    const key = normalizeCountryKey(String(row.session_country_code ?? ""));
    if (!key) continue;
    counts.set(key, Number(readNumericCell(row, "sessions") ?? 0));
  }
  return counts;
}

async function loadSessionScope(
  admin: ShopifyAdminGraphqlClient,
  country: string | null,
  includeReferrers = false,
): Promise<SessionScopeData | null> {
  const whereClause = country ? ` WHERE session_country_code = '${country}'` : "";
  const summaryQuery = `FROM sessions SHOW sessions, pageviews, conversion_rate, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout${whereClause} SINCE -7d UNTIL today`;
  const trendQuery = `FROM sessions SHOW sessions, pageviews, conversion_rate, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout${whereClause} TIMESERIES day SINCE -7d UNTIL today ORDER BY day ASC`;
  const referrerQuery = `FROM sessions SHOW sessions, conversion_rate${whereClause} SINCE -7d UNTIL today GROUP BY referrer_source ORDER BY sessions DESC LIMIT 6`;

  const [summaryResult, trendResult, referrerResult] = await Promise.all([
    executeShopifyqlQuery(admin, summaryQuery),
    executeShopifyqlQuery(admin, trendQuery),
    includeReferrers ? executeShopifyqlQuery(admin, referrerQuery) : Promise.resolve(null),
  ]);

  if (!summaryResult.ok || !trendResult.ok) return null;
  const summaryRow = summaryResult.rows[0] ?? {};
  const trend = trendResult.rows.map((row) => ({
    day: String(row.day ?? ""),
    sessions: Number(readNumericCell(row, "sessions") ?? 0),
    pageviews: Number(readNumericCell(row, "pageviews") ?? 0),
    conversionRate: Number(readNumericCell(row, "conversion_rate") ?? 0),
    sessionsWithCartAdditions: Number(readNumericCell(row, "sessions_with_cart_additions") ?? 0),
    sessionsThatReachedCheckout: Number(readNumericCell(row, "sessions_that_reached_checkout") ?? 0),
    sessionsThatCompletedCheckout: Number(readNumericCell(row, "sessions_that_completed_checkout") ?? 0),
  }));

  const referrers =
    referrerResult && referrerResult.ok
      ? referrerResult.rows.map((row) => ({
          referrer: String(row.referrer_source ?? "Unknown"),
          sessions: Number(readNumericCell(row, "sessions") ?? 0),
          conversionRate: Number(readNumericCell(row, "conversion_rate") ?? 0),
        }))
      : [];

  return {
    summary: {
      sessions: Number(readNumericCell(summaryRow, "sessions") ?? 0),
      pageviews: Number(readNumericCell(summaryRow, "pageviews") ?? 0),
      conversionRate: Number(readNumericCell(summaryRow, "conversion_rate") ?? 0),
      sessionsWithCartAdditions: Number(readNumericCell(summaryRow, "sessions_with_cart_additions") ?? 0),
      sessionsThatReachedCheckout: Number(readNumericCell(summaryRow, "sessions_that_reached_checkout") ?? 0),
      sessionsThatCompletedCheckout: Number(readNumericCell(summaryRow, "sessions_that_completed_checkout") ?? 0),
    },
    trend,
    referrers,
  };
}

function buildCountryOptions(
  requestedCountry: string | null | undefined,
  orderCounts: Map<string, number>,
  sessionCounts: Map<string, number>,
): TodayFilterState {
  const merged = new Map<string, TodayCountryOption>();

  for (const [key, orderCount] of orderCounts.entries()) {
    merged.set(key, {
      key,
      label: regionLabel(key),
      orderCount,
      sessions: sessionCounts.get(key) ?? null,
    });
  }
  for (const [key, sessions] of sessionCounts.entries()) {
    merged.set(key, {
      key,
      label: regionLabel(key),
      orderCount: merged.get(key)?.orderCount ?? 0,
      sessions,
    });
  }

  const countries = Array.from(merged.values()).sort((a, b) => {
    const aWeight = (a.orderCount || 0) * 1000 + (a.sessions ?? 0);
    const bWeight = (b.orderCount || 0) * 1000 + (b.sessions ?? 0);
    return bWeight - aWeight;
  });
  const selectedCountry = countries.some((item) => item.key === requestedCountry)
    ? (requestedCountry as string)
    : TODAY_ALL_COUNTRIES;
  const selectedCountryLabel =
    selectedCountry === TODAY_ALL_COUNTRIES
      ? "全部地区"
      : countries.find((item) => item.key === selectedCountry)?.label ?? "全部地区";

  return {
    selectedCountry,
    selectedCountryLabel,
    countries: [
      {
        key: TODAY_ALL_COUNTRIES,
        label: "全部地区",
        orderCount: countries.reduce((sum, item) => sum + item.orderCount, 0),
        sessions: countries.reduce((sum, item) => sum + (item.sessions ?? 0), 0),
      },
      ...countries,
    ],
    dataNotes: [],
  };
}

async function loadOrderScopeData(
  shop: string,
  selectedCountry: string,
  now: Date,
): Promise<OrderScopeData> {
  const costConfig = await getShopCostConfig(shop);
  const orders = await loadOrderFacts(shop, now);
  const scopedOrders = orders.filter((order) => {
    if (selectedCountry === TODAY_ALL_COUNTRIES) return true;
    return resolveOrderCountry(order) === selectedCountry;
  });
  const currency = scopedOrders[0]?.currency ?? orders[0]?.currency ?? "USD";

  const todayStart = startOfUtcDay(now);
  const recentSevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(todayStart, -7 + index);
    return dateKey(date);
  });
  const baselineThirtyDays = Array.from({ length: 30 }, (_, index) => {
    const date = addDays(todayStart, -37 + index);
    return dateKey(date);
  });

  const buckets = new Map<string, DayBucket>();
  const getBucket = (day: string): DayBucket => {
    const existing = buckets.get(day);
    if (existing) return existing;
    const next: DayBucket = {
      day,
      orders: 0,
      revenue: 0,
      subtotal: 0,
      discounts: 0,
      paymentFees: 0,
      firstOrders: 0,
      refundLoss: 0,
    };
    buckets.set(day, next);
    return next;
  };

  const channelBuckets = new Map<
    string,
    { orders: number; revenue: number; subtotal: number; discounts: number; paymentFees: number; firstOrders: number; refundLoss: number }
  >();
  const getChannelBucket = (channel: string) => {
    const existing = channelBuckets.get(channel);
    if (existing) return existing;
    const next = { orders: 0, revenue: 0, subtotal: 0, discounts: 0, paymentFees: 0, firstOrders: 0, refundLoss: 0 };
    channelBuckets.set(channel, next);
    return next;
  };

  const orderDayById = new Map<string, string>();
  const channelByOrderId = new Map<string, string>();
  const paymentFeePercent = costConfig.paymentFeePercent / 100;
  const paymentFeeFixed = costConfig.paymentFeeFixed;

  for (const order of scopedOrders) {
    const day = dateKey(order.createdAt);
    const paymentFees = order.totalPrice * paymentFeePercent + paymentFeeFixed;
    const bucket = getBucket(day);
    bucket.orders += 1;
    bucket.revenue += order.totalPrice;
    bucket.subtotal += order.subtotalPrice;
    bucket.discounts += order.totalDiscounts;
    bucket.paymentFees += paymentFees;
    if (order.isFirstOrder) bucket.firstOrders += 1;

    const channel = classifyChannel(order);
    const channelBucket = getChannelBucket(channel);
    channelBucket.orders += 1;
    channelBucket.revenue += order.totalPrice;
    channelBucket.subtotal += order.subtotalPrice;
    channelBucket.discounts += order.totalDiscounts;
    channelBucket.paymentFees += paymentFees;
    if (order.isFirstOrder) channelBucket.firstOrders += 1;

    orderDayById.set(order.shopifyOrderId, day);
    channelByOrderId.set(order.shopifyOrderId, channel);
  }

  const refunds = await prisma.shopRefund.findMany({
    where: {
      shop,
      processedAt: { gte: addDays(todayStart, -ORDER_LOOKBACK_DAYS), lt: todayStart },
    },
    select: {
      refundAmount: true,
      shopifyOrderId: true,
      processedAt: true,
    },
  });

  for (const refund of refunds) {
    const orderDay = orderDayById.get(refund.shopifyOrderId);
    if (!orderDay) continue;
    const refundDay = dateKey(refund.processedAt);
    getBucket(refundDay).refundLoss += refund.refundAmount;
    const channel = channelByOrderId.get(refund.shopifyOrderId);
    if (channel) getChannelBucket(channel).refundLoss += refund.refundAmount;
  }

  const sevenDayBuckets = recentSevenDays.map((day) => getBucket(day));
  const baselineBuckets = baselineThirtyDays.map((day) => getBucket(day));
  const sevenDayTotals = sumBuckets(sevenDayBuckets);
  const baselineTotals = sumBuckets(baselineBuckets);

  const channelRows = Array.from(channelBuckets.entries())
    .map(([channel, bucket]) => ({
      channel,
      orders: bucket.orders,
      revenue: bucket.revenue,
      discounts: bucket.discounts,
      refundLoss: bucket.refundLoss,
      firstOrderShare: safeDivide(bucket.firstOrders, bucket.orders),
      estimatedReturnMultiple: estimatedReturnMultiple(
        {
          revenue: bucket.revenue,
          subtotal: bucket.subtotal,
          discounts: bucket.discounts,
          paymentFees: bucket.paymentFees,
          refundLoss: bucket.refundLoss,
        },
        costConfig.defaultGrossMarginPercent,
      ),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  return {
    currency,
    defaultGrossMarginPercent: costConfig.defaultGrossMarginPercent,
    sevenDayBuckets,
    baselineBuckets,
    sevenDayTotals,
    baselineTotals,
    channelRows,
  };
}

function buildOverviewModules(
  orderScope: OrderScopeData,
  sessionScope: SessionScopeData | null,
): TodayOverviewModule[] {
  const yesterdayBucket = orderScope.sevenDayBuckets[orderScope.sevenDayBuckets.length - 1];
  const avgSevenOrders = safeDivide(orderScope.sevenDayTotals.orders, Math.max(orderScope.sevenDayBuckets.length, 1));
  const orderDelta = safeDivide(yesterdayBucket.orders - avgSevenOrders, avgSevenOrders || 1);

  const trafficYesterday = sessionScope?.trend[sessionScope.trend.length - 1]?.sessions ?? 0;
  const trafficAvg = sessionScope?.trend.length
    ? safeDivide(sessionScope.trend.reduce((sum, item) => sum + item.sessions, 0), sessionScope.trend.length)
    : 0;
  const trafficDelta = safeDivide(trafficYesterday - trafficAvg, trafficAvg || 1);

  const cvrYesterday = sessionScope?.trend[sessionScope.trend.length - 1]?.conversionRate ?? 0;
  const cvrAvg = sessionScope?.trend.length
    ? safeDivide(sessionScope.trend.reduce((sum, item) => sum + item.conversionRate, 0), sessionScope.trend.length)
    : 0;

  return [
    {
      key: "traffic",
      title: "流量质量",
      summary: sessionScope
        ? `近 7 天会话 ${formatInteger(sessionScope.summary.sessions)}，当前更适合看不同地区有没有把流量带成有效承接，而不是只看总量。`
        : "当前店铺未返回按地区的 Storefront sessions 数据，流量质量暂时先保留为待补口径。",
      yesterdayLabel: "昨日会话",
      yesterdayValue: formatInteger(trafficYesterday),
      averageLabel: "7 日均值",
      averageValue: formatInteger(trafficAvg),
      deltaLabel: "较均值",
      deltaValue: formatDeltaPercent(trafficAvg > 0 ? trafficDelta : null),
      detailPath: "/app/today/traffic",
      chartPath: "/app/today/traffic",
      chartHint: "进入流量质量详情页，按地区继续看会话趋势、来源结构和有效承接。",
    },
    {
      key: "conversion",
      title: "转化承接",
      summary: sessionScope
        ? `近 7 天转化率 ${formatPercent(sessionScope.summary.conversionRate)}，现在重点是看不同地区的加购、到达结账和完成结账有没有显著掉点。`
        : "当前店铺未返回按地区的转化口径，转化承接先保留为待补数据源。",
      yesterdayLabel: "昨日转化率",
      yesterdayValue: formatPercent(cvrYesterday),
      averageLabel: "7 日均值",
      averageValue: formatPercent(cvrAvg),
      deltaLabel: "较均值",
      deltaValue: formatPercentPoints(cvrYesterday - cvrAvg),
      detailPath: "/app/today/conversion",
      chartPath: "/app/today/conversion",
      chartHint: "进入转化承接详情页，按地区继续看漏斗和结账完成情况。",
    },
    {
      key: "orders",
      title: "收入与订单",
      summary: `近 7 天订单 ${formatInteger(orderScope.sevenDayTotals.orders)} 单、收入 ${formatCurrency(orderScope.sevenDayTotals.revenue, orderScope.currency)}，已经可以按地区看规模与质量差异。`,
      yesterdayLabel: "昨日订单数",
      yesterdayValue: formatInteger(yesterdayBucket.orders),
      averageLabel: "7 日均值",
      averageValue: formatInteger(avgSevenOrders),
      deltaLabel: "较均值",
      deltaValue: formatDeltaPercent(avgSevenOrders > 0 ? orderDelta : null),
      detailPath: "/app/today/orders",
      chartPath: "/app/today/orders",
      chartHint: "进入收入与订单详情页，按地区继续看收入趋势、退款与渠道结构。",
    },
  ];
}

function buildRoiMonitor(orderScope: OrderScopeData): {
  metrics: TodayRoiMetric[];
  factors: TodayRoiFactor[];
  chartPath: string;
  reportPath: string;
} {
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const baselineReturn = estimatedReturnMultiple(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent);
  const baselineDelta =
    shortTermReturn != null && baselineReturn != null ? safeDivide(shortTermReturn - baselineReturn, baselineReturn || 1) : null;
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const firstOrderShare = safeDivide(orderScope.sevenDayTotals.firstOrders, orderScope.sevenDayTotals.orders || 1);

  return {
    metrics: [
      {
        key: "short_term",
        title: "短期经营回报",
        currentLabel: "近 7 天",
        currentValue: formatMultiple(shortTermReturn),
        baselineLabel: "前 30 天基准",
        baselineValue: formatMultiple(baselineReturn),
        deltaLabel: "变化",
        deltaValue: baselineDelta == null ? "—" : formatDeltaPercent(baselineDelta),
        summary: "这里先用订单、折扣、退款和支付成本的估算口径，判断不同地区短期赚钱效率有没有掉到警戒线。",
        tone: toneFromDelta(baselineDelta ?? 0),
      },
      {
        key: "long_term",
        title: "首单占比",
        currentLabel: "近 7 天",
        currentValue: formatPercent(firstOrderShare),
        baselineLabel: "退款占比",
        baselineValue: formatPercent(refundShare),
        deltaLabel: "折扣占比",
        deltaValue: formatPercent(discountShare),
        summary: "先看这个地区现在是靠新增订单在撑，还是已经被折扣和退款稀释了真实回报。",
        tone: refundShare > 0.08 ? "critical" : refundShare > 0.04 ? "warning" : "positive",
      },
    ],
    factors: [
      {
        title: "折扣对利润的吞噬",
        detail: `近 7 天折扣占收入 ${formatPercent(discountShare)}，先看这个地区是不是在用折扣硬拉规模。`,
        tone: discountShare > 0.15 ? "critical" : "warning",
      },
      {
        title: "退款对回收的侵蚀",
        detail: `近 7 天退款损耗 ${formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency)}，需要结合地区差异看是不是集中爆在某些市场。`,
        tone: refundShare > 0.08 ? "critical" : "warning",
      },
      {
        title: "新增与复购结构",
        detail: `近 7 天首单占比 ${formatPercent(firstOrderShare)}，要判断这个地区是短期拉新在支撑，还是复购基础已经足够稳。`,
        tone: firstOrderShare > 0.6 ? "critical" : "warning",
      },
    ],
    chartPath: "/app/today/roi",
    reportPath: "/app/today/roi",
  };
}

function buildOrdersDetail(orderScope: OrderScopeData, selectedCountryLabel: string): TodayMetricDetail {
  const yesterday = orderScope.sevenDayBuckets[orderScope.sevenDayBuckets.length - 1];
  const avgOrders = safeDivide(orderScope.sevenDayTotals.orders, orderScope.sevenDayBuckets.length || 1);
  const aov = safeDivide(orderScope.sevenDayTotals.revenue, orderScope.sevenDayTotals.orders || 1);
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);

  const statuses: TodayMetricStatus[] = [
    {
      label: "订单规模",
      status: statusFromRatio(safeDivide(yesterday.orders, avgOrders || 1), 0.9, 0.75),
      detail: `昨日 ${formatInteger(yesterday.orders)} 单，近 7 日均值 ${formatInteger(avgOrders)} 单。`,
    },
    {
      label: "收入质量",
      status: discountShare > 0.16 ? "risk" : discountShare > 0.1 ? "watch" : "healthy",
      detail: `近 7 天折扣占收入 ${formatPercent(discountShare)}，要防止把规模增长误判成赚钱改善。`,
    },
    {
      label: "退款损耗",
      status: refundShare > 0.08 ? "risk" : refundShare > 0.04 ? "watch" : "healthy",
      detail: `近 7 天退款损耗 ${formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency)}。`,
    },
  ];

  const trendTable: TodayMetricTable = {
    title: "近 7 天订单趋势",
    columns: ["日期", "订单数", "收入", "AOV", "退款损耗"],
    rows: orderScope.sevenDayBuckets.map((bucket) => [
      shortDay(bucket.day),
      formatInteger(bucket.orders),
      formatCurrency(bucket.revenue, orderScope.currency),
      formatCurrency(safeDivide(bucket.revenue, bucket.orders || 1), orderScope.currency),
      formatCurrency(bucket.refundLoss, orderScope.currency),
    ]),
  };

  const channelTable: TodayMetricTable = {
    title: "渠道 / 来源拆解",
    columns: ["来源", "订单", "收入", "首单占比", "估算回报"],
    rows: orderScope.channelRows.map((row) => [
      row.channel,
      formatInteger(row.orders),
      formatCurrency(row.revenue, orderScope.currency),
      formatPercent(row.firstOrderShare),
      formatMultiple(row.estimatedReturnMultiple),
    ]),
  };

  const actions: TodayMetricAction[] = [
    {
      title: "先看高收入来源有没有被折扣稀释",
      detail: `把 ${selectedCountryLabel} 收入前几位的来源单独拉出来看折扣与退款，先确认增长是不是健康增长。`,
      priority: "P0",
    },
    {
      title: "跟进退款损耗突出的来源",
      detail: "优先处理退款损耗占比高的来源或活动，不要让局部问题持续侵蚀真实回收。",
      priority: "P1",
    },
    {
      title: "复核新增订单支撑项",
      detail: "把首单占比较高的来源单独看，判断这个地区的新增是否可持续。",
      priority: "P2",
    },
  ];

  return {
    key: "orders",
    title: "收入与订单详情",
    subtitle: `当前查看范围：${selectedCountryLabel}。这个页面先回答这个地区的订单增长是不是健康增长。`,
    intro: "收入与订单页现在支持按地区切换，方便直接比较不同国家/地区的规模、折扣和退款质量。",
    accent: `${selectedCountryLabel} / 近 7 天`,
    primaryQuestion: "这个地区最近的订单和收入增长，到底是在放大利润，还是只是把规模堆上去了？",
    chartHref: "/app/today/orders",
    chartLabel: "查看收入与订单详情",
    chartHint: "这里先看地区维度的订单质量，再决定要不要继续下钻到来源或对象。",
    metrics: [
      { label: "昨日订单数", value: formatInteger(yesterday.orders) },
      { label: "7 日均值", value: formatInteger(avgOrders) },
      { label: "近 7 天收入", value: formatCurrency(orderScope.sevenDayTotals.revenue, orderScope.currency) },
      { label: "平均客单价", value: formatCurrency(aov, orderScope.currency) },
      { label: "折扣占比", value: formatPercent(discountShare) },
      { label: "退款占比", value: formatPercent(refundShare) },
    ],
    statuses,
    tables: [trendTable, channelTable],
    actions,
    conclusions: [
      "先用地区视角判断订单增长是不是健康增长，而不是把所有市场混成一个总数。",
      "如果折扣和退款占比偏高，优先看这个地区的活动与履约问题。",
      "下一步最值得继续深挖的是高收入来源和退款损耗高的局部来源。",
    ],
  };
}

function buildRoiDetail(orderScope: OrderScopeData, selectedCountryLabel: string): TodayMetricDetail {
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const baselineReturn = estimatedReturnMultiple(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent);
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const firstOrderShare = safeDivide(orderScope.sevenDayTotals.firstOrders, orderScope.sevenDayTotals.orders || 1);
  const statuses: TodayMetricStatus[] = [
    {
      label: "整体经营回报",
      status:
        shortTermReturn == null || baselineReturn == null
          ? "watch"
          : shortTermReturn < baselineReturn * 0.85
            ? "risk"
            : shortTermReturn < baselineReturn * 0.95
              ? "watch"
              : "healthy",
      detail: `近 7 天估算经营回报 ${formatMultiple(shortTermReturn)}，前 30 天基准 ${formatMultiple(baselineReturn)}。`,
    },
    {
      label: "折扣与退款",
      status: refundShare > 0.08 || discountShare > 0.16 ? "risk" : refundShare > 0.04 || discountShare > 0.1 ? "watch" : "healthy",
      detail: `折扣占比 ${formatPercent(discountShare)}，退款占比 ${formatPercent(refundShare)}。`,
    },
    {
      label: "新增结构",
      status: firstOrderShare > 0.65 ? "watch" : "healthy",
      detail: `首单占比 ${formatPercent(firstOrderShare)}，需要判断当前回报更多来自拉新还是稳定复购。`,
    },
  ];

  const trendTable: TodayMetricTable = {
    title: "近 7 天经营回报趋势",
    columns: ["日期", "收入", "折扣", "退款", "估算回报"],
    rows: orderScope.sevenDayBuckets.map((bucket) => [
      shortDay(bucket.day),
      formatCurrency(bucket.revenue, orderScope.currency),
      formatCurrency(bucket.discounts, orderScope.currency),
      formatCurrency(bucket.refundLoss, orderScope.currency),
      formatMultiple(estimatedReturnMultiple(bucket, orderScope.defaultGrossMarginPercent)),
    ]),
  };
  const channelTable: TodayMetricTable = {
    title: "主要来源回报",
    columns: ["来源", "收入", "折扣", "退款", "估算回报"],
    rows: orderScope.channelRows.map((row) => [
      row.channel,
      formatCurrency(row.revenue, orderScope.currency),
      formatCurrency(row.discounts, orderScope.currency),
      formatCurrency(row.refundLoss, orderScope.currency),
      formatMultiple(row.estimatedReturnMultiple),
    ]),
  };

  return {
    key: "roi",
    title: "ROI 详情",
    subtitle: `当前查看范围：${selectedCountryLabel}。这里先用地区口径判断赚钱效率有没有明显分化。`,
    intro: "ROI 详情这一版先用订单、折扣、退款和支付成本做地区估算口径，优先回答哪个地区的经营回报正在承压。",
    accent: `${selectedCountryLabel} / 近 7 天 vs 前 30 天`,
    primaryQuestion: "这个地区最近的赚钱效率是健康、承压，还是已经需要先止损？",
    chartHref: "/app/today/roi",
    chartLabel: "查看 ROI 详情",
    chartHint: "这里先收住地区回报判断，后续再继续并到真实 market 维度。",
    metrics: [
      { label: "近 7 天经营回报", value: formatMultiple(shortTermReturn) },
      { label: "前 30 天基准", value: formatMultiple(baselineReturn) },
      { label: "近 7 天收入", value: formatCurrency(orderScope.sevenDayTotals.revenue, orderScope.currency) },
      { label: "折扣损耗", value: formatCurrency(orderScope.sevenDayTotals.discounts, orderScope.currency) },
      { label: "退款损耗", value: formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency) },
      { label: "首单占比", value: formatPercent(firstOrderShare) },
    ],
    statuses,
    tables: [trendTable, channelTable],
    actions: [
      {
        title: "先压住低回报来源",
        detail: `优先看 ${selectedCountryLabel} 里收入高但估算回报偏低的来源，先把低效投入和低质订单分开。`,
        priority: "P0",
      },
      {
        title: "跟进退款与折扣双高来源",
        detail: "退款和折扣一起偏高时，最容易把表面规模误判成赚钱改善。",
        priority: "P1",
      },
      {
        title: "复核新增结构是否过重",
        detail: "如果首单占比过高，要确认这个地区是不是过度依赖短期拉新。",
        priority: "P2",
      },
    ],
    conclusions: [
      "地区维度能更快看出总 ROI 被哪个国家/地区拉低或拉高。",
      "当前版本是经营回报估算口径，先用于筛查，再决定是否往更深的成本层继续钻。",
      "优先盯住收入高但折扣、退款也高的地区来源。",
    ],
  };
}

function buildTrafficDetail(sessionScope: SessionScopeData | null, selectedCountryLabel: string): TodayMetricDetail {
  const sessionsYesterday = sessionScope?.trend[sessionScope.trend.length - 1]?.sessions ?? 0;
  const avgSessions = sessionScope?.trend.length
    ? safeDivide(sessionScope.trend.reduce((sum, item) => sum + item.sessions, 0), sessionScope.trend.length)
    : 0;
  const pageviewsPerSession = sessionScope ? safeDivide(sessionScope.summary.pageviews, sessionScope.summary.sessions || 1) : 0;
  const cartRate = sessionScope ? safeDivide(sessionScope.summary.sessionsWithCartAdditions, sessionScope.summary.sessions || 1) : 0;
  const checkoutReachRate = sessionScope ? safeDivide(sessionScope.summary.sessionsThatReachedCheckout, sessionScope.summary.sessions || 1) : 0;

  return {
    key: "traffic",
    title: "流量质量详情",
    subtitle: `当前查看范围：${selectedCountryLabel}。这个页面先看这个地区的会话质量和来源结构。`,
    intro: "Traffic 详情现在支持按地区切换，核心是比较不同地区的会话量、页面深度和来源结构。",
    accent: `${selectedCountryLabel} / Storefront sessions`,
    primaryQuestion: "这个地区最近进来的流量，是真的在形成有效承接，还是只是在堆会话？",
    chartHref: "/app/today/traffic",
    chartLabel: "查看流量质量详情",
    chartHint: "流量和转化口径来自 Shopify Storefront sessions。",
    metrics: [
      { label: "昨日会话", value: formatInteger(sessionsYesterday) },
      { label: "7 日均值", value: formatInteger(avgSessions) },
      { label: "近 7 天会话", value: formatInteger(sessionScope?.summary.sessions ?? 0) },
      { label: "页/会话", value: pageviewsPerSession.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) },
      { label: "加购触达率", value: formatPercent(cartRate) },
      { label: "到达结账率", value: formatPercent(checkoutReachRate) },
    ],
    statuses: [
      {
        label: "流量规模",
        status: statusFromRatio(safeDivide(sessionsYesterday, avgSessions || 1), 0.9, 0.75),
        detail: `昨日会话 ${formatInteger(sessionsYesterday)}，近 7 日均值 ${formatInteger(avgSessions)}。`,
      },
      {
        label: "页面深度",
        status: pageviewsPerSession < 1.8 ? "risk" : pageviewsPerSession < 2.3 ? "watch" : "healthy",
        detail: `当前页/会话 ${pageviewsPerSession.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}。`,
      },
      {
        label: "流量承接",
        status: cartRate < 0.03 ? "risk" : cartRate < 0.05 ? "watch" : "healthy",
        detail: `近 7 天加购触达率 ${formatPercent(cartRate)}。`,
      },
    ],
    tables: [
      {
        title: "近 7 天流量趋势",
        columns: ["日期", "会话", "页面浏览", "转化率"],
        rows:
          sessionScope?.trend.map((item) => [
            shortDay(item.day),
            formatInteger(item.sessions),
            formatInteger(item.pageviews),
            formatPercent(item.conversionRate),
          ]) ?? [],
      },
      {
        title: "主要来源",
        columns: ["来源", "会话", "转化率"],
        rows:
          sessionScope?.referrers.map((item) => [
            item.referrer,
            formatInteger(item.sessions),
            formatPercent(item.conversionRate),
          ]) ?? [],
      },
    ],
    actions: [
      {
        title: "先复核高会话来源的质量",
        detail: `把 ${selectedCountryLabel} 会话量最高的 2-3 个来源先拆出来，确认增长是不是来自真正有承接能力的流量。`,
        priority: "P0",
      },
      {
        title: "检查页面深度偏浅的地区流量",
        detail: "如果页/会话偏低，先回头看是不是入口落地页和预期不匹配。",
        priority: "P1",
      },
      {
        title: "联动转化页一起看",
        detail: "如果加购触达率偏低，直接去转化承接详情页核对漏斗掉点。",
        priority: "P2",
      },
    ],
    conclusions: [
      "地区流量最先看的是会话质量和入口来源，而不是只看有没有涨。",
      "如果某个地区会话高但页面深度和加购触达都偏弱，就值得优先处理。",
      "需要继续深挖时，优先对照来源结构和转化承接页。",
    ],
  };
}

function buildConversionDetail(sessionScope: SessionScopeData | null, selectedCountryLabel: string): TodayMetricDetail {
  const conversionRate = sessionScope?.summary.conversionRate ?? 0;
  const cartRate = sessionScope ? safeDivide(sessionScope.summary.sessionsWithCartAdditions, sessionScope.summary.sessions || 1) : 0;
  const checkoutReachRate = sessionScope ? safeDivide(sessionScope.summary.sessionsThatReachedCheckout, sessionScope.summary.sessions || 1) : 0;
  const checkoutCompleteRate = sessionScope ? safeDivide(sessionScope.summary.sessionsThatCompletedCheckout, sessionScope.summary.sessions || 1) : 0;
  const yesterdayCvr = sessionScope?.trend[sessionScope.trend.length - 1]?.conversionRate ?? 0;
  const averageCvr = sessionScope?.trend.length
    ? safeDivide(sessionScope.trend.reduce((sum, item) => sum + item.conversionRate, 0), sessionScope.trend.length)
    : 0;

  return {
    key: "conversion",
    title: "转化承接详情",
    subtitle: `当前查看范围：${selectedCountryLabel}。这个页面先看这个地区的漏斗承接是不是稳定。`,
    intro: "Conversion 详情这一版用 Storefront sessions 的漏斗口径，帮助比较不同地区的加购、到达结账和完成结账差异。",
    accent: `${selectedCountryLabel} / Storefront sessions`,
    primaryQuestion: "这个地区最近的转化承接，究竟卡在加购、到达结账，还是完成结账？",
    chartHref: "/app/today/conversion",
    chartLabel: "查看转化承接详情",
    chartHint: "这里的漏斗数据来自 Shopify sessions 的 online store 口径。",
    metrics: [
      { label: "昨日转化率", value: formatPercent(yesterdayCvr) },
      { label: "7 日均值", value: formatPercent(averageCvr) },
      { label: "近 7 天转化率", value: formatPercent(conversionRate) },
      { label: "加购触达率", value: formatPercent(cartRate) },
      { label: "到达结账率", value: formatPercent(checkoutReachRate) },
      { label: "完成结账率", value: formatPercent(checkoutCompleteRate) },
    ],
    statuses: [
      {
        label: "总体转化",
        status: conversionRate < 0.012 ? "risk" : conversionRate < 0.02 ? "watch" : "healthy",
        detail: `近 7 天转化率 ${formatPercent(conversionRate)}。`,
      },
      {
        label: "加购到结账",
        status: checkoutReachRate < 0.018 ? "risk" : checkoutReachRate < 0.03 ? "watch" : "healthy",
        detail: `近 7 天到达结账率 ${formatPercent(checkoutReachRate)}。`,
      },
      {
        label: "完成结账",
        status: checkoutCompleteRate < 0.01 ? "risk" : checkoutCompleteRate < 0.018 ? "watch" : "healthy",
        detail: `近 7 天完成结账率 ${formatPercent(checkoutCompleteRate)}。`,
      },
    ],
    tables: [
      {
        title: "近 7 天漏斗趋势",
        columns: ["日期", "会话", "加购", "到达结账", "完成结账"],
        rows:
          sessionScope?.trend.map((item) => [
            shortDay(item.day),
            formatInteger(item.sessions),
            formatInteger(item.sessionsWithCartAdditions),
            formatInteger(item.sessionsThatReachedCheckout),
            formatInteger(item.sessionsThatCompletedCheckout),
          ]) ?? [],
      },
      {
        title: "主要来源转化",
        columns: ["来源", "会话", "转化率"],
        rows:
          sessionScope?.referrers.map((item) => [
            item.referrer,
            formatInteger(item.sessions),
            formatPercent(item.conversionRate),
          ]) ?? [],
      },
    ],
    actions: [
      {
        title: "先找高会话低转化来源",
        detail: `把 ${selectedCountryLabel} 里会话高但转化率偏低的来源先圈出来，优先查落地页和结账链路。`,
        priority: "P0",
      },
      {
        title: "对照结账完成率排查末段流失",
        detail: "如果到达结账不低但完成结账偏弱，优先看支付、运费和信任信息。",
        priority: "P1",
      },
      {
        title: "联动流量质量一起看",
        detail: "如果前段会话质量本身就弱，要一起回看来源结构，避免继续把流量送到低效页面。",
        priority: "P2",
      },
    ],
    conclusions: [
      "地区漏斗最有价值的是比较不同国家/地区卡在哪一段，而不是只盯整体 CVR。",
      "如果某个地区高会话但完成结账率偏弱，就值得单独优先处理。",
      "下一步优先联动高会话来源和高流量落地页去排查。",
    ],
  };
}

export async function loadTodayOverviewData(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  hasReadReports: boolean;
  requestedCountry: string | null | undefined;
  now?: Date;
}): Promise<TodayOverviewData> {
  const now = params.now ?? new Date();
  try {
    const [orderCounts, sessionCounts] = await Promise.all([
      loadOrderCountryCounts(params.shop, now),
      params.hasReadReports
        ? loadSessionCountryCounts(params.admin)
        : Promise.resolve(new Map<string, number>()),
    ]);
    const filters = buildCountryOptions(
      normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null,
      orderCounts,
      sessionCounts,
    );
    if (!params.hasReadReports) {
      filters.dataNotes.push("当前店铺未返回 read_reports，流量与转化暂时无法按地区读取 Storefront sessions。");
    }
    const [orderScope, sessionScope] = await Promise.all([
      loadOrderScopeData(params.shop, filters.selectedCountry, now),
      params.hasReadReports
        ? loadSessionScope(
            params.admin,
            filters.selectedCountry === TODAY_ALL_COUNTRIES ? null : filters.selectedCountry,
            false,
          )
        : Promise.resolve(null),
    ]);
    if (params.hasReadReports && sessionScope === null) {
      filters.dataNotes.push("Storefront sessions 地区查询当前未返回有效数据，流量与转化先显示为空值。");
    }
    return {
      filters,
      roiMonitor: buildRoiMonitor(orderScope),
      modules: buildOverviewModules(orderScope, sessionScope),
    };
  } catch (error) {
    console.error("[todayGeo] loadTodayOverviewData failed:", error);
    return {
      filters: buildFallbackFilters(params.requestedCountry, [
        "Today 总览数据暂时加载失败，当前先展示最近一版默认分析文案。",
      ]),
      roiMonitor: getTodayRoiMonitor(),
      modules: getTodayOverviewModules(),
    };
  }
}

export async function loadTodayDetailData(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  hasReadReports: boolean;
  requestedCountry: string | null | undefined;
  metric: TodayBusinessModuleKey;
  now?: Date;
}): Promise<TodayDetailData> {
  const now = params.now ?? new Date();
  try {
    const [orderCounts, sessionCounts] = await Promise.all([
      loadOrderCountryCounts(params.shop, now),
      params.hasReadReports
        ? loadSessionCountryCounts(params.admin)
        : Promise.resolve(new Map<string, number>()),
    ]);
    const filters = buildCountryOptions(
      normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null,
      orderCounts,
      sessionCounts,
    );
    if (!params.hasReadReports && (params.metric === "traffic" || params.metric === "conversion")) {
      filters.dataNotes.push("当前店铺未返回 read_reports，流量与转化详情暂时无法按地区读取 Storefront sessions。");
    }

    const selectedCountryLabel = filters.selectedCountryLabel;

    if (params.metric === "orders" || params.metric === "roi") {
      const orderScope = await loadOrderScopeData(params.shop, filters.selectedCountry, now);
      return {
        filters,
        detail:
          params.metric === "orders"
            ? buildOrdersDetail(orderScope, selectedCountryLabel)
            : buildRoiDetail(orderScope, selectedCountryLabel),
      };
    }

    const sessionScope =
      params.hasReadReports
        ? await loadSessionScope(
            params.admin,
            filters.selectedCountry === TODAY_ALL_COUNTRIES ? null : filters.selectedCountry,
            true,
          )
        : null;
    if (params.hasReadReports && sessionScope === null) {
      filters.dataNotes.push("Storefront sessions 地区查询当前未返回有效数据，当前详情页先保留空值。");
    }

    return {
      filters,
      detail:
        params.metric === "traffic"
          ? buildTrafficDetail(sessionScope, selectedCountryLabel)
          : buildConversionDetail(sessionScope, selectedCountryLabel),
    };
  } catch (error) {
    console.error(`[todayGeo] loadTodayDetailData failed metric=${params.metric}:`, error);
    return buildFallbackDetail(
      params.metric,
      params.requestedCountry,
      "Today 详情数据暂时加载失败，当前先展示默认报告模板。",
    );
  }
}

type DecisionOrderLine = {
  lineItemId: string;
  inventoryItemId: string | null;
  variantId: string | null;
  productId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: number;
  totalDiscount: number;
};

type DecisionOrder = {
  shopifyOrderId: string;
  orderNumber: number;
  createdAt: Date;
  totalPrice: number;
  currency: string;
  sourceName: string | null;
  referringSite: string | null;
  utmSource: string | null;
  isFirstOrder: boolean;
  shippingCountryCode: string | null;
  billingCountryCode: string | null;
  lineItems: DecisionOrderLine[];
};

type ProductAggregate = {
  key: string;
  title: string;
  quantity: number;
  orderCount: number;
  revenue: number;
  discountCost: number;
  refundLoss: number;
  estimatedProfit: number;
  estimatedMargin: number;
};

type OrderAggregate = {
  key: string;
  title: string;
  revenue: number;
  refundLoss: number;
  estimatedProfit: number;
  estimatedMargin: number;
  itemCount: number;
  channelLabel: string;
  isFirstOrder: boolean;
};

type DecisionObjectData = {
  currency: string;
  products: ProductAggregate[];
  orders: OrderAggregate[];
};

function estimatedCost(bucket: Pick<DayBucket, "subtotal" | "discounts" | "paymentFees" | "refundLoss">, defaultMarginPercent: number): number {
  const margin = Math.max(0, Math.min(100, defaultMarginPercent)) / 100;
  const estimatedCogs = bucket.subtotal * (1 - margin);
  return estimatedCogs + bucket.discounts + bucket.paymentFees + bucket.refundLoss;
}

function estimatedProfit(bucket: Pick<DayBucket, "revenue" | "subtotal" | "discounts" | "paymentFees" | "refundLoss">, defaultMarginPercent: number): number {
  return bucket.revenue - estimatedCost(bucket, defaultMarginPercent);
}

function comparableBaseline(total: number): number {
  return total / 30 * 7;
}

function buildTodayHeader(orderScope: OrderScopeData): TodayHeader {
  const estimatedProfitValue = estimatedProfit(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const estimatedProfitMargin = safeDivide(estimatedProfitValue, orderScope.sevenDayTotals.revenue || 1);
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const baselineProfit = estimatedProfit(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent);
  const profitDelta = safeDivide(
    estimatedProfitValue - comparableBaseline(baselineProfit),
    comparableBaseline(baselineProfit) || 1,
  );
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const firstOrderShare = safeDivide(orderScope.sevenDayTotals.firstOrders, orderScope.sevenDayTotals.orders || 1);

  const status =
    estimatedProfitValue <= 0 || estimatedProfitMargin < 0.05 || (shortTermReturn ?? 0) < 1
      ? "risk"
      : estimatedProfitMargin < 0.1 || profitDelta < 0
        ? "watch"
        : "healthy";

  return {
    status,
    statusLabel: status === "healthy" ? "健康增长" : status === "watch" ? "需要关注" : "盈利压力",
    summary:
      status === "healthy"
        ? "最近 7 天仍在稳定赚钱，当前更重要的是区分哪些对象值得继续放大。"
        : status === "watch"
          ? "最近 7 天仍然为正，但利润质量已经开始走弱，不能只看规模增长。"
          : "最近 7 天赚钱效率已经掉到风险区，应该优先止住低质量增长和损耗。",
    primaryBottleneck:
      refundShare > 0.08
        ? "退款损耗正在直接侵蚀利润。"
        : discountShare > 0.15
          ? "折扣占比偏高，规模增长没有同步转成利润改善。"
          : "利润增速落后于收入增速，当前增长质量不够稳。",
    biggestOpportunity:
      firstOrderShare < 0.45
        ? "复购基础相对稳，适合继续放大健康对象。"
        : "新增订单仍在支撑规模，只要控制低质量对象，仍有继续放大的空间。",
    dataFreshness: "近 7 天订单与退款快照",
    dataConfidence: "medium",
    metrics: {
      revenue: formatCurrency(orderScope.sevenDayTotals.revenue, orderScope.currency),
      estimatedProfit: formatCurrency(estimatedProfitValue, orderScope.currency),
      estimatedProfitMargin: formatPercent(estimatedProfitMargin),
      shortTermReturn: formatMultiple(shortTermReturn),
    },
  };
}

function buildTodayMetricCards(orderScope: OrderScopeData): TodayMetricCard[] {
  const revenueValue = orderScope.sevenDayTotals.revenue;
  const costValue = estimatedCost(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const profitValue = estimatedProfit(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const profitMarginValue = safeDivide(profitValue, revenueValue || 1);
  const aovValue = safeDivide(revenueValue, orderScope.sevenDayTotals.orders || 1);

  const baselineRevenue = comparableBaseline(orderScope.baselineTotals.revenue);
  const baselineCost = comparableBaseline(estimatedCost(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent));
  const baselineProfit = comparableBaseline(estimatedProfit(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent));
  const baselineProfitMargin = safeDivide(estimatedProfit(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent), orderScope.baselineTotals.revenue || 1);
  const baselineOrders = comparableBaseline(orderScope.baselineTotals.orders);
  const baselineAov = safeDivide(baselineRevenue, baselineOrders || 1);

  const buildTone = (delta: number, inverse = false): TodayMetricCard["tone"] => {
    if (inverse) {
      if (delta >= 0.15) return "negative";
      if (delta >= 0.05) return "warning";
      return "positive";
    }
    if (delta <= -0.15) return "negative";
    if (delta <= -0.05) return "warning";
    return "positive";
  };

  return [
    {
      key: "revenue",
      label: "收入",
      value: formatCurrency(revenueValue, orderScope.currency),
      delta: formatDeltaPercent(safeDivide(revenueValue - baselineRevenue, baselineRevenue || 1)),
      tone: buildTone(safeDivide(revenueValue - baselineRevenue, baselineRevenue || 1)),
      source: "realized",
      summary: "先看最近 7 天收入增长里，哪些对象在制造健康增长，哪些对象只是把规模做大。",
      href: "/app/today/revenue",
    },
    {
      key: "cost",
      label: "成本",
      value: formatCurrency(costValue, orderScope.currency),
      delta: formatDeltaPercent(safeDivide(costValue - baselineCost, baselineCost || 1)),
      tone: buildTone(safeDivide(costValue - baselineCost, baselineCost || 1), true),
      source: "estimated",
      summary: "当前先用商品成本、折扣、支付手续费与退款损耗估算，判断成本有没有跑到收入前面。",
      href: "/app/today/profit?focus=cost",
    },
    {
      key: "profit",
      label: "利润",
      value: formatCurrency(profitValue, orderScope.currency),
      delta: formatDeltaPercent(safeDivide(profitValue - baselineProfit, baselineProfit || 1)),
      tone: buildTone(safeDivide(profitValue - baselineProfit, baselineProfit || 1)),
      source: "estimated",
      summary: "利润页要回答的不是有没有卖出去，而是卖出去的钱最后留下了多少。",
      href: "/app/today/profit?focus=profit",
    },
    {
      key: "profit_margin",
      label: "利润率",
      value: formatPercent(profitMarginValue),
      delta: formatPercentPoints(profitMarginValue - baselineProfitMargin),
      tone: buildTone(profitMarginValue - baselineProfitMargin),
      source: "estimated",
      summary: "利润率最适合识别哪些对象正在用规模掩盖低质量增长。",
      href: "/app/today/profit?focus=margin",
    },
    {
      key: "orders",
      label: "订单数",
      value: formatInteger(orderScope.sevenDayTotals.orders),
      delta: formatDeltaPercent(safeDivide(orderScope.sevenDayTotals.orders - baselineOrders, baselineOrders || 1)),
      tone: buildTone(safeDivide(orderScope.sevenDayTotals.orders - baselineOrders, baselineOrders || 1)),
      source: "realized",
      summary: "订单数只回答规模，进入收入页后必须继续看订单质量与对象结构。",
      href: "/app/today/revenue?focus=orders",
    },
    {
      key: "aov",
      label: "客单价",
      value: formatCurrency(aovValue, orderScope.currency),
      delta: formatDeltaPercent(safeDivide(aovValue - baselineAov, baselineAov || 1)),
      tone: buildTone(safeDivide(aovValue - baselineAov, baselineAov || 1)),
      source: "realized",
      summary: "客单价要继续拆到商品组合和高价值订单，判断高客单是不是健康样本。",
      href: "/app/today/revenue?focus=aov",
    },
  ];
}

function buildTodayReasonCards(orderScope: OrderScopeData, sessionScope: SessionScopeData | null): TodayReasonCard[] {
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const trafficSummary = sessionScope
    ? `近 7 天会话 ${formatInteger(sessionScope.summary.sessions)}，转化率 ${formatPercent(sessionScope.summary.conversionRate)}。`
    : "当前未接入地区维度的 Storefront sessions。";

  return [
    {
      key: "profit-erosion",
      title: "利润被什么侵蚀",
      value: formatPercent(Math.max(refundShare, discountShare)),
      label: refundShare >= discountShare ? "退款损耗" : "折扣占比",
      meta: refundShare >= discountShare ? "成交后利润继续流失" : "成交前利润先被让掉",
      summary:
        refundShare >= discountShare
          ? "退款问题优先级更高，它会直接吞掉已经成交的利润。"
          : "当前先别把折扣带来的规模增长误判成真实经营改善。",
      tone: refundShare > 0.08 || discountShare > 0.15 ? "red" : "orange",
      href: refundShare >= discountShare ? "/app/today/roi" : "/app/today/profit?focus=cost",
    },
    {
      key: "growth-quality",
      title: "当前增长质量",
      value: formatMultiple(shortTermReturn),
      label: "短期经营回报",
      meta: "收入 / 估算经营成本",
      summary:
        (shortTermReturn ?? 0) >= 1.5
          ? "最近 7 天的增长质量还在健康区，更值得继续找可以放大的对象。"
          : "当前增长仍然为正，但增长质量已经走弱，应该优先排查低效对象。",
      tone: (shortTermReturn ?? 0) >= 1.5 ? "green" : "orange",
      href: "/app/today/roi",
    },
    {
      key: "current-priority",
      title: "当前最值得先看",
      value: sessionScope ? formatPercent(sessionScope.summary.conversionRate) : formatInteger(orderScope.sevenDayTotals.orders),
      label: sessionScope ? "转化率" : "订单规模",
      meta: sessionScope ? trafficSummary : "当前先按订单质量继续看对象。",
      summary: sessionScope
        ? "如果流量和转化已经承压，就不应该继续把注意力放在冲量上。"
        : "当前先用收入、利润和 ROI 三条主线判断哪些对象值得继续处理。",
      tone: sessionScope ? "blue" : "blue",
      href: sessionScope ? "/app/today/traffic" : "/app/today/revenue",
    },
  ];
}

function buildTodayRoiSummary(orderScope: OrderScopeData): TodayRoiSummary {
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const firstOrderShare = safeDivide(orderScope.sevenDayTotals.firstOrders, orderScope.sevenDayTotals.orders || 1);

  return {
    cards: [
      {
        key: "short_term",
        label: "短期经营回报",
        statusLabel:
          (shortTermReturn ?? 0) >= 1.5 ? "强" : (shortTermReturn ?? 0) >= 1 ? "稳定" : "偏弱",
        value: formatMultiple(shortTermReturn),
        summary: "最近 7 天先用订单、折扣、退款和支付成本的估算口径判断有没有在赚钱。",
        dataQuality: "estimated",
        confidence: "medium",
        href: "/app/today/roi",
      },
      {
        key: "payback",
        label: "回收期 ROI",
        statusLabel: "待接入",
        value: "待接入",
        summary: "缺少 CAC 与 cohort 回收窗口，当前阶段不输出伪造回收 ROI。",
        dataQuality: "pending",
        confidence: "low",
        href: "/app/today/roi",
      },
      {
        key: "lifetime",
        label: "长期价值状态",
        statusLabel: firstOrderShare > 0.6 ? "新增偏重" : "结构较稳",
        value: `首单占比 ${formatPercent(firstOrderShare)}`,
        summary: "当前先用新增结构代替长期 ROI，等 CAC 接入后再升级为正式长期 ROI。",
        dataQuality: "estimated",
        confidence: "low",
        href: "/app/today/roi",
      },
    ],
  };
}

function buildFallbackOverviewReport(): TodayOverviewReport {
  const modules = getTodayOverviewModules();
  const roiMonitor = getTodayRoiMonitor();
  const ordersModule = modules.find((module) => module.key === "orders") ?? modules[0];
  const trafficModule = modules.find((module) => module.key === "traffic") ?? modules[1] ?? modules[0];
  const conversionModule = modules.find((module) => module.key === "conversion") ?? modules[2] ?? modules[0];
  const shortTermMetric = roiMonitor.metrics.find((metric) => metric.key === "short_term") ?? roiMonitor.metrics[0];
  const longTermMetric = roiMonitor.metrics.find((metric) => metric.key === "long_term") ?? roiMonitor.metrics[1] ?? roiMonitor.metrics[0];

  return {
    header: {
      status: "watch",
      statusLabel: "需要关注",
      summary: "Today 总览数据暂时加载失败，当前先展示最近一版默认经营判断，避免首页出现空白。",
      primaryBottleneck: "短期赚钱效率和承接质量正在走弱，需要继续看订单质量与 ROI。",
      biggestOpportunity: "先从收入、利润和 ROI 三条主线收敛问题，再决定具体对象优先级。",
      dataFreshness: "默认分析文案",
      dataConfidence: "low",
      metrics: {
        revenue: ordersModule?.averageValue ?? "—",
        estimatedProfit: "待恢复",
        estimatedProfitMargin: "待恢复",
        shortTermReturn: shortTermMetric?.currentValue ?? "—",
      },
    },
    metricCards: [
      {
        key: "revenue",
        label: "收入",
        value: ordersModule?.averageValue ?? "—",
        delta: ordersModule?.deltaValue ?? "—",
        tone: "warning",
        source: "estimated",
        summary: "先看订单和收入是不是健康增长，再继续拆到商品与订单对象。",
        href: "/app/today/revenue",
      },
      {
        key: "cost",
        label: "成本",
        value: "待恢复",
        delta: "—",
        tone: "warning",
        source: "estimated",
        summary: "成本页优先回答利润被什么吞掉，而不是继续堆规模。",
        href: "/app/today/profit?focus=cost",
      },
      {
        key: "profit",
        label: "利润",
        value: "待恢复",
        delta: "—",
        tone: "warning",
        source: "estimated",
        summary: "利润页会继续看哪些商品和订单真的留下了结果。",
        href: "/app/today/profit?focus=profit",
      },
      {
        key: "profit_margin",
        label: "利润率",
        value: "待恢复",
        delta: "—",
        tone: "warning",
        source: "estimated",
        summary: "利润率用于识别是不是有低质量增长在掩盖真实经营问题。",
        href: "/app/today/profit?focus=margin",
      },
      {
        key: "orders",
        label: "订单数",
        value: ordersModule?.yesterdayValue ?? "—",
        delta: ordersModule?.deltaValue ?? "—",
        tone: "neutral",
        source: "realized",
        summary: "订单数只回答规模，下一步必须继续看订单质量。",
        href: "/app/today/revenue?focus=orders",
      },
      {
        key: "aov",
        label: "客单价",
        value: getTodayMetricDetail("orders").metrics.find((metric) => metric.label === "平均客单价")?.value ?? "—",
        delta: "—",
        tone: "neutral",
        source: "realized",
        summary: "高客单不等于高质量，还要继续看高价值订单能不能留下利润。",
        href: "/app/today/revenue?focus=aov",
      },
    ],
    reasonCards: [
      {
        key: "traffic-quality",
        title: "流量质量仍需继续确认",
        value: trafficModule?.deltaValue ?? "—",
        label: "流量承接",
        meta: trafficModule?.summary ?? "默认分析文案",
        summary: "当前先沿用最近一版默认判断，后续恢复真实快照后再替换成正式对象证据。",
        tone: "blue",
        href: "/app/today/traffic",
      },
      {
        key: "conversion-risk",
        title: "转化承接仍在影响赚钱效率",
        value: conversionModule?.deltaValue ?? "—",
        label: "转化承接",
        meta: conversionModule?.summary ?? "默认分析文案",
        summary: "现阶段先保留方向判断，避免首页直接空白。",
        tone: "orange",
        href: "/app/today/conversion",
      },
      {
        key: "roi-pressure",
        title: "短期 ROI 仍需重点关注",
        value: shortTermMetric?.deltaValue ?? "—",
        label: "短期回报",
        meta: shortTermMetric?.summary ?? "默认分析文案",
        summary: "恢复正式数据后，应该继续拆到渠道和损耗对象。",
        tone: "red",
        href: "/app/today/roi",
      },
    ],
    roiSummary: {
      cards: [
        {
          key: "short_term",
          label: shortTermMetric?.title ?? "短期经营回报",
          statusLabel: "默认判断",
          value: shortTermMetric?.currentValue ?? "—",
          summary: shortTermMetric?.summary ?? "默认分析文案",
          dataQuality: "pending",
          confidence: "low",
          href: "/app/today/roi",
        },
        {
          key: "payback",
          label: "回收期 ROI",
          statusLabel: "待接入",
          value: "待接入",
          summary: "当前先保留回收期占位，不让首页断层。",
          dataQuality: "pending",
          confidence: "low",
          href: "/app/today/roi",
        },
        {
          key: "lifetime",
          label: longTermMetric?.title ?? "长期价值状态",
          statusLabel: "默认判断",
          value: longTermMetric?.currentValue ?? "—",
          summary: longTermMetric?.summary ?? "默认分析文案",
          dataQuality: "pending",
          confidence: "low",
          href: "/app/today/roi",
        },
      ],
    },
  };
}

function buildFallbackDecisionReport(metric: TodayDecisionReportKey): TodayDecisionReport {
  const fallbackDetail =
    metric === "roi"
      ? getTodayMetricDetail("roi")
      : getTodayMetricDetail("orders");

  const fallbackGroups: TodayEvidenceGroup[] = fallbackDetail.tables.map((table, index) => ({
    key: `${metric}-fallback-group-${index + 1}`,
    title: table.title,
    tone: index === 0 ? "neutral" : "warning",
    summary: `当前先展示默认分析表格，正式对象证据会在主数据链路恢复后替换。`,
    items: table.rows.slice(0, 3).map((row, rowIndex) => ({
      id: `${metric}-fallback-item-${index + 1}-${rowIndex + 1}`,
      title: row[0] ?? `对象 ${rowIndex + 1}`,
      objectType: metric === "roi" ? "channel" : "order",
      metrics: table.columns.slice(1, 4).map((column, columnIndex) => ({
        label: column,
        value: row[columnIndex + 1] ?? "—",
      })),
      summary: "当前先保留默认分析对象，避免报告页出现空白。",
      primaryActionLabel: "查看详情",
      report: {
        title: row[0] ?? `对象 ${rowIndex + 1}`,
        subtitle: `${fallbackDetail.title} / 默认分析对象`,
        headlineMetrics: table.columns.slice(1, 4).map((column, columnIndex) => ({
          label: column,
          value: row[columnIndex + 1] ?? "—",
        })),
        conclusion: "当前先保留默认分析对象，等正式对象链路恢复后再替换成真实对象证据。",
        analysisPoints: [
          fallbackDetail.intro,
          fallbackDetail.conclusions[rowIndex % fallbackDetail.conclusions.length] ?? "默认分析文案",
        ],
        actions: fallbackDetail.actions,
      },
    })),
  }));

  const metricTitle =
    metric === "revenue" ? "收入分析" : metric === "profit" ? "利润分析" : "ROI 分析";

  return {
    key: metric,
    title: metricTitle,
    subtitle: "当前主数据链路暂时不可用，先展示最近一版默认分析内容，避免报告页空白。",
    accent: "默认分析文案",
    primaryQuestion:
      metric === "roi"
        ? "当前哪些经营动作值得继续投，哪些动作应该先止损？"
        : "当前哪些对象在支撑结果，哪些对象正在拖累经营判断？",
    summary:
      metric === "roi"
        ? "ROI 主链路恢复前，先沿用默认经营判断，至少保证决策页仍然可读。"
        : "对象化主链路恢复前，先沿用最近一版默认分析，避免页面只剩空壳。",
    statuses: fallbackDetail.statuses as TodayReportStatus[],
    summaryMetrics: fallbackDetail.metrics.slice(0, 4).map((metricItem) => ({
      label: metricItem.label,
      value: metricItem.value,
      unit: metricItem.unit,
    })),
    breakdowns: fallbackDetail.tables.map((table, index) => ({
      key: `${metric}-fallback-breakdown-${index + 1}`,
      title: table.title,
      summary: `当前先保留默认分析结构，正式对象证据恢复后会替换为“拆解 + 对象证据”双栏。`,
      rows: table.rows.slice(0, 3).map((row) => ({
        label: row[0] ?? "对象",
        value: row[1] ?? "—",
        meta: row.slice(2).join(" / ") || "默认分析文案",
      })),
      relatedGroupKeys: [`${metric}-fallback-group-${index + 1}`],
    })),
    groups: fallbackGroups,
    actions: fallbackDetail.actions,
  };
}

async function loadDecisionObjectData(
  shop: string,
  selectedCountry: string,
  now: Date,
): Promise<DecisionObjectData> {
  const costConfig = await getShopCostConfig(shop);
  const skuCostMap = await loadSkuCostMap(shop);
  const todayStart = startOfUtcDay(now);
  const since = addDays(todayStart, -7);
  const orderWhere =
    selectedCountry === TODAY_ALL_COUNTRIES
      ? {
          shop,
          status: { not: "cancelled" },
          createdAt: { gte: since, lt: todayStart },
        }
      : {
          shop,
          status: { not: "cancelled" },
          createdAt: { gte: since, lt: todayStart },
          OR: [
            { shippingCountryCode: selectedCountry },
            { billingCountryCode: selectedCountry },
          ],
        };

  const [orders, refunds, refundLineItems] = await Promise.all([
    prisma.shopOrder.findMany({
      where: orderWhere,
      select: {
        shopifyOrderId: true,
        orderNumber: true,
        createdAt: true,
        totalPrice: true,
        currency: true,
        sourceName: true,
        referringSite: true,
        utmSource: true,
        isFirstOrder: true,
        shippingCountryCode: true,
        billingCountryCode: true,
        lineItems: {
          select: {
            lineItemId: true,
            inventoryItemId: true,
            variantId: true,
            productId: true,
            title: true,
            variantTitle: true,
            sku: true,
            quantity: true,
            price: true,
            totalDiscount: true,
          },
        },
      },
    }),
    prisma.shopRefund.findMany({
      where: {
        shop,
        processedAt: { gte: since, lt: todayStart },
        ...(selectedCountry === TODAY_ALL_COUNTRIES
          ? {}
          : {
              order: {
                is: {
                  OR: [
                    { shippingCountryCode: selectedCountry },
                    { billingCountryCode: selectedCountry },
                  ],
                },
              },
            }),
      },
      select: {
        refundAmount: true,
        shopifyOrderId: true,
      },
    }),
    prisma.shopRefundLineItem.findMany({
      where: {
        shop,
        refund: { is: { processedAt: { gte: since, lt: todayStart } } },
        ...(selectedCountry === TODAY_ALL_COUNTRIES
          ? {}
          : {
              order: {
                is: {
                  OR: [
                    { shippingCountryCode: selectedCountry },
                    { billingCountryCode: selectedCountry },
                  ],
                },
              },
            }),
      },
      select: {
        lineItemId: true,
        subtotal: true,
      },
    }),
  ]);

  const refundByOrder = new Map<string, number>();
  for (const refund of refunds) {
    refundByOrder.set(refund.shopifyOrderId, (refundByOrder.get(refund.shopifyOrderId) ?? 0) + refund.refundAmount);
  }

  const refundByLineItem = new Map<string, number>();
  for (const line of refundLineItems) {
    refundByLineItem.set(line.lineItemId, (refundByLineItem.get(line.lineItemId) ?? 0) + line.subtotal);
  }

  const margin = Math.max(0, Math.min(100, costConfig.defaultGrossMarginPercent)) / 100;
  const paymentFeePercent = costConfig.paymentFeePercent / 100;
  const paymentFeeFixed = costConfig.paymentFeeFixed;
  const productMap = new Map<string, ProductAggregate>();
  const orderRows: OrderAggregate[] = [];

  for (const order of orders as DecisionOrder[]) {
    const channel = classifyChannel(order);
    const channelLabel = String(channel);
    const paymentFees = order.totalPrice * paymentFeePercent + paymentFeeFixed;
    const lineRevenueTotal = order.lineItems.reduce(
      (sum, line) => sum + Math.max(0, line.price * line.quantity - line.totalDiscount),
      0,
    );
    const refundLoss = refundByOrder.get(order.shopifyOrderId) ?? 0;
    let orderCogs = 0;
    const productKeysInOrder = new Set<string>();

    for (const line of order.lineItems) {
      const lineRevenue = Math.max(0, line.price * line.quantity - line.totalDiscount);
      const unitCost =
        (line.inventoryItemId ? skuCostMap.get(line.inventoryItemId) : undefined) ??
        (line.sku ? skuCostMap.get(`sku:${line.sku}`) : undefined) ??
        (line.variantId ? skuCostMap.get(`variant:${line.variantId}`) : undefined);
      const cogs = unitCost !== undefined ? unitCost * line.quantity : lineRevenue * (1 - margin);
      const feeShare = lineRevenueTotal > 0 ? paymentFees * (lineRevenue / lineRevenueTotal) : 0;
      const lineRefundLoss = refundByLineItem.get(line.lineItemId) ?? 0;
      const lineEstimatedProfit = lineRevenue - cogs - feeShare - lineRefundLoss;
      orderCogs += cogs;

      const productKey = line.productId ?? line.sku ?? line.title;
      const productTitle = line.variantTitle ? `${line.title} / ${line.variantTitle}` : line.title;
      const existing = productMap.get(productKey);
      const next: ProductAggregate = existing ?? {
        key: productKey,
        title: productTitle,
        quantity: 0,
        orderCount: 0,
        revenue: 0,
        discountCost: 0,
        refundLoss: 0,
        estimatedProfit: 0,
        estimatedMargin: 0,
      };
      next.quantity += line.quantity;
      next.revenue += lineRevenue;
      next.discountCost += line.totalDiscount;
      next.refundLoss += lineRefundLoss;
      next.estimatedProfit += lineEstimatedProfit;
      if (!productKeysInOrder.has(productKey)) {
        next.orderCount += 1;
        productKeysInOrder.add(productKey);
      }
      productMap.set(productKey, next);
    }

    const orderEstimatedProfit = order.totalPrice - orderCogs - paymentFees - refundLoss;
    orderRows.push({
      key: order.shopifyOrderId,
      title: `#${order.orderNumber}`,
      revenue: order.totalPrice,
      refundLoss,
      estimatedProfit: orderEstimatedProfit,
      estimatedMargin: safeDivide(orderEstimatedProfit, order.totalPrice || 1),
      itemCount: order.lineItems.reduce((sum, line) => sum + line.quantity, 0),
      channelLabel,
      isFirstOrder: order.isFirstOrder,
    });
  }

  const products = Array.from(productMap.values()).map((product) => ({
    ...product,
    estimatedMargin: safeDivide(product.estimatedProfit, product.revenue || 1),
  }));

  return {
    currency: orders[0]?.currency ?? "USD",
    products: products.sort((left, right) => right.revenue - left.revenue),
    orders: orderRows.sort((left, right) => right.revenue - left.revenue),
  };
}

function toSummaryMetric(label: string, value: string): TodaySummaryMetric {
  return { label, value };
}

function buildProductObjectCard(product: ProductAggregate, currency: string, reportTitle: string): TodayObjectCard {
  const marginLabel = formatPercent(product.estimatedMargin);
  return {
    id: product.key,
    title: product.title,
    objectType: "product",
    metrics: [
      toSummaryMetric("收入", formatCurrency(product.revenue, currency)),
      toSummaryMetric("估算利润", formatCurrency(product.estimatedProfit, currency)),
      toSummaryMetric("利润率", marginLabel),
    ],
    summary:
      product.estimatedProfit > 0
        ? "这类商品既带收入，也留下了利润，适合作为当前继续放量的候选。"
        : "这类商品表面上还有收入，但利润质量已经明显偏弱，继续放量价值有限。",
    primaryActionLabel: product.estimatedProfit > 0 ? "查看放量理由" : "查看止损理由",
    report: {
      title: product.title,
      subtitle: `${reportTitle} / 商品对象`,
      headlineMetrics: [
        toSummaryMetric("收入", formatCurrency(product.revenue, currency)),
        toSummaryMetric("估算利润", formatCurrency(product.estimatedProfit, currency)),
        toSummaryMetric("退款损耗", formatCurrency(product.refundLoss, currency)),
        toSummaryMetric("利润率", marginLabel),
      ],
      conclusion:
        product.estimatedProfit > 0
          ? "这个商品当前仍然是正向经营样本，更值得继续承接流量和订单。"
          : "这个商品已经在吞利润，下一步应该先确认是折扣、退款还是成本结构在拖累结果。",
      analysisPoints: [
        `最近 7 天收入 ${formatCurrency(product.revenue, currency)}，估算利润 ${formatCurrency(product.estimatedProfit, currency)}。`,
        `退款损耗 ${formatCurrency(product.refundLoss, currency)}，利润率 ${marginLabel}。`,
        "建议先结合对应来源和订单结构判断，是继续放量、控制折扣，还是优先止损。",
      ],
      actions: [
        {
          title: product.estimatedProfit > 0 ? "继续放量前先看来源质量" : "先复核折扣与退款结构",
          detail: product.estimatedProfit > 0 ? "确认它带来的收入是不是来自健康来源。" : "不要把低质量增长继续放大。",
          priority: "P0",
        },
        {
          title: "联动订单对象一起看",
          detail: "把高价值订单和异常订单一起对照，确认利润是被谁留下或吞掉了。",
          priority: "P1",
        },
      ],
    },
  };
}

function buildOrderObjectCard(order: OrderAggregate, currency: string, reportTitle: string): TodayObjectCard {
  return {
    id: order.key,
    title: order.title,
    objectType: "order",
    metrics: [
      toSummaryMetric("订单金额", formatCurrency(order.revenue, currency)),
      toSummaryMetric("估算利润", formatCurrency(order.estimatedProfit, currency)),
      toSummaryMetric("退款损耗", formatCurrency(order.refundLoss, currency)),
    ],
    summary:
      order.estimatedProfit > 0
        ? "这笔订单是当前结果里的健康样本，更适合继续追溯商品组合与来源。"
        : "这笔订单已经在吞利润，优先看退款、折扣或来源质量。",
    primaryActionLabel: order.estimatedProfit > 0 ? "查看健康样本" : "查看异常原因",
    report: {
      title: order.title,
      subtitle: `${reportTitle} / 订单对象`,
      headlineMetrics: [
        toSummaryMetric("订单金额", formatCurrency(order.revenue, currency)),
        toSummaryMetric("估算利润", formatCurrency(order.estimatedProfit, currency)),
        toSummaryMetric("退款损耗", formatCurrency(order.refundLoss, currency)),
        toSummaryMetric("来源", order.channelLabel),
      ],
      conclusion:
        order.estimatedProfit > 0
          ? "这笔订单是值得复制的健康样本，适合继续追溯商品组合和来源。"
          : "这笔订单说明成交并不等于留下利润，应该优先排查退款与低质量来源。",
      analysisPoints: [
        `订单金额 ${formatCurrency(order.revenue, currency)}，估算利润 ${formatCurrency(order.estimatedProfit, currency)}。`,
        `退款损耗 ${formatCurrency(order.refundLoss, currency)}，来源 ${order.channelLabel}。`,
        "建议把它和同来源订单一起看，确认是个体异常还是结构性问题。",
      ],
      actions: [
        {
          title: order.estimatedProfit > 0 ? "复核可复制条件" : "先排查退款与折扣",
          detail: order.estimatedProfit > 0 ? "确认这笔订单的商品组合和来源是否可持续复用。" : "先止住这类订单继续吞利润。",
          priority: "P0",
        },
        {
          title: "联动商品对象一起看",
          detail: "订单对象更适合解释收入质量，商品对象更适合判断是否值得继续卖。",
          priority: "P1",
        },
      ],
    },
  };
}

function buildChannelObjectCard(
  channel: Awaited<ReturnType<typeof computeChannelRoi>>["channels"][number],
  currency: string,
): TodayObjectCard {
  return {
    id: channel.channelKey,
    title: channel.label,
    objectType: "channel",
    metrics: [
      toSummaryMetric("收入", formatCurrency(channel.revenue, currency)),
      toSummaryMetric("贡献利润", formatCurrency(channel.contributionProfit, currency)),
      toSummaryMetric("新客占比", `${channel.customers.newOrderShare}%`),
    ],
    summary:
      channel.contributionProfit > 0
        ? "这个渠道当前仍然在留下利润，更适合继续看流量质量和客户质量。"
        : "这个渠道已经接近低质量投入，应该先排查回报被谁拖弱了。",
    primaryActionLabel: channel.contributionProfit > 0 ? "查看支撑原因" : "查看低效原因",
    report: {
      title: channel.label,
      subtitle: "ROI 报告 / 渠道对象",
      headlineMetrics: [
        toSummaryMetric("收入", formatCurrency(channel.revenue, currency)),
        toSummaryMetric("贡献利润", formatCurrency(channel.contributionProfit, currency)),
        toSummaryMetric("退款损耗", formatCurrency(channel.refundLoss, currency)),
        toSummaryMetric("新客占比", `${channel.customers.newOrderShare}%`),
      ],
      conclusion:
        channel.contributionProfit > 0
          ? "这个渠道仍然能留下利润，但仍需确认是不是靠健康对象在支撑。"
          : "这个渠道的问题不是有没有收入，而是回报质量已经开始变弱。",
      analysisPoints: [
        `收入 ${formatCurrency(channel.revenue, currency)}，贡献利润 ${formatCurrency(channel.contributionProfit, currency)}。`,
        `退款损耗 ${formatCurrency(channel.refundLoss, currency)}，新客占比 ${channel.customers.newOrderShare}%。`,
        "下一步更适合继续看这个渠道带来的高价值订单和异常损耗订单。",
      ],
      actions: [
        {
          title: channel.contributionProfit > 0 ? "继续承接健康对象" : "先收紧低效投入",
          detail: channel.contributionProfit > 0 ? "优先保留真正能留下利润的流量。" : "避免继续把预算压在低质量回报上。",
          priority: "P0",
        },
        {
          title: "联动订单对象一起看",
          detail: "渠道只解释来源质量，订单更能解释利润为什么没留下来。",
          priority: "P1",
        },
      ],
    },
  };
}

type RevenueFocus = "revenue" | "orders" | "aov";

type ProfitFocus = "profit" | "cost" | "margin";

type RoiFocus = "roi" | "channels" | "loss" | "layers";

function normalizeRevenueFocus(focus?: string | null): RevenueFocus {
  return focus === "orders" || focus === "aov" ? focus : "revenue";
}

function normalizeProfitFocus(focus?: string | null): ProfitFocus {
  return focus === "cost" || focus === "margin" ? focus : "profit";
}

function normalizeRoiFocus(focus?: string | null): RoiFocus {
  return focus === "channels" || focus === "loss" || focus === "layers" ? focus : "roi";
}

function buildRevenueReport(
  orderScope: OrderScopeData,
  objectData: DecisionObjectData,
  selectedCountryLabel: string,
  focus?: string | null,
): TodayDecisionReport {
  const normalizedFocus = normalizeRevenueFocus(focus);
  const topProfitableProducts = [...objectData.products]
    .filter((product) => product.estimatedProfit > 0)
    .sort((left, right) => right.estimatedProfit - left.estimatedProfit)
    .slice(0, 3);
  const lowQualityGrowthProducts = [...objectData.products]
    .filter((product) => product.revenue > 0 && product.estimatedMargin < 0.12)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);
  const highValueOrders = [...objectData.orders]
    .filter((order) => order.estimatedProfit > 0)
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);
  const highRefundOrders = [...objectData.orders]
    .filter((order) => order.refundLoss > 0)
    .sort((left, right) => right.refundLoss - left.refundLoss)
    .slice(0, 3);

  const revenueDelta = safeDivide(
    orderScope.sevenDayTotals.revenue - comparableBaseline(orderScope.baselineTotals.revenue),
    comparableBaseline(orderScope.baselineTotals.revenue) || 1,
  );
  const profitValue = estimatedProfit(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const profitMarginValue = safeDivide(profitValue, orderScope.sevenDayTotals.revenue || 1);
  const ordersDelta = safeDivide(
    orderScope.sevenDayTotals.orders - comparableBaseline(orderScope.baselineTotals.orders),
    comparableBaseline(orderScope.baselineTotals.orders) || 1,
  );
  const aovValue = safeDivide(orderScope.sevenDayTotals.revenue, orderScope.sevenDayTotals.orders || 1);
  const baselineAov = safeDivide(
    comparableBaseline(orderScope.baselineTotals.revenue),
    comparableBaseline(orderScope.baselineTotals.orders) || 1,
  );
  const aovDelta = safeDivide(aovValue - baselineAov, baselineAov || 1);
  const repeatRevenue = objectData.orders
    .filter((order) => !order.isFirstOrder)
    .reduce((sum, order) => sum + order.revenue, 0);
  const firstOrderShare = safeDivide(orderScope.sevenDayTotals.firstOrders, orderScope.sevenDayTotals.orders || 1);

  const groups: TodayEvidenceGroup[] = [
    {
      key: "top_profitable_products",
      title: "Top 赚钱商品",
      tone: "positive",
      summary: "这组商品既带收入，也能留下利润，更适合继续承接健康流量。",
      items: topProfitableProducts.map((product) => buildProductObjectCard(product, objectData.currency, "收入分析")),
    },
    {
      key: "low_quality_growth_products",
      title: "Top 低质量增长商品",
      tone: "negative",
      summary: "这组商品表面上在制造增长，但利润质量偏弱，最容易把规模增长伪装成经营改善。",
      items: lowQualityGrowthProducts.map((product) => buildProductObjectCard(product, objectData.currency, "收入分析")),
    },
    {
      key: "high_value_orders",
      title: "Top 高价值订单",
      tone: "positive",
      summary: "这些订单更适合解释收入质量，值得继续追溯来源与商品组合。",
      items: highValueOrders.map((order) => buildOrderObjectCard(order, objectData.currency, "收入分析")),
    },
    {
      key: "high_refund_orders",
      title: "Top 高退款损耗订单",
      tone: "warning",
      summary: "这组订单说明成交并不等于留下利润，应该优先排查退款原因与来源质量。",
      items: highRefundOrders.map((order) => buildOrderObjectCard(order, objectData.currency, "收入分析")),
    },
  ];

  const report: TodayDecisionReport = {
    key: "revenue",
    title: "收入分析",
    subtitle: `当前查看范围：${selectedCountryLabel}。先区分真增长和假增长，再继续看哪些商品和订单值得跟。`,
    accent: `${selectedCountryLabel} / 近 7 天`,
    primaryQuestion: "最近的收入增长到底是不是健康增长，哪些商品和订单在支撑或拖累结果？",
    summary:
      revenueDelta >= 0
        ? "最近 7 天收入还在增长，但不能只看规模，必须继续看利润质量有没有同步改善。"
        : "最近 7 天收入已经承压，当前更应该先找拖累收入质量的对象，而不是继续冲量。",
    statuses: [
      {
        label: "收入规模",
        status: revenueDelta <= -0.1 ? "risk" : revenueDelta < 0 ? "watch" : "healthy",
        detail: `近 7 天收入 ${formatCurrency(orderScope.sevenDayTotals.revenue, orderScope.currency)}，较基准 ${formatDeltaPercent(revenueDelta)}。`,
      },
      {
        label: "利润质量",
        status: profitMarginValue < 0.05 ? "risk" : profitMarginValue < 0.1 ? "watch" : "healthy",
        detail: `估算利润率 ${formatPercent(profitMarginValue)}，要防止把低质量增长误判成经营改善。`,
      },
      {
        label: "退款损耗",
        status:
          safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1) > 0.08
            ? "risk"
            : safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1) > 0.04
              ? "watch"
              : "healthy",
        detail: `近 7 天退款损耗 ${formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency)}。`,
      },
    ],
    summaryMetrics: [
      toSummaryMetric("近 7 天收入", formatCurrency(orderScope.sevenDayTotals.revenue, orderScope.currency)),
      toSummaryMetric("收入变化", formatDeltaPercent(revenueDelta)),
      toSummaryMetric("估算利润", formatCurrency(profitValue, orderScope.currency)),
      toSummaryMetric("利润率", formatPercent(profitMarginValue)),
    ],
    breakdowns: [
      {
        key: "revenue-by-product",
        title: "收入拆到商品",
        summary: "先确认钱主要从哪些商品来，再判断这些商品是在带来健康增长，还是只是在放大规模。",
        rows: [
          {
            label: "Top 赚钱商品",
            value: formatCurrency(topProfitableProducts.reduce((sum, item) => sum + item.revenue, 0), objectData.currency),
            meta: "收入和利润都相对健康，适合继续放量。",
          },
          {
            label: "低质量增长商品",
            value: formatCurrency(lowQualityGrowthProducts.reduce((sum, item) => sum + item.revenue, 0), objectData.currency),
            meta: "有收入，但利润空间偏弱，最值得继续拆清楚。",
          },
          {
            label: "长尾商品收入",
            value: formatCurrency(Math.max(0, orderScope.sevenDayTotals.revenue - topProfitableProducts.reduce((sum, item) => sum + item.revenue, 0) - lowQualityGrowthProducts.reduce((sum, item) => sum + item.revenue, 0)), objectData.currency),
            meta: "分散贡献，当前先不作为第一优先级。",
          },
        ],
        relatedGroupKeys: ["top_profitable_products", "low_quality_growth_products"],
      },
      {
        key: "revenue-by-order",
        title: "收入拆到订单",
        summary: "订单更适合回答收入质量问题，帮助确认哪些成交值得复制，哪些成交后也留不住价值。",
        rows: [
          {
            label: "高价值订单收入",
            value: formatCurrency(highValueOrders.reduce((sum, item) => sum + item.revenue, 0), objectData.currency),
            meta: "高客单、低损耗，更适合作为健康样本继续追溯。",
          },
          {
            label: "高退款损耗订单",
            value: formatCurrency(highRefundOrders.reduce((sum, item) => sum + item.refundLoss, 0), objectData.currency),
            meta: "成交之后利润继续流失，应该优先排查。",
          },
          {
            label: "复购订单收入",
            value: formatCurrency(objectData.orders.filter((order) => !order.isFirstOrder).reduce((sum, item) => sum + item.revenue, 0), objectData.currency),
            meta: "复购订单更能解释收入质量有没有稳定基础。",
          },
        ],
        relatedGroupKeys: ["high_value_orders", "high_refund_orders"],
      },
    ],
    groups,
    actions: [
      {
        title: "先区分真增长和假增长",
        detail: "优先看低质量增长商品，不要把规模增长直接当成经营改善。",
        priority: "P0",
      },
      {
        title: "跟进高退款损耗订单",
        detail: "把成交后利润留不住的订单单独拉出来看原因。",
        priority: "P1",
      },
      {
        title: "追溯高价值样本",
        detail: "从健康商品和高价值订单里找可复制的来源与商品组合。",
        priority: "P2",
      },
    ],
  };

  if (normalizedFocus === "orders") {
    return {
      ...report,
      title: "订单分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点判断订单规模背后，哪些订单结构值得继续复制。`,
      accent: "焦点：订单数",
      primaryQuestion: "最近订单数的变化，是由健康订单在支撑，还是由低质量成交在堆规模？",
      summary:
        ordersDelta >= 0
          ? "订单数还在增长，但当前重点不是多了多少单，而是这些订单有没有留下利润。"
          : "订单数已经走弱，当前更应该先判断是来源质量变差，还是高价值订单在减少。",
      statuses: [
        {
          label: "订单规模",
          status: ordersDelta <= -0.1 ? "risk" : ordersDelta < 0 ? "watch" : "healthy",
          detail: `近 7 天订单 ${formatInteger(orderScope.sevenDayTotals.orders)}，较基准 ${formatDeltaPercent(ordersDelta)}。`,
        },
        {
          label: "首单占比",
          status: firstOrderShare > 0.7 ? "watch" : "healthy",
          detail: `首单占比 ${formatPercent(firstOrderShare)}，要确认增长是不是建立在健康留存上。`,
        },
        {
          label: "订单质量",
          status: highRefundOrders.length > 0 ? "watch" : "healthy",
          detail: "订单数增长不能掩盖高退款损耗订单，否则规模不会转成真实经营改善。",
        },
      ],
      summaryMetrics: [
        toSummaryMetric("近 7 天订单", formatInteger(orderScope.sevenDayTotals.orders)),
        toSummaryMetric("订单变化", formatDeltaPercent(ordersDelta)),
        toSummaryMetric("复购订单收入", formatCurrency(repeatRevenue, orderScope.currency)),
        toSummaryMetric("首单占比", formatPercent(firstOrderShare)),
      ],
      breakdowns: [
        report.breakdowns[1]!,
        {
          ...report.breakdowns[0]!,
          title: "订单变化对应的商品结构",
          summary: "订单规模本身不够，仍然要追到商品层，确认增长是不是被低质量商品带偏了。",
        },
      ],
      actions: [
        {
          title: "先看高价值订单和高损耗订单",
          detail: "不要只看单量，把值得复制和需要止损的订单先分开。",
          priority: "P0",
        },
        {
          title: "追溯订单背后的商品结构",
          detail: "订单健康只是结果，还要继续确认哪些商品在支撑这些订单。",
          priority: "P1",
        },
        {
          title: "单独盯首单占比",
          detail: "新增订单占比过高时，要确认增长是不是能留下复购基础。",
          priority: "P2",
        },
      ],
    };
  }

  if (normalizedFocus === "aov") {
    return {
      ...report,
      title: "客单价分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点判断高客单是不是健康样本，而不是一次性的虚高订单。`,
      accent: "焦点：客单价",
      primaryQuestion: "最近客单价的变化，到底来自更健康的商品组合，还是来自少量不可复制的订单样本？",
      summary:
        aovDelta >= 0
          ? "客单价仍在走高，但更重要的是判断高客单有没有同步留下利润。"
          : "客单价已经走弱，当前更应该先确认是商品组合变化，还是高价值订单在减少。",
      statuses: [
        {
          label: "客单价",
          status: aovDelta <= -0.1 ? "risk" : aovDelta < 0 ? "watch" : "healthy",
          detail: `近 7 天客单价 ${formatCurrency(aovValue, orderScope.currency)}，较基准 ${formatDeltaPercent(aovDelta)}。`,
        },
        {
          label: "高客单样本",
          status: highValueOrders.length >= 2 ? "healthy" : "watch",
          detail: "高价值订单越少，越要小心把少量样本误判成整体客单改善。",
        },
        {
          label: "利润质量",
          status: profitMarginValue < 0.1 ? "watch" : "healthy",
          detail: `估算利润率 ${formatPercent(profitMarginValue)}，高客单不等于高质量。`,
        },
      ],
      summaryMetrics: [
        toSummaryMetric("近 7 天客单价", formatCurrency(aovValue, orderScope.currency)),
        toSummaryMetric("客单价变化", formatDeltaPercent(aovDelta)),
        toSummaryMetric("高价值订单收入", formatCurrency(highValueOrders.reduce((sum, item) => sum + item.revenue, 0), orderScope.currency)),
        toSummaryMetric("估算利润率", formatPercent(profitMarginValue)),
      ],
      breakdowns: [
        {
          ...report.breakdowns[1]!,
          title: "客单价拆到订单",
          summary: "客单价最适合先看订单对象，区分高价值样本和高损耗样本是不是同一类订单。",
        },
        {
          ...report.breakdowns[0]!,
          title: "客单价对应的商品结构",
          summary: "订单端看到高客单之后，还要继续确认是不是由健康商品组合在支撑。",
        },
      ],
      actions: [
        {
          title: "先验证高客单订单是不是健康样本",
          detail: "先看高价值订单有没有同步留下利润，而不是只看金额大。",
          priority: "P0",
        },
        {
          title: "追溯高客单背后的商品组合",
          detail: "确认高客单是不是来自值得继续放量的商品结构。",
          priority: "P1",
        },
        {
          title: "排查高客单中的高损耗订单",
          detail: "避免被少量高金额但低质量的订单带偏判断。",
          priority: "P2",
        },
      ],
    };
  }

  return report;
}

function buildProfitReport(
  orderScope: OrderScopeData,
  objectData: DecisionObjectData,
  selectedCountryLabel: string,
  focus?: string | null,
): TodayDecisionReport {
  const normalizedFocus = normalizeProfitFocus(focus);
  const topProfitProducts = [...objectData.products]
    .filter((product) => product.estimatedProfit > 0)
    .sort((left, right) => right.estimatedProfit - left.estimatedProfit)
    .slice(0, 3);
  const lossProducts = [...objectData.products]
    .filter((product) => product.estimatedProfit <= 0)
    .sort((left, right) => left.estimatedProfit - right.estimatedProfit)
    .slice(0, 3);
  const healthyOrders = [...objectData.orders]
    .filter((order) => order.estimatedProfit > 0)
    .sort((left, right) => right.estimatedProfit - left.estimatedProfit)
    .slice(0, 3);
  const abnormalLossOrders = [...objectData.orders]
    .filter((order) => order.estimatedProfit <= 0 || order.refundLoss > 0)
    .sort((left, right) => (right.refundLoss - left.refundLoss) || (left.estimatedProfit - right.estimatedProfit))
    .slice(0, 3);

  const profitValue = estimatedProfit(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const baselineProfit = comparableBaseline(estimatedProfit(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent));
  const profitDelta = safeDivide(profitValue - baselineProfit, baselineProfit || 1);
  const marginValue = safeDivide(profitValue, orderScope.sevenDayTotals.revenue || 1);
  const costValue = estimatedCost(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const baselineCost = comparableBaseline(estimatedCost(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent));
  const costDelta = safeDivide(costValue - baselineCost, baselineCost || 1);
  const marginDelta = marginValue - safeDivide(
    estimatedProfit(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent),
    orderScope.baselineTotals.revenue || 1,
  );
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const lossProductRevenue = lossProducts.reduce((sum, item) => sum + item.revenue, 0);
  const lossProductProfit = lossProducts.reduce((sum, item) => sum + item.estimatedProfit, 0);

  const report: TodayDecisionReport = {
    key: "profit",
    title: "利润分析",
    subtitle: `当前查看范围：${selectedCountryLabel}。利润页要回答的是卖出去的钱最后留下多少。`,
    accent: `${selectedCountryLabel} / 近 7 天`,
    primaryQuestion: "最近的利润到底由哪些商品和订单留下来，哪些对象正在吞掉经营改善？",
    summary:
      profitDelta >= 0
        ? "利润仍然为正，但更重要的是找出哪些对象真的在留下利润，而不是只看收入规模。"
        : "利润已经落后于基准，当前优先级不是继续做大规模，而是先止住吞利润的对象。",
    statuses: [
      {
        label: "利润结果",
        status: profitValue <= 0 ? "risk" : profitDelta < 0 ? "watch" : "healthy",
        detail: `近 7 天估算利润 ${formatCurrency(profitValue, orderScope.currency)}，较基准 ${formatDeltaPercent(profitDelta)}。`,
      },
      {
        label: "利润率",
        status: marginValue < 0.05 ? "risk" : marginValue < 0.1 ? "watch" : "healthy",
        detail: `当前估算利润率 ${formatPercent(marginValue)}。`,
      },
      {
        label: "损耗对象",
        status: abnormalLossOrders.length >= 3 ? "watch" : "healthy",
        detail: "当前已经能定位到具体吞利润的商品和订单对象，应该优先处理它们。",
      },
    ],
    summaryMetrics: [
      toSummaryMetric("估算利润", formatCurrency(profitValue, orderScope.currency)),
      toSummaryMetric("利润变化", formatDeltaPercent(profitDelta)),
      toSummaryMetric("利润率", formatPercent(marginValue)),
      toSummaryMetric("退款损耗", formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency)),
    ],
    breakdowns: [
      {
        key: "profit-by-product",
        title: "利润拆到商品",
        summary: "利润页最适合先看商品对象，快速识别哪些商品真的在留下经营结果。",
        rows: [
          {
            label: "高利润商品",
            value: formatCurrency(topProfitProducts.reduce((sum, item) => sum + item.estimatedProfit, 0), objectData.currency),
            meta: "这些商品是当前最值得继续放量的正向样本。",
          },
          {
            label: "亏损商品",
            value: formatCurrency(lossProducts.reduce((sum, item) => sum + item.estimatedProfit, 0), objectData.currency),
            meta: "它们会把收入规模伪装成改善，应该优先止损。",
          },
          {
            label: "长尾利润",
            value: formatCurrency(objectData.products.reduce((sum, item) => sum + item.estimatedProfit, 0) - topProfitProducts.reduce((sum, item) => sum + item.estimatedProfit, 0) - lossProducts.reduce((sum, item) => sum + item.estimatedProfit, 0), objectData.currency),
            meta: "分散贡献，当前先作为补充观察。",
          },
        ],
        relatedGroupKeys: ["top_profit_products", "loss_products"],
      },
      {
        key: "profit-by-order",
        title: "利润拆到订单",
        summary: "订单对象更适合解释利润为什么留下来，或者为什么成交后还是留不住。",
        rows: [
          {
            label: "健康订单利润",
            value: formatCurrency(healthyOrders.reduce((sum, item) => sum + item.estimatedProfit, 0), objectData.currency),
            meta: "高客单、低损耗，更适合复制。",
          },
          {
            label: "异常损耗订单",
            value: formatCurrency(abnormalLossOrders.reduce((sum, item) => sum + item.refundLoss, 0), objectData.currency),
            meta: "退款和低质量来源正在继续吞利润。",
          },
          {
            label: "退款损耗",
            value: formatCurrency(orderScope.sevenDayTotals.refundLoss, objectData.currency),
            meta: "成交后利润流失要单独盯，不要被收入总量掩盖。",
          },
        ],
        relatedGroupKeys: ["healthy_orders", "abnormal_loss_orders"],
      },
    ],
    groups: [
      {
        key: "top_profit_products",
        title: "Top 高利润商品",
        tone: "positive",
        summary: "这些商品正在留下最明确的经营结果，更适合作为继续放量的主对象。",
        items: topProfitProducts.map((product) => buildProductObjectCard(product, objectData.currency, "利润分析")),
      },
      {
        key: "loss_products",
        title: "Top 亏损商品",
        tone: "negative",
        summary: "这些商品已经开始吞利润，不应该继续被规模增长掩盖。",
        items: lossProducts.map((product) => buildProductObjectCard(product, objectData.currency, "利润分析")),
      },
      {
        key: "healthy_orders",
        title: "Top 健康订单",
        tone: "positive",
        summary: "健康订单最能解释哪些成交模式真正值得继续复制。",
        items: healthyOrders.map((order) => buildOrderObjectCard(order, objectData.currency, "利润分析")),
      },
      {
        key: "abnormal_loss_orders",
        title: "Top 异常损耗订单",
        tone: "warning",
        summary: "这些订单说明成交并不等于留下利润，优先排查损耗原因。",
        items: abnormalLossOrders.map((order) => buildOrderObjectCard(order, objectData.currency, "利润分析")),
      },
    ],
    actions: [
      {
        title: "先止住吞利润的商品",
        detail: "优先排查亏损商品，别让低质量增长继续扩大。",
        priority: "P0",
      },
      {
        title: "跟进异常损耗订单",
        detail: "把退款和异常损耗订单单独拉出来看原因。",
        priority: "P1",
      },
      {
        title: "复制健康利润样本",
        detail: "从高利润商品和健康订单里找值得继续放大的对象。",
        priority: "P2",
      },
    ],
  };

  if (normalizedFocus === "cost") {
    return {
      ...report,
      title: "成本分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点看成本有没有跑到收入前面，以及成本主要压在哪些对象上。`,
      accent: "焦点：成本",
      primaryQuestion: "最近的成本压力主要来自哪里，哪些商品和订单正在把成本带到危险位置？",
      summary:
        costDelta > 0
          ? "成本正在上升，但关键不只是成本多了多少，而是哪些对象在把利润空间吃掉。"
          : "总成本暂时没有继续抬升，但仍要确认高损耗对象有没有继续吞利润。",
      statuses: [
        {
          label: "总成本",
          status: costDelta >= 0.15 ? "risk" : costDelta >= 0.05 ? "watch" : "healthy",
          detail: `近 7 天估算成本 ${formatCurrency(costValue, orderScope.currency)}，较基准 ${formatDeltaPercent(costDelta)}。`,
        },
        {
          label: "折扣压力",
          status: discountShare > 0.15 ? "risk" : discountShare > 0.08 ? "watch" : "healthy",
          detail: `折扣占收入 ${formatPercent(discountShare)}。`,
        },
        {
          label: "退款损耗",
          status: refundShare > 0.08 ? "risk" : refundShare > 0.04 ? "watch" : "healthy",
          detail: `退款损耗占收入 ${formatPercent(refundShare)}。`,
        },
      ],
      summaryMetrics: [
        toSummaryMetric("估算成本", formatCurrency(costValue, orderScope.currency)),
        toSummaryMetric("成本变化", formatDeltaPercent(costDelta)),
        toSummaryMetric("折扣占比", formatPercent(discountShare)),
        toSummaryMetric("退款损耗", formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency)),
      ],
      breakdowns: [
        {
          ...report.breakdowns[0]!,
          title: "成本拆到商品",
          summary: "成本页优先看亏损商品和低利润商品，确认是哪个对象把成本带到收入前面。",
          rows: [
            {
              label: "亏损商品收入",
              value: formatCurrency(lossProductRevenue, objectData.currency),
              meta: "这些商品仍在卖，但已经无法留下健康利润。",
            },
            {
              label: "亏损商品估算利润",
              value: formatCurrency(lossProductProfit, objectData.currency),
              meta: "负利润商品是当前成本压力最直接的对象证据。",
            },
            {
              label: "折扣成本",
              value: formatCurrency(orderScope.sevenDayTotals.discounts, objectData.currency),
              meta: "折扣是最典型的售前成本压力来源。",
            },
          ],
          relatedGroupKeys: ["loss_products", "top_profit_products"],
        },
        {
          ...report.breakdowns[1]!,
          title: "成本拆到订单",
          summary: "订单端更适合识别哪些成交之后仍在继续吞利润，尤其是退款损耗订单。",
          rows: [
            {
              label: "异常损耗订单退款",
              value: formatCurrency(abnormalLossOrders.reduce((sum, item) => sum + item.refundLoss, 0), objectData.currency),
              meta: "成交后的退款会继续吞掉已获得的利润。",
            },
            {
              label: "异常损耗订单估算利润",
              value: formatCurrency(abnormalLossOrders.reduce((sum, item) => sum + item.estimatedProfit, 0), objectData.currency),
              meta: "负利润订单应该先单独看，不要被整体收入掩盖。",
            },
            {
              label: "支付与售后压力",
              value: formatCurrency(orderScope.sevenDayTotals.paymentFees + orderScope.sevenDayTotals.refundLoss, objectData.currency),
              meta: "支付手续费与退款损耗都会直接压缩最终利润。",
            },
          ],
          relatedGroupKeys: ["abnormal_loss_orders"],
        },
      ],
      actions: [
        {
          title: "先处理亏损商品",
          detail: "把持续吞利润的商品先单独拉出来，不要继续用规模掩盖问题。",
          priority: "P0",
        },
        {
          title: "单独跟进高损耗订单",
          detail: "退款和售后损耗会直接把已成交的利润吃掉。",
          priority: "P1",
        },
        {
          title: "复核折扣策略",
          detail: "确认折扣有没有换来足够质量的增长，而不只是把利润先让掉。",
          priority: "P2",
        },
      ],
    };
  }

  if (normalizedFocus === "margin") {
    return {
      ...report,
      title: "利润率分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点看利润率为什么变化，以及哪些对象正在拖低整体质量。`,
      accent: "焦点：利润率",
      primaryQuestion: "最近利润率为什么变化，哪些商品和订单正在把整体经营质量往下拉？",
      summary:
        marginDelta >= 0
          ? "利润率暂时没有继续变差，但仍要确认改善是不是来自健康对象，而不是短期偶然样本。"
          : "利润率已经走弱，当前更应该先定位是谁在吞掉利润空间，而不是继续冲收入。",
      statuses: [
        {
          label: "利润率",
          status: marginValue < 0.05 ? "risk" : marginValue < 0.1 ? "watch" : "healthy",
          detail: `近 7 天利润率 ${formatPercent(marginValue)}，较基准 ${formatPercentPoints(marginDelta)}。`,
        },
        {
          label: "亏损商品拖累",
          status: lossProducts.length >= 2 ? "watch" : "healthy",
          detail: "如果亏损商品持续存在，整体利润率就很难稳定改善。",
        },
        {
          label: "退款与折扣压力",
          status: discountShare + refundShare > 0.2 ? "risk" : discountShare + refundShare > 0.12 ? "watch" : "healthy",
          detail: `折扣与退款合计占收入 ${formatPercent(discountShare + refundShare)}。`,
        },
      ],
      summaryMetrics: [
        toSummaryMetric("利润率", formatPercent(marginValue)),
        toSummaryMetric("利润率变化", formatPercentPoints(marginDelta)),
        toSummaryMetric("亏损商品收入", formatCurrency(lossProductRevenue, orderScope.currency)),
        toSummaryMetric("退款与折扣占比", formatPercent(discountShare + refundShare)),
      ],
      breakdowns: [
        {
          ...report.breakdowns[0]!,
          title: "利润率拆到商品",
          summary: "先从商品层识别哪些商品表面有收入，但质量已经开始把整体利润率往下拖。",
        },
        {
          ...report.breakdowns[1]!,
          title: "利润率拆到订单",
          summary: "订单端更适合判断低利润率是不是被退款损耗或异常成交结构拖出来的。",
        },
      ],
      actions: [
        {
          title: "优先排查亏损商品",
          detail: "利润率下滑时，先确认是不是少数对象正在持续吞利润。",
          priority: "P0",
        },
        {
          title: "跟进异常损耗订单",
          detail: "低利润率经常不是售前问题，成交后的损耗同样会继续拖累结果。",
          priority: "P1",
        },
        {
          title: "复核增长质量",
          detail: "不要为了收入增长接受长期偏低的利润率结构。",
          priority: "P2",
        },
      ],
    };
  }

  return report;
}

async function buildRoiDecisionReport(
  shop: string,
  selectedCountry: string,
  orderScope: OrderScopeData,
  objectData: DecisionObjectData,
  selectedCountryLabel: string,
  focus?: string | null,
): Promise<TodayDecisionReport> {
  const normalizedFocus = normalizeRoiFocus(focus);
  const costConfig = await getShopCostConfig(shop);
  const channelResult = await computeChannelRoi(shop, costConfig, new Date(), {
    countryCode: selectedCountry === TODAY_ALL_COUNTRIES ? null : selectedCountry,
  });
  const healthyChannels = channelResult.channels
    .filter((channel) => channel.contributionProfit > 0)
    .slice(0, 3);
  const weakChannels = [...channelResult.channels]
    .filter((channel) => channel.contributionProfit <= 0 || (channel.contributionMarginPercent ?? 0) < 8)
    .sort((left, right) => left.contributionProfit - right.contributionProfit)
    .slice(0, 3);
  const refundLossOrders = [...objectData.orders]
    .filter((order) => order.refundLoss > 0)
    .sort((left, right) => right.refundLoss - left.refundLoss)
    .slice(0, 3);
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const baselineReturn = estimatedReturnMultiple(orderScope.baselineTotals, orderScope.defaultGrossMarginPercent);
  const paidChannelRevenue = healthyChannels.reduce((sum, item) => sum + item.revenue, 0);
  const weakChannelRevenue = weakChannels.reduce((sum, item) => sum + item.revenue, 0);
  const lossOrderRefund = refundLossOrders.reduce((sum, item) => sum + item.refundLoss, 0);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const channelCount = channelResult.channels.length;

  const report: TodayDecisionReport = {
    key: "roi",
    title: "ROI 分析",
    subtitle: `当前查看范围：${selectedCountryLabel}。这里先判断哪些来源和对象真的在产生经营回报。`,
    accent: `${selectedCountryLabel} / 近 7 天 vs 前 30 天`,
    primaryQuestion: "最近的经营回报是被哪些渠道和对象支撑住的，哪些地方已经需要先止损？",
    summary:
      (shortTermReturn ?? 0) >= 1
        ? "当前仍然在赚钱，但 ROI 页最重要的是继续拆到渠道和损耗对象，而不是停在一个总倍数上。"
        : "当前短期经营回报已经偏弱，应该优先排查低效渠道和高损耗订单。",
    statuses: [
      {
        label: "短期经营回报",
        status:
          shortTermReturn == null || baselineReturn == null
            ? "watch"
            : shortTermReturn < baselineReturn * 0.85
              ? "risk"
              : shortTermReturn < baselineReturn * 0.95
                ? "watch"
                : "healthy",
        detail: `近 7 天 ${formatMultiple(shortTermReturn)}，前 30 天基准 ${formatMultiple(baselineReturn)}。`,
      },
      {
        label: "渠道质量",
        status: weakChannels.length > 0 ? "watch" : "healthy",
        detail: "当前已经可以看到哪些渠道在留下利润，哪些渠道只是把收入做出来却留不住价值。",
      },
      {
        label: "损耗对象",
        status: refundLossOrders.length > 0 ? "watch" : "healthy",
        detail: "高损耗订单会直接把表面回报拉低，应该和渠道一起看。",
      },
    ],
    summaryMetrics: [
      toSummaryMetric("短期经营回报", formatMultiple(shortTermReturn)),
      toSummaryMetric("前 30 天基准", formatMultiple(baselineReturn)),
      toSummaryMetric("折扣损耗", formatCurrency(orderScope.sevenDayTotals.discounts, orderScope.currency)),
      toSummaryMetric("退款损耗", formatCurrency(orderScope.sevenDayTotals.refundLoss, orderScope.currency)),
    ],
    breakdowns: [
      {
        key: "roi-by-channel",
        title: "ROI 拆到渠道",
        summary: "先确认哪些渠道真的在留下利润，哪些渠道虽然有收入，但回报质量已经变弱。",
        rows: [
          {
            label: "健康渠道收入",
            value: formatCurrency(healthyChannels.reduce((sum, item) => sum + item.revenue, 0), channelResult.currency),
            meta: "量和质相对均衡，更适合作为继续投的方向。",
          },
          {
            label: "低效渠道收入",
            value: formatCurrency(weakChannels.reduce((sum, item) => sum + item.revenue, 0), channelResult.currency),
            meta: "收入有了，但贡献利润已经开始偏弱。",
          },
          {
            label: "可归因收入占比",
            value: `${channelResult.attributedRevenueShare}%`,
            meta: "当前渠道判断基于 last-click 归因口径。",
          },
        ],
        relatedGroupKeys: ["healthy_channels", "weak_channels"],
      },
      {
        key: "roi-by-loss",
        title: "ROI 拆到损耗对象",
        summary: "ROI 下降不一定只发生在投放前段，成交后的退款和损耗也会继续吞掉结果。",
        rows: [
          {
            label: "退款损耗订单",
            value: formatCurrency(refundLossOrders.reduce((sum, item) => sum + item.refundLoss, 0), channelResult.currency),
            meta: "成交后损耗会继续压缩回报。",
          },
          {
            label: "折扣损耗",
            value: formatCurrency(orderScope.sevenDayTotals.discounts, channelResult.currency),
            meta: "折扣是典型的售前损耗，需要和渠道一起看。",
          },
          {
            label: "退款损耗",
            value: formatCurrency(orderScope.sevenDayTotals.refundLoss, channelResult.currency),
            meta: "退款问题应该单独看，不要被规模掩盖。",
          },
        ],
        relatedGroupKeys: ["refund_loss_orders"],
      },
    ],
    groups: [
      {
        key: "healthy_channels",
        title: "Top 健康渠道",
        tone: "positive",
        summary: "这些渠道当前仍然在留下利润，更适合作为继续承接健康对象的主方向。",
        items: healthyChannels.map((channel) => buildChannelObjectCard(channel, channelResult.currency)),
      },
      {
        key: "weak_channels",
        title: "Top 低效渠道",
        tone: "negative",
        summary: "这些渠道更像低质量投入，不应该只因为有收入就继续放量。",
        items: weakChannels.map((channel) => buildChannelObjectCard(channel, channelResult.currency)),
      },
      {
        key: "refund_loss_orders",
        title: "Top 高损耗订单",
        tone: "warning",
        summary: "这些订单解释了为什么 ROI 会在成交后继续变差。",
        items: refundLossOrders.map((order) => buildOrderObjectCard(order, objectData.currency, "ROI 分析")),
      },
    ],
    supplementaryGroups: [],
    actions: [
      {
        title: "先收紧低效渠道",
        detail: "不要继续把预算压在回报已经明显变弱的来源上。",
        priority: "P0",
      },
      {
        title: "跟进高损耗订单",
        detail: "成交后利润留不住时，ROI 会继续被拖弱。",
        priority: "P1",
      },
      {
        title: "继续放大健康渠道样本",
        detail: "优先把预算和注意力放回能留下利润的方向。",
        priority: "P2",
      },
    ],
  };

  if (normalizedFocus === "channels") {
    return {
      ...report,
      title: "渠道 ROI 分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点判断哪些渠道值得继续投，哪些渠道只是把收入做出来却留不住利润。`,
      accent: "焦点：渠道",
      primaryQuestion: "最近的经营回报主要由哪些渠道支撑，哪些渠道已经进入低质量投入？",
      summary:
        weakChannels.length > 0
          ? "当前已经能看到低效渠道，不要再让渠道收入掩盖贡献利润走弱。"
          : "当前渠道质量还算稳定，更适合继续识别哪些来源值得承接更多健康对象。",
      statuses: [
        {
          label: "渠道数量",
          status: channelCount > 0 ? "healthy" : "watch",
          detail: `当前已纳入 ${channelCount} 个渠道做 ROI 判断。`,
        },
        {
          label: "健康渠道",
          status: healthyChannels.length > 0 ? "healthy" : "watch",
          detail: `健康渠道收入 ${formatCurrency(paidChannelRevenue, channelResult.currency)}。`,
        },
        {
          label: "低效渠道",
          status: weakChannels.length >= 2 ? "risk" : weakChannels.length === 1 ? "watch" : "healthy",
          detail: `低效渠道收入 ${formatCurrency(weakChannelRevenue, channelResult.currency)}。`,
        },
      ],
      summaryMetrics: [
        toSummaryMetric("健康渠道收入", formatCurrency(paidChannelRevenue, channelResult.currency)),
        toSummaryMetric("低效渠道收入", formatCurrency(weakChannelRevenue, channelResult.currency)),
        toSummaryMetric("可归因收入占比", `${channelResult.attributedRevenueShare}%`),
        toSummaryMetric("渠道数量", String(channelCount)),
      ],
      breakdowns: [report.breakdowns[0]!],
      supplementaryGroups: [
        {
          key: "refund_loss_orders",
          title: "关联高损耗订单",
          tone: "warning",
          summary: "渠道判断最好和损耗订单一起看，避免把售后损耗错判成单纯的投放问题。",
          items: report.groups.find((group) => group.key === "refund_loss_orders")?.items ?? [],
        },
      ],
      actions: [
        {
          title: "先收紧低效渠道",
          detail: "先把明显留不住利润的渠道圈出来，不要继续加压。",
          priority: "P0",
        },
        {
          title: "放大健康渠道样本",
          detail: "优先把预算留给当前仍能留下贡献利润的来源。",
          priority: "P1",
        },
        {
          title: "联动损耗订单复核",
          detail: "确认问题是出在投前质量，还是投后售后损耗。",
          priority: "P2",
        },
      ],
    };
  }

  if (normalizedFocus === "loss") {
    return {
      ...report,
      title: "ROI 损耗分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点看折扣、退款和高损耗订单如何继续吞掉经营回报。`,
      accent: "焦点：损耗",
      primaryQuestion: "最近的 ROI 被哪些损耗对象拖弱，问题更多发生在成交前还是成交后？",
      summary:
        refundLossOrders.length > 0
          ? "当前 ROI 压力已经能定位到具体损耗对象，优先级应该放在先止损。"
          : "当前还没有明显的大额损耗订单，但仍要继续盯折扣和退款占比。",
      statuses: [
        {
          label: "折扣压力",
          status: discountShare > 0.15 ? "risk" : discountShare > 0.08 ? "watch" : "healthy",
          detail: `折扣占收入 ${formatPercent(discountShare)}。`,
        },
        {
          label: "退款压力",
          status: refundShare > 0.08 ? "risk" : refundShare > 0.04 ? "watch" : "healthy",
          detail: `退款占收入 ${formatPercent(refundShare)}。`,
        },
        {
          label: "高损耗订单",
          status: refundLossOrders.length >= 2 ? "watch" : refundLossOrders.length === 1 ? "watch" : "healthy",
          detail: `Top 高损耗订单退款 ${formatCurrency(lossOrderRefund, channelResult.currency)}。`,
        },
      ],
      summaryMetrics: [
        toSummaryMetric("折扣损耗", formatCurrency(orderScope.sevenDayTotals.discounts, channelResult.currency)),
        toSummaryMetric("退款损耗", formatCurrency(orderScope.sevenDayTotals.refundLoss, channelResult.currency)),
        toSummaryMetric("折扣占比", formatPercent(discountShare)),
        toSummaryMetric("退款占比", formatPercent(refundShare)),
      ],
      breakdowns: [report.breakdowns[1]!],
      groups: [
        report.groups.find((group) => group.key === "refund_loss_orders")!,
        report.groups.find((group) => group.key === "weak_channels")!,
      ].filter(Boolean),
      supplementaryGroups: [
        {
          key: "healthy_channels",
          title: "对照健康渠道",
          tone: "positive",
          summary: "保留一组健康渠道做对照，帮助判断当前损耗是局部问题还是整体问题。",
          items: report.groups.find((group) => group.key === "healthy_channels")?.items ?? [],
        },
      ],
      actions: [
        {
          title: "先止住高损耗订单",
          detail: "ROI 被拖弱时，成交后的损耗往往比继续冲量更值得先处理。",
          priority: "P0",
        },
        {
          title: "复核折扣策略",
          detail: "确认折扣有没有换来足够质量的增长，而不是先把利润让掉。",
          priority: "P1",
        },
        {
          title: "联动渠道复核",
          detail: "别把损耗问题完全归因为投放，渠道和售后要一起看。",
          priority: "P2",
        },
      ],
    };
  }

  if (normalizedFocus === "layers") {
    return {
      ...report,
      title: "价值层 ROI 分析",
      subtitle: `当前查看范围：${selectedCountryLabel}。这里重点看价值层、客户结构和长期价值信号，而不只是一条短期回报曲线。`,
      accent: "焦点：价值层",
      primaryQuestion: "最近的 ROI 改善有没有价值层支撑，还是只停留在短期收入结果？",
      summary:
        (shortTermReturn ?? 0) >= 1
          ? "短期回报仍为正，但是否值得继续放大，还要看客户价值和复购质量有没有跟上。"
          : "短期回报已经走弱，这时更需要借价值层判断是渠道问题，还是客户质量在变差。",
      statuses: [
        {
          label: "短期经营回报",
          status: report.statuses[0]!.status,
          detail: report.statuses[0]!.detail,
        },
        {
          label: "价值层信号",
          status: "watch",
          detail: "这一层更适合结合渠道、客户价值和复购信号一起判断是否值得继续投。",
        },
        {
          label: "数据口径",
          status: "watch",
          detail: "当前价值层结论仍以估算和预测为主，适合做方向判断，不适合做精确归因。",
        },
      ],
      summaryMetrics: [
        toSummaryMetric("短期经营回报", formatMultiple(shortTermReturn)),
        toSummaryMetric("前 30 天基准", formatMultiple(baselineReturn)),
        toSummaryMetric("可归因收入占比", `${channelResult.attributedRevenueShare}%`),
        toSummaryMetric("价值层结论", "继续看下方价值层卡片"),
      ],
      breakdowns: [
        {
          ...report.breakdowns[0]!,
          title: "价值层对应的渠道结构",
          summary: "价值层判断依然需要回到渠道，确认当前支撑 ROI 的来源是否能持续带来高质量客户。",
        },
      ],
      supplementaryGroups: report.groups,
      actions: [
        {
          title: "结合价值层再决定加码",
          detail: "短期 ROI 还不够，继续投之前先确认客户质量和复购信号。",
          priority: "P0",
        },
        {
          title: "优先看客户价值与复购",
          detail: "如果高价值客户和复购没有跟上，短期回报改善未必能持续。",
          priority: "P1",
        },
        {
          title: "把短期和长期一起看",
          detail: "当前先用价值层做方向判断，等长期 ROI 数据接入后再做更完整决策。",
          priority: "P2",
        },
      ],
    };
  }

  return report;
}

export async function loadTodayOverviewReportData(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  hasReadReports: boolean;
  requestedCountry: string | null | undefined;
  now?: Date;
}): Promise<TodayOverviewReportData> {
  const now = params.now ?? new Date();
  try {
    const sessionCounts = params.hasReadReports
      ? await loadSessionCountryCounts(params.admin).catch((error) => {
          console.warn("[todayGeo] loadSessionCountryCounts failed in overview:", error);
          return new Map<string, number>();
        })
      : new Map<string, number>();
    const orderCounts = await loadOrderCountryCounts(params.shop, now);
    const filters = buildCountryOptions(
      normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null,
      orderCounts,
      sessionCounts,
    );
    if (!params.hasReadReports) {
      filters.dataNotes.push("当前店铺未返回 read_reports，流量与转化暂时无法按地区读取 Storefront sessions。");
    }
    const orderScope = await loadOrderScopeData(params.shop, filters.selectedCountry, now);
    const sessionScope = params.hasReadReports
      ? await loadSessionScope(
          params.admin,
          filters.selectedCountry === TODAY_ALL_COUNTRIES ? null : filters.selectedCountry,
          false,
        ).catch((error) => {
          console.warn("[todayGeo] loadSessionScope failed in overview:", error);
          return null;
        })
      : null;
    if (params.hasReadReports && sessionScope === null) {
      filters.dataNotes.push("Storefront sessions 地区查询当前未返回有效数据，流量与转化先显示为空值。");
    }
    return {
      filters,
      report: {
        header: buildTodayHeader(orderScope),
        metricCards: buildTodayMetricCards(orderScope),
        reasonCards: buildTodayReasonCards(orderScope, sessionScope),
        roiSummary: buildTodayRoiSummary(orderScope),
      },
    };
  } catch (error) {
    console.error("[todayGeo] loadTodayOverviewReportData failed:", error);
    return {
      filters: buildFallbackFilters(params.requestedCountry, [
        "Today 总览数据暂时加载失败，当前先展示最近一版默认分析文案，避免首页空白。",
      ]),
      report: buildFallbackOverviewReport(),
    };
  }
}

export async function loadTodayDecisionReportData(params: {
  shop: string;
  admin: ShopifyAdminGraphqlClient;
  hasReadReports: boolean;
  requestedCountry: string | null | undefined;
  metric: TodayDecisionReportKey;
  focus?: string | null;
  now?: Date;
}): Promise<TodayDecisionReportData> {
  const now = params.now ?? new Date();
  try {
    const sessionCounts = params.hasReadReports
      ? await loadSessionCountryCounts(params.admin).catch((error) => {
          console.warn(`[todayGeo] loadSessionCountryCounts failed for metric=${params.metric}:`, error);
          return new Map<string, number>();
        })
      : new Map<string, number>();
    const orderCounts = await loadOrderCountryCounts(params.shop, now);
    const filters = buildCountryOptions(
      normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null,
      orderCounts,
      sessionCounts,
    );
    const [orderScope, objectData] = await Promise.all([
      loadOrderScopeData(params.shop, filters.selectedCountry, now),
      loadDecisionObjectData(params.shop, filters.selectedCountry, now),
    ]);
    const selectedCountryLabel = filters.selectedCountryLabel;

    const report =
      params.metric === "revenue"
        ? buildRevenueReport(orderScope, objectData, selectedCountryLabel, params.focus)
        : params.metric === "profit"
          ? buildProfitReport(orderScope, objectData, selectedCountryLabel, params.focus)
          : await buildRoiDecisionReport(
              params.shop,
              filters.selectedCountry,
              orderScope,
              objectData,
              selectedCountryLabel,
              params.focus,
            );

    return { filters, report };
  } catch (error) {
    console.error(`[todayGeo] loadTodayDecisionReportData failed metric=${params.metric}:`, error);
    return {
      filters: buildFallbackFilters(params.requestedCountry, [
        "Today 报告数据暂时加载失败，当前先展示最近一版默认分析内容，避免报告页空白。",
      ]),
      report: buildFallbackDecisionReport(params.metric),
    };
  }
}
