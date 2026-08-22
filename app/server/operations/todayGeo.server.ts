import prisma from "../../db.server";
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
import { readNumericCell } from "../../lib/shopifyReports";
import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import { executeShopifyqlQuery } from "../shopifyql/shopifyqlQuery.server";
import { getShopCostConfig } from "./roi/costConfig.server";

export const TODAY_ALL_COUNTRIES = "ALL";

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
  const [orderCounts, sessionCounts] = await Promise.all([
    loadOrderCountryCounts(params.shop, now),
    params.hasReadReports ? loadSessionCountryCounts(params.admin) : Promise.resolve(new Map<string, number>()),
  ]);
  const filters = buildCountryOptions(normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null, orderCounts, sessionCounts);
  if (!params.hasReadReports) {
    filters.dataNotes.push("当前店铺未返回 read_reports，流量与转化暂时无法按地区读取 Storefront sessions。");
  }
  const [orderScope, sessionScope] = await Promise.all([
    loadOrderScopeData(params.shop, filters.selectedCountry, now),
    params.hasReadReports
      ? loadSessionScope(params.admin, filters.selectedCountry === TODAY_ALL_COUNTRIES ? null : filters.selectedCountry, false)
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
  const [orderCounts, sessionCounts] = await Promise.all([
    loadOrderCountryCounts(params.shop, now),
    params.hasReadReports ? loadSessionCountryCounts(params.admin) : Promise.resolve(new Map<string, number>()),
  ]);
  const filters = buildCountryOptions(normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null, orderCounts, sessionCounts);
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
}
