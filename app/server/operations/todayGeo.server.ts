import prisma from "../../db.server";
import { TODAY_ALL_COUNTRIES } from "../../lib/todayGeo.shared";
import {
  addUtcDays,
  resolveDisplayTimeZone,
  startOfUtcDay,
  toObservationWindowView,
  type ObservationWindowView,
} from "../../lib/observationWindow";
import type {
  TodayDecisionReport,
  TodayDecisionReportKey,
  TodayEvidenceGroup,
  TodayHeader,
  TodayMetricAction,
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
import { getAliyunLogConfig } from "../aliyunLog/config.server";
import { PIXEL_FUNNEL_EVENTS } from "../aliyunLog/pixelQuery.server";
import { getSlsClient } from "../aliyunLog/slsClient.server";
import { fetchShopBasicInfo } from "../shopify/fetchShopBasicInfo.server";
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

export type TodayOverviewReportData = {
  filters: TodayFilterState;
  report: TodayOverviewReport;
  observationWindow: ObservationWindowView;
};

export type TodayDecisionReportData = {
  filters: TodayFilterState;
  report: TodayDecisionReport;
  observationWindow: ObservationWindowView;
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

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function resolveShopDisplayTimeZone(admin: ShopifyAdminGraphqlClient): Promise<string> {
  const shopInfo = await fetchShopBasicInfo(admin).catch(() => null);
  return resolveDisplayTimeZone(shopInfo?.ianaTimezone);
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

function statusFromRatio(value: number, watch: number, risk: number): TodayReportStatus["status"] {
  if (value <= risk) return "risk";
  if (value <= watch) return "watch";
  return "healthy";
}

async function loadOrderFacts(shop: string, now: Date): Promise<OrderFact[]> {
  const todayStart = startOfUtcDay(now);
  const since = addUtcDays(todayStart, -ORDER_LOOKBACK_DAYS);
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
  const since = addUtcDays(todayStart, -COUNTRY_OPTION_WINDOW_DAYS);
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
    "FROM sessions SHOW sessions WHERE session_country_code IS NOT NULL SINCE -30d UNTIL yesterday GROUP BY session_country_code ORDER BY sessions DESC LIMIT 20";
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
  const summaryQuery = `FROM sessions SHOW sessions, pageviews, conversion_rate, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout${whereClause} SINCE -7d UNTIL yesterday`;
  const trendQuery = `FROM sessions SHOW sessions, pageviews, conversion_rate, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout${whereClause} TIMESERIES day SINCE -7d UNTIL yesterday ORDER BY day ASC`;
  const referrerQuery = `FROM sessions SHOW sessions, conversion_rate${whereClause} SINCE -7d UNTIL yesterday GROUP BY referrer_source ORDER BY sessions DESC LIMIT 6`;

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
    const date = addUtcDays(todayStart, -7 + index);
    return dateKey(date);
  });
  const baselineThirtyDays = Array.from({ length: 30 }, (_, index) => {
    const date = addUtcDays(todayStart, -37 + index);
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
      processedAt: { gte: addUtcDays(todayStart, -ORDER_LOOKBACK_DAYS), lt: todayStart },
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
  financialStatus: string | null;
  sourceName: string | null;
  landingSite: string | null;
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
  financialStatus: string | null;
  landingPageTitle: string | null;
  isFirstOrder: boolean;
};

type LandingPageAggregate = {
  key: string;
  title: string;
  sessions: number | null;
  pageViews: number | null;
  addToCartCount: number | null;
  checkoutStartedCount: number | null;
  paymentSubmittedCount: number | null;
  checkoutCompletedCount: number | null;
  orderCount: number;
  revenue: number;
  refundLoss: number;
  estimatedProfit: number;
  estimatedMargin: number;
  firstOrderShare: number;
  paymentAttemptCount: number;
  paymentSuccessCount: number;
  paymentFailureCount: number;
};

type PaymentRiskOrderAggregate = {
  key: string;
  title: string;
  revenue: number;
  itemCount: number;
  channelLabel: string;
  financialStatus: string | null;
  landingPageTitle: string | null;
};

type PageSignalStatus = "loaded" | "country_unavailable" | "not_configured" | "query_failed";

type DecisionObjectData = {
  currency: string;
  products: ProductAggregate[];
  orders: OrderAggregate[];
  landingPages: LandingPageAggregate[];
  paymentRiskOrders: PaymentRiskOrderAggregate[];
  pageSignalStatus: PageSignalStatus;
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
  const ordersValue = orderScope.sevenDayTotals.orders;
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
  const revenueDelta = safeDivide(revenueValue - baselineRevenue, baselineRevenue || 1);
  const costDelta = safeDivide(costValue - baselineCost, baselineCost || 1);
  const profitDelta = safeDivide(profitValue - baselineProfit, baselineProfit || 1);
  const profitMarginDelta = profitMarginValue - baselineProfitMargin;
  const ordersDelta = safeDivide(ordersValue - baselineOrders, baselineOrders || 1);
  const aovDelta = safeDivide(aovValue - baselineAov, baselineAov || 1);

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

  const buildMarginTone = (delta: number): TodayMetricCard["tone"] => {
    if (delta <= -0.03) return "negative";
    if (delta <= -0.01) return "warning";
    return "positive";
  };

  return [
    {
      key: "revenue",
      label: "收入",
      value: formatCurrency(revenueValue, orderScope.currency),
      delta: formatDeltaPercent(revenueDelta),
      tone: buildTone(revenueDelta),
      source: "realized",
      summary: "先看盘子是否真正放大，再继续拆到具体收入对象。",
      href: "/app/today/revenue",
    },
    {
      key: "cost",
      label: "成本",
      value: formatCurrency(costValue, orderScope.currency),
      delta: formatDeltaPercent(costDelta),
      tone: buildTone(costDelta, true),
      source: "estimated",
      summary: "成本页先回答成本有没有跑到收入前面，以及主要压在哪些对象上。",
      href: "/app/today/cost",
    },
    {
      key: "profit",
      label: "利润",
      value: formatCurrency(profitValue, orderScope.currency),
      delta: formatDeltaPercent(profitDelta),
      tone: buildTone(profitDelta),
      source: "estimated",
      summary: "利润页只回答卖出去的钱最后留下了多少，以及是谁在吞利润。",
      href: "/app/today/profit?focus=profit",
    },
    {
      key: "profit_margin",
      label: "利润率",
      value: formatPercent(profitMarginValue),
      delta: formatPercentPoints(profitMarginDelta),
      tone: buildMarginTone(profitMarginDelta),
      source: "estimated",
      summary: "利润率页先看赚钱质量有没有变薄，不把规模增长误判成经营改善。",
      href: "/app/today/profit?focus=margin",
    },
    {
      key: "orders",
      label: "订单数",
      value: formatInteger(ordersValue),
      delta: formatDeltaPercent(ordersDelta),
      tone: buildTone(ordersDelta),
      source: "realized",
      summary: "订单页先区分规模增长是否健康，再继续下钻到订单对象。",
      href: "/app/today/revenue?focus=orders",
    },
    {
      key: "aov",
      label: "客单价",
      value: formatCurrency(aovValue, orderScope.currency),
      delta: formatDeltaPercent(aovDelta),
      tone: buildTone(aovDelta),
      source: "realized",
      summary: "客单价页先确认高客单是不是可复制的健康样本。",
      href: "/app/today/revenue?focus=aov",
    },
  ];
}

function buildTodayReasonCards(orderScope: OrderScopeData, sessionScope: SessionScopeData | null): TodayReasonCard[] {
  const revenueDelta = safeDivide(
    orderScope.sevenDayTotals.revenue - comparableBaseline(orderScope.baselineTotals.revenue),
    comparableBaseline(orderScope.baselineTotals.revenue) || 1,
  );
  const ordersDelta = safeDivide(
    orderScope.sevenDayTotals.orders - comparableBaseline(orderScope.baselineTotals.orders),
    comparableBaseline(orderScope.baselineTotals.orders) || 1,
  );
  const refundShare = safeDivide(orderScope.sevenDayTotals.refundLoss, orderScope.sevenDayTotals.revenue || 1);
  const discountShare = safeDivide(orderScope.sevenDayTotals.discounts, orderScope.sevenDayTotals.revenue || 1);
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);
  const conversionMeta = sessionScope
    ? `会话 ${formatInteger(sessionScope.summary.sessions)} / 转化率 ${formatPercent(sessionScope.summary.conversionRate)}`
    : `订单变化 ${formatDeltaPercent(ordersDelta)} / 订单数 ${formatInteger(orderScope.sevenDayTotals.orders)}`;

  return [
    {
      key: "growth-change",
      title: "增长为什么变化",
      value: formatDeltaPercent(revenueDelta),
      label: revenueDelta >= 0 ? "增长质量" : "增长承压",
      meta: conversionMeta,
      summary:
        revenueDelta >= 0
          ? "增长还在继续，但要先确认是健康对象在支撑，还是只把规模做大。"
          : "增长已经变弱，下一步先到增长质量页看是哪些商品和订单在拖累结果。",
      tone: revenueDelta >= 0 ? "blue" : "orange",
      href: "/app/today/revenue",
    },
    {
      key: "profit-erosion",
      title: "利润被谁侵蚀",
      value: formatPercent(Math.max(refundShare, discountShare)),
      label: refundShare >= discountShare ? "退款损耗" : "折扣占比",
      meta: refundShare >= discountShare ? "成交后利润继续流失" : "成交前利润先被让掉",
      summary:
        refundShare >= discountShare
          ? "退款问题优先级更高，它会直接吞掉已经成交的利润。"
          : "当前先别把折扣带来的规模增长误判成真实经营改善。",
      tone: refundShare > 0.08 || discountShare > 0.15 ? "red" : "orange",
      href: "/app/today/profit",
    },
    {
      key: "efficiency-shift",
      title: "回报为什么变弱",
      value: formatMultiple(shortTermReturn),
      label: "短期经营回报",
      meta:
        refundShare >= discountShare
          ? `退款占比 ${formatPercent(refundShare)} / 回报先被售后损耗拖弱`
          : `折扣占比 ${formatPercent(discountShare)} / 回报先被售前让利拖弱`,
      summary:
        (shortTermReturn ?? 0) >= 1.5
          ? "当前回报效率还在健康区，但仍要继续看哪些渠道和对象值得继续放大。"
          : "回报效率已经走弱，下一步应该直接去看低效渠道和高损耗订单。",
      tone: (shortTermReturn ?? 0) >= 1.5 ? "green" : "red",
      href: "/app/today/roi",
    },
  ];
}

function buildTodayRoiSummary(orderScope: OrderScopeData): TodayRoiSummary {
  const shortTermReturn = estimatedReturnMultiple(orderScope.sevenDayTotals, orderScope.defaultGrossMarginPercent);

  return {
    cards: [
      {
        key: "short_term",
        label: "短期 ROI",
        statusLabel:
          (shortTermReturn ?? 0) >= 1.5 ? "强" : (shortTermReturn ?? 0) >= 1 ? "稳定" : "偏弱",
        value: formatMultiple(shortTermReturn),
        summary: "先看最近 7 天有没有留下正向经营结果，这一层只回答短期是否在赚钱。",
        dataQuality: "estimated",
        confidence: "medium",
        href: "/app/today/roi",
      },
    ],
  };
}

type FallbackMetricTable = {
  title: string;
  columns: string[];
  rows: string[][];
};

type FallbackMetricDetail = {
  title: string;
  intro: string;
  metrics: Array<{
    label: string;
    value: string;
    unit?: string;
  }>;
  statuses: TodayReportStatus[];
  tables: FallbackMetricTable[];
  actions: TodayMetricAction[];
  conclusions: string[];
};

const FALLBACK_DETAIL_MAP: Record<"roi" | "traffic" | "conversion" | "orders", FallbackMetricDetail> = {
  roi: {
    title: "ROI 详情",
    intro: "这个页面用来回答今天哪些经营动作真的在产生回报，哪些动作虽然带来了单量，但还没有带来足够的 ROI。",
    metrics: [
      { label: "短期 ROI", value: "1.9x" },
      { label: "长期 ROI", value: "2.8x" },
      { label: "近 7 天收入", value: "$56,300" },
      { label: "近 7 天投入", value: "$29,640" },
      { label: "退款损耗", value: "$2,180" },
      { label: "老客贡献", value: "24%" },
    ],
    statuses: [
      {
        label: "整体赚钱结果",
        status: "watch",
        detail: "长期 ROI 还在安全区，但短期 ROI 已明显偏离基准，说明赚钱效率正在走弱。",
      },
      {
        label: "流量与转化",
        status: "risk",
        detail: "高成本流量占比抬升，同时商品页到结账页承接偏弱，短期 ROI 被双重拖累。",
      },
      {
        label: "利润损耗",
        status: "watch",
        detail: "退款和售后成本没有失控，但仍在侵蚀利润空间，压缩最终回报。",
      },
    ],
    tables: [
      {
        title: "ROI 结果拆解",
        columns: ["指标", "当前", "基准", "变化"],
        rows: [
          ["短期 ROI", "1.9x", "2.3x", "-0.4x"],
          ["长期 ROI", "2.8x", "2.6x", "+0.2x"],
          ["收入", "$56,300", "$54,800", "+2.7%"],
          ["投入", "$29,640", "$23,800", "+24.5%"],
        ],
      },
      {
        title: "影响 ROI 的关键因子",
        columns: ["因子", "当前判断", "影响", "建议"],
        rows: [
          ["流量质量", "高成本渠道占比上升", "拖累 ROI", "先压低低效流量"],
          ["转化承接", "详情页到结账偏弱", "直接影响回收", "优先修高流量页面"],
          ["售后损耗", "退款集中在 2 个 SKU", "侵蚀利润", "跟进退款原因"],
          ["老客复购", "仍有一定支撑", "稳定长期 ROI", "继续维护老客"],
        ],
      },
    ],
    actions: [
      {
        title: "先压低低效流量",
        detail: "优先收紧高成本低回收渠道，避免短期 ROI 继续被无效获客拖累。",
        priority: "P0",
      },
      {
        title: "排查关键承接页",
        detail: "先看高流量商品页和优惠页的承接掉点，确认是页面内容还是结账前链路在拖累回收。",
        priority: "P1",
      },
      {
        title: "跟进退款损耗对象",
        detail: "把退款集中 SKU 单独拉出来看原因，避免利润继续被售后损耗侵蚀。",
        priority: "P2",
      },
    ],
    conclusions: [
      "Today 里的 ROI 不是只看一个总数，而是继续拆到关键动作，判断哪类经营动作值得继续投入。",
      "今天最值得优先处理的是高成本低效率流量，以及转化承接偏弱的关键页面。",
      "如果要继续深钻，优先看付费流量 ROI、优惠券 ROI 和复购支撑，再决定去流量质量或转化承接页。",
    ],
  },
  traffic: {
    title: "流量质量详情",
    intro: "流量质量页的重点不是继续看曝光和会话，而是判断这些流量值不值钱、能不能转成结果。",
    metrics: [
      { label: "昨日会话", value: "8,420" },
      { label: "7 日均值", value: "7,950" },
      { label: "自然流量占比", value: "41%" },
      { label: "付费流量占比", value: "37%" },
      { label: "跳出率", value: "38.4%" },
      { label: "落地页收入", value: "$5,820" },
    ],
    statuses: [
      {
        label: "流量规模",
        status: "healthy",
        detail: "昨日会话高于 7 日均值 5.9%，当前规模没有掉到风险区间。",
      },
      {
        label: "渠道结构",
        status: "watch",
        detail: "付费流量增速快于自然流量，质量需要继续结合转化页承接一起判断。",
      },
      {
        label: "落地页承接",
        status: "risk",
        detail: "Top 落地页的跳出率偏高，新增流量没有被稳定接住。",
      },
    ],
    tables: [
      {
        title: "渠道结构拆解",
        columns: ["渠道", "昨日会话", "7 日均值", "变化"],
        rows: [
          ["Paid Social", "2,980", "2,540", "+17.3%"],
          ["Organic Search", "2,410", "2,360", "+2.1%"],
          ["Direct", "1,860", "1,940", "-4.1%"],
          ["Email / CRM", "690", "610", "+13.1%"],
        ],
      },
      {
        title: "Top 落地页",
        columns: ["页面", "昨日会话", "跳出率", "收入"],
        rows: [
          ["/products/hero-serum", "1,920", "42.1%", "$1,860"],
          ["/collections/bestsellers", "1,360", "34.4%", "$1,120"],
          ["/products/night-cream", "980", "47.8%", "$760"],
          ["/pages/summer-offer", "760", "51.2%", "$420"],
        ],
      },
    ],
    actions: [
      {
        title: "优先修高流量落地页",
        detail: "先处理跳出率高但会话量大的页面，避免新增流量继续低效流失。",
        priority: "P0",
      },
      {
        title: "复核渠道质量",
        detail: "把 Paid Social 和 Organic Search 分开看，确认增长是不是来自真正能支撑转化的流量。",
        priority: "P1",
      },
      {
        title: "联动转化承接判断",
        detail: "如果落地页问题持续存在，直接去转化承接模块核对加购到结账的掉点位置。",
        priority: "P2",
      },
    ],
    conclusions: [
      "流量规模本身没有问题，今天先不要把注意力放在继续冲量上。",
      "应该优先检查高流量落地页的承接与页面内容，避免新增流量继续低效消耗。",
      "若要进一步判断问题来源，直接去图表页看 Storefront 趋势和 referrer 结构。",
    ],
  },
  conversion: {
    title: "转化承接详情",
    intro: "转化承接页的重点是看漏斗掉点和页面承接，不是单独把订单结果再重复一遍。",
    metrics: [
      { label: "昨日转化率", value: "1.82%" },
      { label: "7 日均值", value: "1.64%" },
      { label: "加购率", value: "8.6%" },
      { label: "到达结账率", value: "4.1%" },
      { label: "完成结账率", value: "1.82%" },
      { label: "平均客单价", value: "$64" },
    ],
    statuses: [
      {
        label: "总体转化",
        status: "healthy",
        detail: "昨日结果略高于近 7 日均值，说明转化没有继续下滑。",
      },
      {
        label: "加购到结账",
        status: "watch",
        detail: "中段漏斗仍然偏弱，说明页面说服力和优惠触发还不够稳定。",
      },
      {
        label: "结账完成",
        status: "risk",
        detail: "结账完成率受支付与运费展示影响，最后一步仍有明显流失。",
      },
    ],
    tables: [
      {
        title: "漏斗拆解",
        columns: ["阶段", "昨日", "7 日均值", "变化"],
        rows: [
          ["Sessions", "8,420", "7,950", "+5.9%"],
          ["Add to Cart", "724", "671", "+7.9%"],
          ["Reached Checkout", "346", "332", "+4.2%"],
          ["Completed Checkout", "153", "130", "+17.7%"],
        ],
      },
      {
        title: "重点承接页",
        columns: ["页面", "昨日 CVR", "7 日均值", "备注"],
        rows: [
          ["/products/hero-serum", "2.6%", "2.3%", "主推页，承接稳定"],
          ["/products/night-cream", "1.4%", "1.8%", "详情页掉点偏多"],
          ["/pages/summer-offer", "1.1%", "1.5%", "优惠说明不够清晰"],
          ["/cart", "3.8%", "4.2%", "运费展示仍影响提交"],
        ],
      },
    ],
    actions: [
      {
        title: "优先修商品详情页承接",
        detail: "先处理高流量但 CVR 走弱的商品页，把最明显的中段漏斗掉点止住。",
        priority: "P0",
      },
      {
        title: "复核结账页阻碍",
        detail: "排查支付、运费展示和优惠说明，减少最后一步的流失。",
        priority: "P1",
      },
      {
        title: "对齐流量入口",
        detail: "把流量质量模块里的高流量入口与当前漏斗掉点对照，避免继续把流量送到低效页面。",
        priority: "P2",
      },
    ],
    conclusions: [
      "当前问题不是完全没有转化，而是中后段漏斗还不够稳。",
      "需要优先处理商品详情页和结账页的承接问题，而不是继续盲目放大流量。",
      "图表页更适合继续看 7 天 conversion_rate 趋势和 checkout 相关指标。",
    ],
  },
  orders: {
    title: "收入与订单详情",
    intro: "收入与订单页不再只看订单数，而是一起看收入、客单、退款和折扣对真实赚钱结果的影响。",
    metrics: [
      { label: "昨日订单数", value: "126" },
      { label: "7 日均值", value: "118" },
      { label: "昨日销售额", value: "$8,064" },
      { label: "平均客单价", value: "$64" },
      { label: "取消率", value: "2.4%" },
      { label: "退款率", value: "3.1%" },
    ],
    statuses: [
      {
        label: "订单规模",
        status: "healthy",
        detail: "订单量与销售额都高于 7 日均值，规模侧没有出现新的掉速。",
      },
      {
        label: "收入质量",
        status: "watch",
        detail: "客单价稳定，但部分折扣订单占比抬升，需要继续观察利润质量。",
      },
      {
        label: "售后风险",
        status: "watch",
        detail: "退款率没有失控，但退款原因仍集中在 2 个核心 SKU 上。",
      },
    ],
    tables: [
      {
        title: "订单结果拆解",
        columns: ["指标", "昨日", "7 日均值", "变化"],
        rows: [
          ["订单数", "126", "118", "+6.8%"],
          ["销售额", "$8,064", "$7,510", "+7.4%"],
          ["AOV", "$64", "$63", "+1.6%"],
          ["退款率", "3.1%", "2.8%", "+0.3pp"],
        ],
      },
      {
        title: "重点订单对象",
        columns: ["对象", "昨日值", "备注", "影响"],
        rows: [
          ["高客单订单", "18 单", "主要来自套装", "拉高收入"],
          ["折扣订单", "42 单", "占比偏高", "影响利润"],
          ["退款订单", "4 单", "集中在 2 个 SKU", "侵蚀短期 ROI"],
          ["取消订单", "3 单", "支付失败为主", "轻度影响"],
        ],
      },
    ],
    actions: [
      {
        title: "先拆折扣订单占比",
        detail: "确认订单增长是不是主要由折扣拉动，避免把规模增长误判成赚钱改善。",
        priority: "P0",
      },
      {
        title: "跟进退款集中对象",
        detail: "把退款集中 SKU 和取消订单原因单独排查，减少对短期利润的侵蚀。",
        priority: "P1",
      },
      {
        title: "复核高客单支撑项",
        detail: "确认高客单订单来自哪些商品或套装，判断这些增长是否可持续。",
        priority: "P2",
      },
    ],
    conclusions: [
      "订单模块目前整体稳定，但利润质量还不能只看订单数。",
      "下一步应该把折扣、退款和高客单对象一起看，判断订单增长是不是健康增长。",
      "需要继续深钻时，直接进入 Sales 图表页查看订单和收入趋势。",
    ],
  },
};

function buildFallbackOverviewReport(): TodayOverviewReport {
  const fallbackAov = FALLBACK_DETAIL_MAP.orders.metrics.find((metric) => metric.label === "平均客单价")?.value ?? "—";

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
        revenue: "$7,510",
        estimatedProfit: "待恢复",
        estimatedProfitMargin: "待恢复",
        shortTermReturn: "1.9x",
      },
    },
    metricCards: [
      {
        key: "revenue",
        label: "收入",
        value: "$7,510",
        delta: "+6.8%",
        tone: "warning",
        source: "realized",
        summary: "收入页会继续拆哪些对象真的在支撑盘子。",
        href: "/app/today/revenue",
      },
      {
        key: "cost",
        label: "成本",
        value: "待恢复",
        delta: "—",
        tone: "warning",
        source: "estimated",
        summary: "成本页会继续看成本主要压在哪些对象上。",
        href: "/app/today/cost",
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
        summary: "利润率页会继续解释赚钱质量为什么变薄。",
        href: "/app/today/profit?focus=margin",
      },
      {
        key: "orders",
        label: "订单数",
        value: "126",
        delta: "+6.8%",
        tone: "warning",
        source: "realized",
        summary: "订单页会继续看哪些订单值得继续复制。",
        href: "/app/today/revenue?focus=orders",
      },
      {
        key: "aov",
        label: "客单价",
        value: fallbackAov,
        delta: "—",
        tone: "warning",
        source: "realized",
        summary: "客单价页会继续看高客单是不是健康样本。",
        href: "/app/today/revenue?focus=aov",
      },
    ],
    reasonCards: [
      {
        key: "growth-change",
        title: "增长为什么变化",
        value: "+5.9%",
        label: "增长质量",
        meta: "昨日流量高于 7 日均值，但高质量流量占比没有同步抬升，今天要继续盯住有效输入而不是单纯冲量。",
        summary: "当前先沿用最近一版默认判断，主链路恢复后会替换为正式增长对象证据。",
        tone: "blue",
        href: "/app/today/revenue",
      },
      {
        key: "profit-erosion",
        title: "利润被谁侵蚀",
        value: "+0.18pp",
        label: "利润侵蚀",
        meta: "昨日转化率高于 7 日均值，但加购到结账阶段仍有掉点，赚钱效率仍在被中后段承接拖累。",
        summary: "现阶段先保留方向判断，后续恢复真实快照后会替换成正式利润对象证据。",
        tone: "orange",
        href: "/app/today/profit",
      },
      {
        key: "efficiency-shift",
        title: "回报为什么变弱",
        value: "-0.4x",
        label: "回报效率",
        meta: "短期 ROI 明显承压，当前要优先盯住流量质量和落地页承接，避免继续放大获客浪费。",
        summary: "恢复正式数据后，应该继续拆到渠道和损耗对象，而不是继续停在总回报口径。",
        tone: "red",
        href: "/app/today/roi",
      },
    ],
    roiSummary: {
      cards: [
        {
          key: "short_term",
          label: "短期 ROI",
          statusLabel: "默认判断",
          value: "1.9x",
          summary: "短期 ROI 明显承压，当前要优先盯住流量质量和落地页承接，避免继续放大获客浪费。",
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
      ? FALLBACK_DETAIL_MAP.roi
      : metric === "traffic"
        ? FALLBACK_DETAIL_MAP.traffic
        : metric === "conversion"
          ? FALLBACK_DETAIL_MAP.conversion
          : FALLBACK_DETAIL_MAP.orders;

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
    metric === "revenue"
      ? "收入分析"
      : metric === "profit"
        ? "利润分析"
        : metric === "traffic"
          ? "流量分析"
          : metric === "conversion"
            ? "转化分析"
            : "回报效率分析";

  return {
    key: metric,
    title: metricTitle,
    subtitle: "当前主数据链路暂时不可用，先展示最近一版默认分析内容，避免报告页空白。",
    accent: "默认分析文案",
    primaryQuestion:
      metric === "roi"
        ? "当前哪些经营动作值得继续投，哪些动作应该先止损？"
        : metric === "traffic"
          ? "当前哪些来源在带来有效承接，哪些来源只是在堆会话？"
          : metric === "conversion"
            ? "当前转化问题主要卡在漏斗哪里，哪些来源需要先排查？"
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
  const since = addUtcDays(todayStart, -7);
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

  const [{ status: pageSignalStatus, pages: pageEventAggregates }, orders, refunds, refundLineItems] = await Promise.all([
    loadPageEventAggregates(shop, selectedCountry, now),
    prisma.shopOrder.findMany({
      where: orderWhere,
      select: {
        shopifyOrderId: true,
        orderNumber: true,
        createdAt: true,
        totalPrice: true,
        currency: true,
        financialStatus: true,
        sourceName: true,
        landingSite: true,
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
  const landingPageMap = new Map<
    string,
    Omit<LandingPageAggregate, "estimatedMargin" | "firstOrderShare"> & { firstOrderCount: number }
  >();
  const paymentRiskOrders: PaymentRiskOrderAggregate[] = [];

  for (const page of pageEventAggregates) {
    landingPageMap.set(page.key, {
      key: page.key,
      title: page.title,
      sessions: page.sessions,
      pageViews: page.pageViews,
      addToCartCount: page.addToCartCount,
      checkoutStartedCount: page.checkoutStartedCount,
      paymentSubmittedCount: page.paymentSubmittedCount,
      checkoutCompletedCount: page.checkoutCompletedCount,
      orderCount: 0,
      revenue: 0,
      refundLoss: 0,
      estimatedProfit: 0,
      paymentAttemptCount: 0,
      paymentSuccessCount: 0,
      paymentFailureCount: 0,
      firstOrderCount: 0,
    });
  }

  for (const order of orders as DecisionOrder[]) {
    const channel = classifyChannel(order);
    const channelLabel = String(channel);
    const financialStatus = normalizeFinancialStatus(order.financialStatus);
    const landingPage = normalizeLandingPage(order.landingSite);
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
      financialStatus,
      landingPageTitle: landingPage?.title ?? null,
      isFirstOrder: order.isFirstOrder,
    });

    if (landingPage) {
      const existing = landingPageMap.get(landingPage.key);
      const next =
        existing ??
        {
          key: landingPage.key,
          title: landingPage.title,
          sessions: null,
          pageViews: null,
          addToCartCount: null,
          checkoutStartedCount: null,
          paymentSubmittedCount: null,
          checkoutCompletedCount: null,
          orderCount: 0,
          revenue: 0,
          refundLoss: 0,
          estimatedProfit: 0,
          paymentAttemptCount: 0,
          paymentSuccessCount: 0,
          paymentFailureCount: 0,
          firstOrderCount: 0,
        };
      next.orderCount += 1;
      next.revenue += order.totalPrice;
      next.refundLoss += refundLoss;
      next.estimatedProfit += orderEstimatedProfit;
      if (order.isFirstOrder) next.firstOrderCount += 1;
      if (financialStatus !== null) next.paymentAttemptCount += 1;
      if (isPaymentSuccessStatus(financialStatus)) next.paymentSuccessCount += 1;
      if (isPaymentFailureStatus(financialStatus)) next.paymentFailureCount += 1;
      landingPageMap.set(landingPage.key, next);
    }

    if (isPaymentFailureStatus(financialStatus)) {
      paymentRiskOrders.push({
        key: order.shopifyOrderId,
        title: `#${order.orderNumber}`,
        revenue: order.totalPrice,
        itemCount: order.lineItems.reduce((sum, line) => sum + line.quantity, 0),
        channelLabel,
        financialStatus,
        landingPageTitle: landingPage?.title ?? null,
      });
    }
  }

  const products = Array.from(productMap.values()).map((product) => ({
    ...product,
    estimatedMargin: safeDivide(product.estimatedProfit, product.revenue || 1),
  }));
  const landingPages = Array.from(landingPageMap.values())
    .map((page) => ({
      key: page.key,
      title: page.title,
      sessions: page.sessions,
      pageViews: page.pageViews,
      addToCartCount: page.addToCartCount,
      checkoutStartedCount: page.checkoutStartedCount,
      paymentSubmittedCount: page.paymentSubmittedCount,
      checkoutCompletedCount: page.checkoutCompletedCount,
      orderCount: page.orderCount,
      revenue: page.revenue,
      refundLoss: page.refundLoss,
      estimatedProfit: page.estimatedProfit,
      estimatedMargin: safeDivide(page.estimatedProfit, page.revenue || 1),
      firstOrderShare: safeDivide(page.firstOrderCount, page.orderCount || 1),
      paymentAttemptCount: page.paymentAttemptCount,
      paymentSuccessCount: page.paymentSuccessCount,
      paymentFailureCount: page.paymentFailureCount,
    }))
    .sort((left, right) => right.orderCount - left.orderCount || right.revenue - left.revenue);

  return {
    currency: orders[0]?.currency ?? "USD",
    products: products.sort((left, right) => right.revenue - left.revenue),
    orders: orderRows.sort((left, right) => right.revenue - left.revenue),
    landingPages,
    paymentRiskOrders: paymentRiskOrders.sort((left, right) => right.revenue - left.revenue),
    pageSignalStatus,
  };
}

function toSummaryMetric(label: string, value: string): TodaySummaryMetric {
  return { label, value };
}

function normalizeFinancialStatus(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function isPaymentSuccessStatus(value: string | null | undefined): boolean {
  const normalized = normalizeFinancialStatus(value);
  return normalized === "paid" || normalized?.includes("paid") === true;
}

function isPaymentFailureStatus(value: string | null | undefined): boolean {
  const normalized = normalizeFinancialStatus(value);
  return normalized === "voided" || normalized === "pending" || normalized === "authorized";
}

function formatFinancialStatusLabel(value: string | null | undefined): string {
  const normalized = normalizeFinancialStatus(value);
  if (normalized === "paid") return "已支付";
  if (normalized === "partially_paid") return "部分支付";
  if (normalized === "partially_refunded") return "部分退款";
  if (normalized === "refunded") return "已退款";
  if (normalized === "pending") return "待支付";
  if (normalized === "authorized") return "已授权未完成";
  if (normalized === "voided") return "支付已作废";
  return normalized ?? "待确认";
}

function normalizeLandingPage(value: string | null | undefined): { key: string; title: string } | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, "https://placeholder.invalid");
    const pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return {
      key: pathname,
      title: pathname === "/" ? "首页 /" : pathname,
    };
  } catch {
    const pathname = raw.replace(/^https?:\/\/[^/]+/i, "").split("?")[0]?.trim() || "/";
    const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return {
      key: normalized,
      title: normalized === "/" ? "首页 /" : normalized,
    };
  }
}

type PageEventAggregate = {
  key: string;
  title: string;
  sessions: number;
  pageViews: number;
  addToCartCount: number;
  checkoutStartedCount: number;
  paymentSubmittedCount: number;
  checkoutCompletedCount: number;
};

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function pickNestedValue(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function extractPixelPagePath(payloadRaw: string | null | undefined): { key: string; title: string } | null {
  const payload = parseJsonObject(payloadRaw);
  const candidates = [
    pickNestedValue(payload, ["context", "document", "location", "href"]),
    pickNestedValue(payload, ["context", "document", "location", "pathname"]),
    pickNestedValue(payload, ["context", "url"]),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const normalized = normalizeLandingPage(candidate);
      if (normalized) return normalized;
    }
  }
  return null;
}

async function loadPageEventAggregates(
  shop: string,
  selectedCountry: string,
  now: Date,
): Promise<{ status: PageSignalStatus; pages: PageEventAggregate[] }> {
  if (selectedCountry !== TODAY_ALL_COUNTRIES) {
    return { status: "country_unavailable", pages: [] };
  }
  const cfg = getAliyunLogConfig();
  if (!cfg) {
    return { status: "not_configured", pages: [] };
  }
  const client = getSlsClient();
  if (!client) {
    return { status: "not_configured", pages: [] };
  }

  const todayStart = startOfUtcDay(now);
  const since = addUtcDays(todayStart, -7);
  const safeShop = shop.trim().toLowerCase().replace(/"/g, '\\"');
  const baseQuery = `shopName: "${safeShop}"`;
  const eventConfigs = [
    { topic: PIXEL_FUNNEL_EVENTS.pageViewed, kind: "page_view" as const },
    { topic: PIXEL_FUNNEL_EVENTS.addedToCart, kind: "add_to_cart" as const },
    { topic: PIXEL_FUNNEL_EVENTS.checkoutStarted, kind: "checkout_started" as const },
    { topic: PIXEL_FUNNEL_EVENTS.paymentSubmitted, kind: "payment_submitted" as const },
    { topic: PIXEL_FUNNEL_EVENTS.checkoutCompleted, kind: "checkout_completed" as const },
  ];

  try {
    const results = await Promise.all(
      eventConfigs.map(({ topic }) =>
        client.getLogs(
          cfg.project,
          cfg.logstore,
          since,
          todayStart,
          { query: baseQuery, topic, line: 5000 },
        ),
      ),
    );

    const pageMap = new Map<
      string,
      PageEventAggregate & {
        sessionClientIds: Set<string>;
      }
    >();

    const getPageAggregate = (page: { key: string; title: string }) => {
      const existing = pageMap.get(page.key);
      if (existing) return existing;
      const next = {
        key: page.key,
        title: page.title,
        sessions: 0,
        pageViews: 0,
        addToCartCount: 0,
        checkoutStartedCount: 0,
        paymentSubmittedCount: 0,
        checkoutCompletedCount: 0,
        sessionClientIds: new Set<string>(),
      };
      pageMap.set(page.key, next);
      return next;
    };

    results.forEach((rows, index) => {
      const kind = eventConfigs[index]?.kind;
      for (const row of rows) {
        const page = extractPixelPagePath(row.payload);
        if (!page) continue;
        const aggregate = getPageAggregate(page);
        if (kind === "page_view") {
          aggregate.pageViews += 1;
          const clientId = row.clientId?.trim();
          if (clientId) aggregate.sessionClientIds.add(clientId);
        } else if (kind === "add_to_cart") {
          aggregate.addToCartCount += 1;
        } else if (kind === "checkout_started") {
          aggregate.checkoutStartedCount += 1;
        } else if (kind === "payment_submitted") {
          aggregate.paymentSubmittedCount += 1;
        } else if (kind === "checkout_completed") {
          aggregate.checkoutCompletedCount += 1;
        }
      }
    });

    const pages = Array.from(pageMap.values())
      .map(({ sessionClientIds, ...page }) => ({
        ...page,
        sessions: sessionClientIds.size,
      }))
      .sort((left, right) => right.sessions - left.sessions || right.pageViews - left.pageViews);

    return { status: "loaded", pages };
  } catch (error) {
    console.warn("[todayGeo] loadPageEventAggregates failed:", error);
    return { status: "query_failed", pages: [] };
  }
}

function pageTrafficBase(page: LandingPageAggregate): number {
  if ((page.sessions ?? 0) > 0) return page.sessions ?? 0;
  return page.pageViews ?? 0;
}

function pageHasSignals(page: LandingPageAggregate): boolean {
  return (page.sessions ?? 0) > 0 || (page.pageViews ?? 0) > 0 || (page.addToCartCount ?? 0) > 0;
}

function pageHasCheckoutCompletionSignals(page: LandingPageAggregate): boolean {
  return (page.paymentSubmittedCount ?? 0) > 0 || (page.checkoutCompletedCount ?? 0) > 0;
}

function pageAddToCartRate(page: LandingPageAggregate): number {
  return safeDivide(page.addToCartCount ?? 0, pageTrafficBase(page) || 1);
}

function pageCheckoutStartRate(page: LandingPageAggregate): number {
  return safeDivide(page.checkoutStartedCount ?? 0, (page.addToCartCount ?? 0) || 1);
}

function pageCheckoutCompleteRate(page: LandingPageAggregate): number {
  return safeDivide(page.checkoutCompletedCount ?? 0, (page.checkoutStartedCount ?? 0) || 1);
}

function pagePaymentCompletionRate(page: LandingPageAggregate): number {
  const paymentSubmittedCount = page.paymentSubmittedCount ?? 0;
  if (paymentSubmittedCount > 0) {
    return safeDivide(page.checkoutCompletedCount ?? 0, paymentSubmittedCount);
  }
  return safeDivide(page.paymentSuccessCount, page.paymentAttemptCount || 1);
}

function pageOrderRateProxy(page: LandingPageAggregate): number {
  return safeDivide(page.orderCount, pageTrafficBase(page) || 1);
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

function buildLandingPageObjectCard(
  page: LandingPageAggregate,
  currency: string,
  reportTitle: string,
  mode: "traffic" | "conversion",
): TodayObjectCard {
  const hasPageSignals = pageHasSignals(page);
  const hasCheckoutCompletionSignals = pageHasCheckoutCompletionSignals(page);
  const paymentFailureRate = safeDivide(page.paymentFailureCount, page.paymentAttemptCount || 1);
  const addToCartRate = pageAddToCartRate(page);
  const checkoutStartRate = pageCheckoutStartRate(page);
  const checkoutCompleteRate = pageCheckoutCompleteRate(page);
  const paymentCompletionRate = pagePaymentCompletionRate(page);
  const orderRateProxy = pageOrderRateProxy(page);
  const stableTrafficPage = hasPageSignals
    ? pageTrafficBase(page) >= 30 && addToCartRate >= 0.04
    : page.estimatedProfit > 0 && page.estimatedMargin >= 0.1;
  const stableConversionPage =
    hasCheckoutCompletionSignals
      ? addToCartRate >= 0.03 && checkoutStartRate >= 0.2 && checkoutCompleteRate >= 0.35
      : page.paymentAttemptCount > 0
        ? paymentFailureRate < 0.15 && orderRateProxy >= 0.01
        : hasPageSignals
          ? addToCartRate >= 0.03 && checkoutStartRate >= 0.2
          : page.estimatedProfit > 0 && page.refundLoss <= 0;
  const isHealthy = mode === "traffic" ? stableTrafficPage : stableConversionPage;

  return {
    id: page.key,
    title: page.title,
    objectType: "page",
    metrics: [
      toSummaryMetric(
        hasPageSignals ? "会话" : "订单数",
        hasPageSignals ? formatInteger(page.sessions ?? page.pageViews ?? 0) : formatInteger(page.orderCount),
      ),
      toSummaryMetric(
        mode === "traffic" ? "加购触达率" : "结账触发率",
        mode === "traffic" ? formatPercent(addToCartRate) : formatPercent(checkoutStartRate),
      ),
      toSummaryMetric(
        mode === "traffic"
          ? "订单转化代理"
          : hasCheckoutCompletionSignals
            ? "完成支付率"
            : "支付风险率",
        mode === "traffic"
          ? formatPercent(orderRateProxy)
          : hasCheckoutCompletionSignals
            ? formatPercent(paymentCompletionRate)
            : formatPercent(paymentFailureRate),
      ),
    ],
    summary:
      mode === "traffic"
        ? isHealthy
          ? "这个落地页最近承接出来的订单质量更稳，适合作为继续放量前的页面样本。"
          : "这个落地页已经承接到订单，但质量偏弱，继续引流前要先看页面预期和内容匹配。"
        : isHealthy
          ? "这个页面最近的结账完成相对稳定，更适合作为当前转化承接的健康样本。"
          : "这个页面已经出现明显支付或成交后风险，优先级应该放在先修承接与结账链路。",
    primaryActionLabel:
      mode === "traffic"
        ? isHealthy
          ? "查看页面样本"
          : "查看承接问题"
        : isHealthy
          ? "查看承接样本"
          : "查看支付风险",
    report: {
      title: page.title,
      subtitle: `${reportTitle} / 页面对象`,
      headlineMetrics: [
        toSummaryMetric("会话", hasPageSignals ? formatInteger(page.sessions ?? page.pageViews ?? 0) : "待补"),
        toSummaryMetric("加购触达率", hasPageSignals ? formatPercent(addToCartRate) : "待补"),
        toSummaryMetric("结账触发率", hasPageSignals ? formatPercent(checkoutStartRate) : "待补"),
        toSummaryMetric(
          mode === "traffic" ? "订单转化代理" : "完成支付率",
          mode === "traffic"
            ? formatPercent(orderRateProxy)
            : hasCheckoutCompletionSignals
              ? formatPercent(paymentCompletionRate)
              : "待补",
        ),
        toSummaryMetric("收入", formatCurrency(page.revenue, currency)),
        toSummaryMetric("支付风险率", formatPercent(paymentFailureRate)),
      ],
      conclusion:
        mode === "traffic"
          ? isHealthy
            ? "这个页面目前更像健康承接页，下一步适合确认它是否还能稳定接住更多有效流量。"
            : "这个页面的问题不是没有流量，而是落地后的订单质量已经开始变弱。"
          : isHealthy
            ? "这个页面当前转化承接相对稳定，更适合作为可复制样本。"
            : "这个页面已经暴露出支付或末端承接风险，应该先排查页面承诺、支付和信任信息。",
      analysisPoints: [
        `最近 7 天会话 ${hasPageSignals ? formatInteger(page.sessions ?? page.pageViews ?? 0) : "待补"}，订单 ${formatInteger(page.orderCount)}，收入 ${formatCurrency(page.revenue, currency)}。`,
        mode === "traffic"
          ? `当前加购触达率 ${formatPercent(addToCartRate)}，订单转化代理 ${formatPercent(orderRateProxy)}，首单占比 ${formatPercent(page.firstOrderShare)}。`
          : hasCheckoutCompletionSignals
            ? `当前结账触发率 ${formatPercent(checkoutStartRate)}，完成支付率 ${formatPercent(paymentCompletionRate)}，支付失败 ${formatInteger(page.paymentFailureCount)} 次。`
            : `当前结账触发率 ${formatPercent(checkoutStartRate)}，支付失败 ${formatInteger(page.paymentFailureCount)} 次，风险率 ${formatPercent(paymentFailureRate)}。`,
        hasPageSignals
          ? hasCheckoutCompletionSignals
            ? "当前页面对象已混入 page_viewed / product_added_to_cart / checkout_started / payment_info_submitted / checkout_completed 事件，再用 landingSite 订单结果补齐成交后风险。"
            : "当前页面对象已混入 page_viewed / product_added_to_cart / checkout_started 事件，再用 landingSite 订单结果补齐后段结果。"
          : "当前页面对象仍以订单 landingSite 聚合为主，待接入页面像素事件后再补会话与前段漏斗口径。",
      ],
      actions: [
        {
          title: mode === "traffic" ? "先复核页面预期是否匹配来源" : "先排查页面与支付链路",
          detail:
            mode === "traffic"
              ? "不要只看流量进来没有，要确认页面承诺、内容和来源意图是否一致。"
              : "优先复核运费、支付方式、信任信息和结账体验是否在末端制造掉点。",
          priority: "P0",
        },
        {
          title: mode === "traffic" ? "联动来源对象一起看" : "联动支付失败订单一起看",
          detail:
            mode === "traffic"
              ? "页面解释承接质量，来源对象解释流量从哪里来。"
              : "页面解释掉点位置，支付失败订单更适合解释异常是如何发生的。",
          priority: "P1",
        },
      ],
    },
  };
}

function buildPaymentFailureOrderObjectCard(order: PaymentRiskOrderAggregate, currency: string): TodayObjectCard {
  return {
    id: order.key,
    title: order.title,
    objectType: "order",
    metrics: [
      toSummaryMetric("订单金额", formatCurrency(order.revenue, currency)),
      toSummaryMetric("支付状态", formatFinancialStatusLabel(order.financialStatus)),
      toSummaryMetric("来源", order.channelLabel),
    ],
    summary: "这笔订单已经进入支付风险区，优先级应该放在先确认支付链路和页面承诺是否一致。",
    primaryActionLabel: "查看支付风险",
    report: {
      title: order.title,
      subtitle: "转化分析 / 支付失败订单",
      headlineMetrics: [
        toSummaryMetric("订单金额", formatCurrency(order.revenue, currency)),
        toSummaryMetric("商品件数", formatInteger(order.itemCount)),
        toSummaryMetric("支付状态", formatFinancialStatusLabel(order.financialStatus)),
        toSummaryMetric("落地页", order.landingPageTitle ?? "待补"),
      ],
      conclusion: "这笔订单说明用户已经走到支付末端，但仍然没有完成闭环，应该优先排查支付与结账链路。",
      analysisPoints: [
        `订单金额 ${formatCurrency(order.revenue, currency)}，商品件数 ${formatInteger(order.itemCount)}，来源 ${order.channelLabel}。`,
        `当前支付状态 ${formatFinancialStatusLabel(order.financialStatus)}，落地页 ${order.landingPageTitle ?? "待补"}。`,
        "建议把它和同页面、同来源的订单放在一起看，判断是个体异常还是结构性支付问题。",
      ],
      actions: [
        {
          title: "优先排查支付失败原因",
          detail: "先确认支付方式、运费、风控校验或信任信息是否在结账末端制造阻碍。",
          priority: "P0",
        },
        {
          title: "联动页面对象一起看",
          detail: "支付失败订单解释结果，页面对象更适合解释掉点更早是从哪里开始出现的。",
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

type SessionSourceAggregate = {
  key: string;
  label: string;
  sessions: number;
  conversionRate: number;
  sessionShare: number;
  orders: number | null;
  revenue: number | null;
  estimatedReturnMultiple: number | null;
};

function normalizeSourceKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildSessionSourceAggregates(
  sessionScope: SessionScopeData | null,
  orderScope: OrderScopeData,
): SessionSourceAggregate[] {
  const channelMap = new Map(
    orderScope.channelRows.map((row) => [normalizeSourceKey(row.channel), row] as const),
  );
  const totalSessions = sessionScope?.summary.sessions ?? 0;

  return (sessionScope?.referrers ?? []).map((source) => {
    const matchedChannel = channelMap.get(normalizeSourceKey(source.referrer));
    return {
      key: normalizeSourceKey(source.referrer),
      label: source.referrer,
      sessions: source.sessions,
      conversionRate: source.conversionRate,
      sessionShare: safeDivide(source.sessions, totalSessions || 1),
      orders: matchedChannel?.orders ?? null,
      revenue: matchedChannel?.revenue ?? null,
      estimatedReturnMultiple: matchedChannel?.estimatedReturnMultiple ?? null,
    };
  });
}

function buildSessionSourceObjectCard(
  source: SessionSourceAggregate,
  overallConversionRate: number,
  currency: string,
  reportTitle: string,
): TodayObjectCard {
  const qualitySummary =
    source.conversionRate >= overallConversionRate
      ? "这个来源当前承接相对稳定，更适合继续看入口质量和放量空间。"
      : "这个来源会话有了，但承接偏弱，继续放量前要先确认入口质量。";

  return {
    id: source.key,
    title: source.label,
    objectType: "channel",
    metrics: [
      toSummaryMetric("会话", formatInteger(source.sessions)),
      toSummaryMetric("转化率", formatPercent(source.conversionRate)),
      toSummaryMetric("会话占比", formatPercent(source.sessionShare)),
    ],
    summary: qualitySummary,
    primaryActionLabel: source.conversionRate >= overallConversionRate ? "查看承接样本" : "查看低质量原因",
    report: {
      title: source.label,
      subtitle: `${reportTitle} / 来源对象`,
      headlineMetrics: [
        toSummaryMetric("会话", formatInteger(source.sessions)),
        toSummaryMetric("转化率", formatPercent(source.conversionRate)),
        toSummaryMetric("会话占比", formatPercent(source.sessionShare)),
        toSummaryMetric(
          source.revenue != null ? "收入" : "订单数",
          source.revenue != null
            ? formatCurrency(source.revenue, currency)
            : source.orders != null
              ? formatInteger(source.orders)
              : "待接入",
        ),
      ],
      conclusion:
        source.conversionRate >= overallConversionRate
          ? "这个来源当前更像健康样本，适合继续看它能否稳定承接更多有效会话。"
          : "这个来源的问题不是有没有量，而是会话进来后没有形成足够承接。",
      analysisPoints: [
        `最近 7 天会话 ${formatInteger(source.sessions)}，转化率 ${formatPercent(source.conversionRate)}，会话占比 ${formatPercent(source.sessionShare)}。`,
        source.revenue != null
          ? `当前已关联到收入 ${formatCurrency(source.revenue, currency)}，估算经营回报 ${formatMultiple(source.estimatedReturnMultiple)}。`
          : "当前订单侧暂未能稳定关联同名来源，先保留流量口径判断。",
        "建议先结合入口页、加购触达和后续订单质量一起看，不要只看会话规模。",
      ],
      actions: [
        {
          title: source.conversionRate >= overallConversionRate ? "继续放大前先看承接稳定性" : "先收紧低质量入口",
          detail:
            source.conversionRate >= overallConversionRate
              ? "确认这个来源的承接质量是否可持续，再决定是否加码。"
              : "避免继续把会话压在没有形成承接的来源上。",
          priority: "P0",
        },
        {
          title: "联动订单对象一起看",
          detail: "来源对象解释输入质量，订单对象更适合解释成交后结果有没有留下来。",
          priority: "P1",
        },
      ],
    },
  };
}

type RevenueFocus = "revenue" | "orders" | "aov";

type ProfitFocus = "profit" | "cost" | "margin";

type RoiFocus = "overview" | "channels" | "loss";

function normalizeRevenueFocus(focus?: string | null): RevenueFocus {
  return focus === "orders" || focus === "aov" ? focus : "revenue";
}

function normalizeProfitFocus(focus?: string | null): ProfitFocus {
  return focus === "cost" || focus === "margin" ? focus : "profit";
}

function normalizeRoiFocus(focus?: string | null): RoiFocus {
  return focus === "channels" || focus === "loss" ? focus : "overview";
}

function buildTrafficReport(
  sessionScope: SessionScopeData | null,
  orderScope: OrderScopeData,
  objectData: DecisionObjectData,
  selectedCountryLabel: string,
): TodayDecisionReport {
  const sessionsYesterday = sessionScope?.trend[sessionScope.trend.length - 1]?.sessions ?? 0;
  const avgSessions = sessionScope?.trend.length
    ? safeDivide(sessionScope.trend.reduce((sum, item) => sum + item.sessions, 0), sessionScope.trend.length)
    : 0;
  const pageviewsPerSession = sessionScope ? safeDivide(sessionScope.summary.pageviews, sessionScope.summary.sessions || 1) : 0;
  const cartRate = sessionScope ? safeDivide(sessionScope.summary.sessionsWithCartAdditions, sessionScope.summary.sessions || 1) : 0;
  const checkoutReachRate = sessionScope
    ? safeDivide(sessionScope.summary.sessionsThatReachedCheckout, sessionScope.summary.sessions || 1)
    : 0;
  const overallConversionRate = sessionScope?.summary.conversionRate ?? 0;
  const sources = buildSessionSourceAggregates(sessionScope, orderScope);
  const topTrafficSources = [...sources].sort((left, right) => right.sessions - left.sessions).slice(0, 3);
  const lowQualitySources = [...sources]
    .filter(
      (source) =>
        source.sessions >= Math.max(30, safeDivide(sessionScope?.summary.sessions ?? 0, 20)) &&
        source.conversionRate < Math.max(overallConversionRate * 0.75, 0.005),
    )
    .sort((left, right) => right.sessions - left.sessions)
    .slice(0, 3);
  const weakSourceSessionShare = lowQualitySources.reduce((sum, item) => sum + item.sessionShare, 0);
  const pageSignalPages = objectData.landingPages.filter((page) => (page.sessions ?? 0) > 0 || (page.pageViews ?? 0) > 0);
  const healthyLandingPages = [...objectData.landingPages]
    .filter((page) =>
      pageSignalPages.length > 0
        ? pageTrafficBase(page) >= 30 && pageAddToCartRate(page) >= 0.04
        : page.orderCount >= 1 && page.estimatedProfit > 0,
    )
    .sort((left, right) =>
      pageSignalPages.length > 0
        ? pageTrafficBase(right) - pageTrafficBase(left) || pageAddToCartRate(right) - pageAddToCartRate(left)
        : right.orderCount - left.orderCount || right.revenue - left.revenue,
    )
    .slice(0, 3);
  const weakLandingPages = [...objectData.landingPages]
    .filter(
      (page) =>
        pageSignalPages.length > 0
          ? pageTrafficBase(page) >= Math.max(30, safeDivide(sessionScope?.summary.sessions ?? 0, 30)) &&
            pageAddToCartRate(page) < Math.max(cartRate * 0.6, 0.02)
          : page.orderCount >= Math.max(2, safeDivide(objectData.orders.length, 12)) &&
            (page.estimatedMargin < 0.08 || page.refundLoss > 0),
    )
    .sort((left, right) =>
      pageSignalPages.length > 0
        ? pageTrafficBase(right) - pageTrafficBase(left) || pageAddToCartRate(left) - pageAddToCartRate(right)
        : right.orderCount - left.orderCount || right.refundLoss - left.refundLoss,
    )
    .slice(0, 3);
  const weakLandingPageOrders = weakLandingPages.reduce((sum, page) => sum + page.orderCount, 0);
  const weakLandingPageSessions = weakLandingPages.reduce((sum, page) => sum + pageTrafficBase(page), 0);
  const groups: TodayEvidenceGroup[] = [
    {
      key: "high_traffic_sources",
      title: "Top 高流量来源",
      tone: "positive",
      summary: "这些来源当前带来了主要会话，适合作为继续复核入口质量的主样本。",
      items: topTrafficSources.map((source) =>
        buildSessionSourceObjectCard(source, overallConversionRate, objectData.currency, "流量分析"),
      ),
    },
    {
      key: "low_quality_sources",
      title: "Top 高流量低质量来源",
      tone: "negative",
      summary: "这些来源会话不低，但承接明显偏弱，优先级应该放在先修入口与承接。",
      items: lowQualitySources.map((source) =>
        buildSessionSourceObjectCard(source, overallConversionRate, objectData.currency, "流量分析"),
      ),
    },
    {
      key: "healthy_landing_pages",
      title: "Top 承接较稳页面",
      tone: "positive",
      summary: "这些页面当前接住了更多订单，适合作为继续校验页面承接的主样本。",
      items: healthyLandingPages.map((page) =>
        buildLandingPageObjectCard(page, objectData.currency, "流量分析", "traffic"),
      ),
    },
    {
      key: "weak_landing_pages",
      title: "Top 承接偏弱页面",
      tone: "warning",
      summary: "这些页面已经承接出订单，但订单质量偏弱，继续引流前应该先修页面承接。",
      items: weakLandingPages.map((page) =>
        buildLandingPageObjectCard(page, objectData.currency, "流量分析", "traffic"),
      ),
    },
  ].filter((group) => group.items.length > 0);

  return {
    key: "traffic",
    title: "流量分析",
    subtitle: `当前查看范围：${selectedCountryLabel}。这里重点判断哪些来源真的带来了有效承接，哪些来源只是把会话堆上去。`,
    accent: "焦点：来源与承接",
    primaryQuestion: "最近进来的流量，是真的在形成有效承接，还是只是在堆会话？",
    summary:
      sessionScope === null
        ? "当前缺少 Storefront sessions 口径，先保留订单侧证据和已有来源入口，避免流量页空白。"
        : pageSignalPages.length > 0 && weakLandingPages.length > 0
          ? "当前已经能定位到高会话但低承接页面，优先级应该先放在修页面，而不是继续冲量。"
          : lowQualitySources.length > 0
          ? "当前已经能定位到高会话但低质量的来源，优先级应该先放在修承接而不是继续冲量。"
          : "当前主要来源的承接还算稳定，更适合继续识别哪些入口值得继续放大。",
    statuses: [
      {
        label: "流量规模",
        status: sessionScope === null ? "watch" : statusFromRatio(safeDivide(sessionsYesterday, avgSessions || 1), 0.9, 0.75),
        detail:
          sessionScope === null
            ? "当前未取到 Storefront sessions 趋势，流量规模先保留为待补数据。"
            : `昨日会话 ${formatInteger(sessionsYesterday)}，近 7 日均值 ${formatInteger(avgSessions)}。`,
      },
      {
        label: "页面深度",
        status: sessionScope === null ? "watch" : pageviewsPerSession < 1.8 ? "risk" : pageviewsPerSession < 2.3 ? "watch" : "healthy",
        detail:
          sessionScope === null
            ? "当前未取到页/会话口径，先用来源和订单结果做代理判断。"
            : `当前页/会话 ${pageviewsPerSession.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}。`,
      },
      {
        label: "来源质量",
        status: lowQualitySources.length >= 2 ? "risk" : lowQualitySources.length === 1 ? "watch" : "healthy",
        detail:
          sessionScope === null
            ? "当前未取到来源级 sessions，来源质量先保留为待补口径。"
            : `低质量来源会话占比 ${formatPercent(weakSourceSessionShare)}。`,
      },
    ],
    summaryMetrics: [
      toSummaryMetric("近 7 天会话", sessionScope ? formatInteger(sessionScope.summary.sessions) : "待补"),
      toSummaryMetric(
        "页/会话",
        sessionScope
          ? pageviewsPerSession.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })
          : "待补",
      ),
      toSummaryMetric("加购触达率", sessionScope ? formatPercent(cartRate) : "待补"),
      toSummaryMetric("到达结账率", sessionScope ? formatPercent(checkoutReachRate) : "待补"),
    ],
    breakdowns: [
      {
        key: "traffic-by-source",
        title: "流量拆到来源",
        summary: "先确认会话主要来自哪里，再判断这些来源有没有把流量带成有效承接。",
        rows: [
          {
            label: "高流量来源会话",
            value: formatInteger(topTrafficSources.reduce((sum, item) => sum + item.sessions, 0)),
            meta: "当前会话占比最高的来源集合。",
          },
          {
            label: "低质量来源会话",
            value: formatInteger(lowQualitySources.reduce((sum, item) => sum + item.sessions, 0)),
            meta: "会话有了，但来源转化率明显低于整体。",
          },
          {
            label: "来源数量",
            value: String(sources.length),
            meta: "当前来源判断基于 Shopify sessions 的 referrer_source 口径。",
          },
        ],
        relatedGroupKeys: ["high_traffic_sources", "low_quality_sources"],
      },
      {
        key: "traffic-by-acceptance",
        title: "流量承接信号",
        summary: "当页深和加购触达开始走弱时，就不能再把会话增长直接当成健康增长。",
        rows: [
          {
            label: "页/会话",
            value: pageviewsPerSession.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }),
            meta: "页面深度越浅，越要回头看入口页是否接住了流量。",
          },
          {
            label: "加购触达率",
            value: formatPercent(cartRate),
            meta: "这是判断流量有没有形成初步承接的第一道信号。",
          },
          {
            label: pageSignalPages.length > 0 ? "承接偏弱页面会话" : "承接偏弱页面订单",
            value: formatInteger(pageSignalPages.length > 0 ? weakLandingPageSessions : weakLandingPageOrders),
            meta:
              pageSignalPages.length > 0
                ? "当前已按页面事件聚合会话与加购信号，再用订单结果补看后段承接。"
                : "当前页面对象先按 landingSite 聚合，用订单质量先做代理承接判断。",
          },
          {
            label: "到达结账率",
            value: formatPercent(checkoutReachRate),
            meta: "如果这里开始掉点，下一步更适合继续到转化页看页面和支付风险。",
          },
        ],
        relatedGroupKeys: ["healthy_landing_pages", "weak_landing_pages"],
      },
    ],
    groups,
    actions: [
      {
        title: "先收紧高会话低质量来源",
        detail: "别再把会话增长直接当成健康增长，先确认入口与承接为什么接不住。",
        priority: "P0",
      },
      {
        title: "优先修高流量入口承接",
        detail: "页/会话和加购触达走弱时，应该先看入口页和落地预期是否匹配。",
        priority: "P1",
      },
      {
        title: "联动转化页复核掉点",
        detail: "如果流量已经进来但到达结账率偏低，下一步直接去转化页看漏斗掉点。",
        priority: "P2",
      },
    ],
    conclusionPoints: [
      "流量页最先回答的是来源质量和承接信号，而不是只看会话有没有涨。",
      pageSignalPages.length > 0
        ? "页面对象已经混入 page_viewed / product_added_to_cart / checkout_started 事件，不再只是订单代理。"
        : "页面对象当前仍以 landingSite 订单代理为主，后续还要继续补 page-level sessions。",
      "后续这里优先增强页面承接信号，而不是再回到只堆来源总表。",
    ],
  };
}

function buildConversionReport(
  sessionScope: SessionScopeData | null,
  _orderScope: OrderScopeData,
  objectData: DecisionObjectData,
  selectedCountryLabel: string,
): TodayDecisionReport {
  const conversionRate = sessionScope?.summary.conversionRate ?? 0;
  const cartRate = sessionScope ? safeDivide(sessionScope.summary.sessionsWithCartAdditions, sessionScope.summary.sessions || 1) : 0;
  const checkoutReachRate = sessionScope
    ? safeDivide(sessionScope.summary.sessionsThatReachedCheckout, sessionScope.summary.sessions || 1)
    : 0;
  const checkoutCompleteRate = sessionScope
    ? safeDivide(sessionScope.summary.sessionsThatCompletedCheckout, sessionScope.summary.sessions || 1)
    : 0;
  const pageSignalPages = objectData.landingPages.filter((page) => pageHasSignals(page));
  const pageCompletionSignalPages = objectData.landingPages.filter((page) => pageHasCheckoutCompletionSignals(page));
  const stableLandingPages = [...objectData.landingPages]
    .filter((page) =>
      pageHasCheckoutCompletionSignals(page)
        ? pageTrafficBase(page) >= 30 &&
          pageAddToCartRate(page) >= Math.max(cartRate * 0.7, 0.03) &&
          pageCheckoutStartRate(page) >= 0.2 &&
          pageCheckoutCompleteRate(page) >= 0.35
        : pageHasSignals(page)
          ? pageTrafficBase(page) >= 30 &&
            pageAddToCartRate(page) >= Math.max(cartRate * 0.7, 0.03) &&
            pageOrderRateProxy(page) >= Math.max(conversionRate * 0.7, 0.008)
        : page.orderCount >= 1 && safeDivide(page.paymentFailureCount, page.paymentAttemptCount || 1) < 0.15,
    )
    .sort((left, right) =>
      pageHasCheckoutCompletionSignals(left) !== pageHasCheckoutCompletionSignals(right)
        ? Number(pageHasCheckoutCompletionSignals(right)) - Number(pageHasCheckoutCompletionSignals(left))
      : pageHasCheckoutCompletionSignals(left)
        ? pageCheckoutCompleteRate(right) - pageCheckoutCompleteRate(left) ||
          pagePaymentCompletionRate(right) - pagePaymentCompletionRate(left) ||
          pageAddToCartRate(right) - pageAddToCartRate(left)
        : pageHasSignals(left) || pageHasSignals(right)
          ? pageOrderRateProxy(right) - pageOrderRateProxy(left) || pageAddToCartRate(right) - pageAddToCartRate(left)
        : right.paymentSuccessCount - left.paymentSuccessCount || right.orderCount - left.orderCount,
    )
    .slice(0, 3);
  const paymentRiskPages = [...objectData.landingPages]
    .filter((page) =>
      pageHasCheckoutCompletionSignals(page)
        ? pageTrafficBase(page) >= 30 &&
          (pageAddToCartRate(page) < Math.max(cartRate * 0.6, 0.02) ||
            pageCheckoutStartRate(page) < 0.15 ||
            pageCheckoutCompleteRate(page) < 0.25 ||
            pagePaymentCompletionRate(page) < 0.5 ||
            page.paymentFailureCount > 0)
        : pageHasSignals(page)
        ? pageTrafficBase(page) >= 30 &&
          (pageAddToCartRate(page) < Math.max(cartRate * 0.6, 0.02) ||
            pageOrderRateProxy(page) < Math.max(conversionRate * 0.5, 0.004) ||
            page.paymentFailureCount > 0)
        : page.paymentFailureCount > 0,
    )
    .sort(
      (left, right) =>
        pageHasCheckoutCompletionSignals(left) !== pageHasCheckoutCompletionSignals(right)
          ? Number(pageHasCheckoutCompletionSignals(right)) - Number(pageHasCheckoutCompletionSignals(left))
        : pageHasCheckoutCompletionSignals(left)
          ? pageTrafficBase(right) - pageTrafficBase(left) ||
            pageCheckoutCompleteRate(left) - pageCheckoutCompleteRate(right) ||
            pagePaymentCompletionRate(left) - pagePaymentCompletionRate(right) ||
            right.paymentFailureCount - left.paymentFailureCount
        : pageHasSignals(left) || pageHasSignals(right)
          ? pageTrafficBase(right) - pageTrafficBase(left) ||
            pageOrderRateProxy(left) - pageOrderRateProxy(right) ||
            right.paymentFailureCount - left.paymentFailureCount
          : right.paymentFailureCount - left.paymentFailureCount ||
            right.orderCount - left.orderCount ||
            right.revenue - left.revenue,
    )
    .slice(0, 3);
  const paymentRiskOrders = [...objectData.paymentRiskOrders]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 3);
  const pagePaymentSubmissions = objectData.landingPages.reduce((sum, page) => sum + (page.paymentSubmittedCount ?? 0), 0);
  const pageCheckoutCompletions = objectData.landingPages.reduce((sum, page) => sum + (page.checkoutCompletedCount ?? 0), 0);
  const pagePaymentCompletionRate = safeDivide(pageCheckoutCompletions, pagePaymentSubmissions || 1);
  const paymentAttempts = objectData.landingPages.reduce((sum, page) => sum + page.paymentAttemptCount, 0);
  const paymentFailures = objectData.landingPages.reduce((sum, page) => sum + page.paymentFailureCount, 0);
  const paymentSuccessRate = safeDivide(paymentAttempts - paymentFailures, paymentAttempts || 1);
  const groups: TodayEvidenceGroup[] = [
    {
      key: "stable_conversion_pages",
      title: "Top 承接较稳页面",
      tone: "positive",
      summary: "这些页面最近在末端承接相对稳定，更适合作为当前可复制的页面样本。",
      items: stableLandingPages.map((page) =>
        buildLandingPageObjectCard(page, objectData.currency, "转化分析", "conversion"),
      ),
    },
    {
      key: "payment_risk_pages",
      title: "Top 支付风险页面",
      tone: "negative",
      summary: "这些页面已经暴露出明显支付风险，优先级应该先查页面承接和结账末端问题。",
      items: paymentRiskPages.map((page) =>
        buildLandingPageObjectCard(page, objectData.currency, "转化分析", "conversion"),
      ),
    },
    {
      key: "payment_failed_orders",
      title: "Top 支付失败订单",
      tone: "warning",
      summary: "这些订单已经进入支付失败代理口径，优先级应该放在先排查支付和结账链路。",
      items: paymentRiskOrders.map((order) => buildPaymentFailureOrderObjectCard(order, objectData.currency)),
    },
  ].filter((group) => group.items.length > 0);

  return {
    key: "conversion",
    title: "转化分析",
    subtitle: `当前查看范围：${selectedCountryLabel}。这里重点判断转化问题卡在加购、结账，还是成交后的结果质量。`,
    accent: "焦点：漏斗与成交后风险",
    primaryQuestion: "最近的转化承接，究竟卡在加购、到达结账，还是完成结账之后？",
    summary:
      sessionScope === null
        ? "当前缺少 Storefront sessions 漏斗口径，先保留订单侧异常证据，避免转化页空白。"
        : pageSignalPages.length > 0 && paymentRiskPages.length > 0
          ? "当前已经能定位到高会话低承接页面和支付末端风险，优先级应该放在先修掉点，而不是继续冲量。"
          : paymentRiskPages.length > 0 || paymentRiskOrders.length > 0
          ? "当前已经能定位到页面承接和支付末端风险，优先级应该放在先修掉点，而不是继续冲量。"
          : "当前整体承接还算稳定，更值得继续识别哪些页面能复制健康转化。",
    statuses: [
      {
        label: "总体转化",
        status: sessionScope === null ? "watch" : conversionRate < 0.012 ? "risk" : conversionRate < 0.02 ? "watch" : "healthy",
        detail:
          sessionScope === null
            ? "当前未取到 Storefront sessions 转化率，整体转化先保留为待补口径。"
            : `近 7 天转化率 ${formatPercent(conversionRate)}。`,
      },
      {
        label: "页面承接",
        status: sessionScope === null ? "watch" : checkoutReachRate < 0.018 ? "risk" : checkoutReachRate < 0.03 ? "watch" : "healthy",
        detail:
          paymentRiskPages.length > 0
            ? `当前已有 ${formatInteger(paymentRiskPages.length)} 个页面进入支付风险样本，近 7 天到达结账率 ${formatPercent(checkoutReachRate)}。`
            : sessionScope === null
              ? "当前未取到到达结账率，先用 landingSite 订单代理补看页面承接。"
              : `近 7 天到达结账率 ${formatPercent(checkoutReachRate)}。`,
      },
      {
        label: "支付完成",
        status: sessionScope === null ? "watch" : checkoutCompleteRate < 0.01 ? "risk" : checkoutCompleteRate < 0.018 ? "watch" : "healthy",
        detail:
          pagePaymentSubmissions > 0
            ? `当前页面像素完成支付率 ${formatPercent(pagePaymentCompletionRate)}，支付提交 ${formatInteger(pagePaymentSubmissions)} 次。`
            : paymentAttempts > 0
              ? `近 7 天订单支付成功率 ${formatPercent(paymentSuccessRate)}，支付失败 ${formatInteger(paymentFailures)} 单。`
            : sessionScope === null
              ? "当前未取到完成结账率，支付失败订单口径也还待接入。"
              : `近 7 天完成结账率 ${formatPercent(checkoutCompleteRate)}。`,
      },
    ],
    summaryMetrics: [
      toSummaryMetric("近 7 天转化率", sessionScope ? formatPercent(conversionRate) : "待补"),
      toSummaryMetric("加购触达率", sessionScope ? formatPercent(cartRate) : "待补"),
      toSummaryMetric("到达结账率", sessionScope ? formatPercent(checkoutReachRate) : "待补"),
      toSummaryMetric("完成结账率", sessionScope ? formatPercent(checkoutCompleteRate) : "待补"),
    ],
    breakdowns: [
      {
        key: "conversion-by-step",
        title: "转化拆到漏斗节点",
        summary: "先看掉点更多发生在加购前、结账前，还是完成结账前。",
        rows: [
          {
            label: "加购触达率",
            value: formatPercent(cartRate),
            meta: "这是商品详情页和入口页是否接住流量的第一层信号。",
          },
          {
            label: "到达结账率",
            value: formatPercent(checkoutReachRate),
            meta: "如果这里偏低，优先排查中后段承接和结账链路。",
          },
          {
            label: "支付风险页面",
            value: formatInteger(paymentRiskPages.length),
            meta:
              pageCompletionSignalPages.length > 0
                ? "当前页面对象已经补进会话、加购、结账触发、支付提交和完成支付信号，再用支付失败订单补看成交后风险。"
                : pageSignalPages.length > 0
                  ? "当前页面对象已经补进会话、加购和结账触发信号，再用支付失败订单补看末端风险。"
                : "当前先按 landingSite 聚合页面对象，用支付失败订单把页面风险补出来。",
          },
          {
            label: "完成结账率",
            value: formatPercent(checkoutCompleteRate),
            meta: "这里偏低时，要重点怀疑支付与结账完成环节。",
          },
        ],
        relatedGroupKeys: ["stable_conversion_pages", "payment_risk_pages"],
      },
      {
        key: "conversion-after-checkout",
        title: "成交后风险补充",
        summary: "支付失败订单已经接入代理口径，优先用异常订单补看支付末端的真实后果。",
        rows: [
          {
            label: "支付失败订单数",
            value: formatInteger(paymentRiskOrders.length),
            meta: "这些订单已经走到支付末端，但没有完成闭环。",
          },
          {
            label: "支付失败率",
            value: paymentAttempts > 0 ? formatPercent(safeDivide(paymentFailures, paymentAttempts)) : "待补",
            meta: "当前先按订单 financialStatus 代理支付失败口径。",
          },
          {
            label: "支付成功率",
            value:
              pagePaymentSubmissions > 0
                ? formatPercent(pagePaymentCompletionRate)
                : paymentAttempts > 0
                  ? formatPercent(paymentSuccessRate)
                  : "待补",
            meta:
              pagePaymentSubmissions > 0
                ? "当前优先展示页面像素的 payment_info_submitted -> checkout_completed 完成率。"
                : "当前先按订单 financialStatus 代理支付成功口径。",
          },
        ],
        relatedGroupKeys: ["payment_failed_orders"],
      },
    ],
    groups,
    actions: [
      {
        title: "先收紧低转化来源",
        detail: "不要继续把流量压在支付风险页面上，先排查是页面承接问题还是支付问题。",
        priority: "P0",
      },
      {
        title: "优先修结账与支付链路",
        detail: "到达结账率和支付成功率偏低时，应该先看漏斗后半段、运费与支付流程。",
        priority: "P1",
      },
      {
        title: "跟进支付失败订单",
        detail: "把异常订单和对应页面一起看，确认是个体失败还是结构性支付问题。",
        priority: "P2",
      },
    ],
    conclusionPoints: [
      "转化页当前继续保留独立经营问题页语义，不会被弱化成 ROI 的附属页。",
      pageCompletionSignalPages.length > 0
        ? "页面对象已经混入 page_viewed / product_added_to_cart / checkout_started / payment_info_submitted / checkout_completed 事件，再由 landingSite 订单结果补齐成交后风险。"
        : pageSignalPages.length > 0
          ? "页面对象已经混入 page_viewed / product_added_to_cart / checkout_started 事件，再由 landingSite 订单结果补齐后段证据。"
        : "页面对象已经接进来，但当前仍以 landingSite 订单代理为主，后续还要补 page-level sessions。",
      "支付失败订单当前按 financialStatus=voided/pending/authorized 代理，后续再和 checkout 事件对齐。",
    ],
  };
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
    title: "增长质量分析",
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
      title: "订单规模分析",
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
      title: "客单质量分析",
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
    title: "回报效率分析",
    subtitle: `当前查看范围：${selectedCountryLabel}。这里先看哪些渠道值得继续投，以及哪些损耗正在吞掉回报。`,
    accent: `${selectedCountryLabel} / 近 7 天 vs 前 30 天`,
    primaryQuestion: "最近的回报效率是被哪些渠道支撑住的，哪些损耗对象已经需要先止损？",
    summary:
      (shortTermReturn ?? 0) >= 1
        ? "当前仍然在赚钱，但下一步更重要的是确认哪些渠道值得继续投，哪些损耗正在偷偷吞掉结果。"
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
      toSummaryMetric(
        "健康渠道收入占比",
        formatPercent(safeDivide(paidChannelRevenue, channelResult.totalRevenue || 1)),
      ),
      toSummaryMetric(
        "低效渠道收入占比",
        formatPercent(safeDivide(weakChannelRevenue, channelResult.totalRevenue || 1)),
      ),
      toSummaryMetric("总损耗占比", formatPercent(discountShare + refundShare)),
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
      title: "渠道回报分析",
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
      title: "回报损耗分析",
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
    const [timeZone, sessionCounts, orderCounts] = await Promise.all([
      resolveShopDisplayTimeZone(params.admin),
      params.hasReadReports
        ? loadSessionCountryCounts(params.admin).catch((error) => {
            console.warn("[todayGeo] loadSessionCountryCounts failed in overview:", error);
            return new Map<string, number>();
          })
        : Promise.resolve(new Map<string, number>()),
      loadOrderCountryCounts(params.shop, now),
    ]);
    const observationWindow = toObservationWindowView(7, now, timeZone);
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
      observationWindow,
    };
  } catch (error) {
    console.error("[todayGeo] loadTodayOverviewReportData failed:", error);
    return {
      filters: buildFallbackFilters(params.requestedCountry, [
        "Today 总览数据暂时加载失败，当前先展示最近一版默认分析文案，避免首页空白。",
      ]),
      report: buildFallbackOverviewReport(),
      observationWindow: toObservationWindowView(7, now),
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
    const [timeZone, sessionCounts, orderCounts] = await Promise.all([
      resolveShopDisplayTimeZone(params.admin),
      params.hasReadReports
        ? loadSessionCountryCounts(params.admin).catch((error) => {
            console.warn(`[todayGeo] loadSessionCountryCounts failed for metric=${params.metric}:`, error);
            return new Map<string, number>();
          })
        : Promise.resolve(new Map<string, number>()),
      loadOrderCountryCounts(params.shop, now),
    ]);
    const observationWindow = toObservationWindowView(7, now, timeZone);
    const filters = buildCountryOptions(
      normalizeCountryKey(params.requestedCountry) ?? params.requestedCountry ?? null,
      orderCounts,
      sessionCounts,
    );
    if (!params.hasReadReports && (params.metric === "traffic" || params.metric === "conversion")) {
      filters.dataNotes.push("当前店铺未返回 read_reports，流量与转化报告暂时无法按地区读取 Storefront sessions。");
    }
    const [orderScope, objectData] = await Promise.all([
      loadOrderScopeData(params.shop, filters.selectedCountry, now),
      loadDecisionObjectData(params.shop, filters.selectedCountry, now),
    ]);
    if (params.metric === "traffic") {
      if (objectData.pageSignalStatus === "loaded") {
        filters.dataNotes.push("流量页的页面对象已接入 web pixel 的 page_viewed / product_added_to_cart / checkout_started 事件，再用 landingSite 订单结果补齐后段承接。");
      } else if (objectData.pageSignalStatus === "country_unavailable") {
        filters.dataNotes.push("当前切到单地区后，页面级像素事件暂不支持按国家拆分，页面对象先回退为 landingSite 订单代理口径。");
      } else {
        filters.dataNotes.push("流量页的页面对象当前先基于订单 landingSite 归因，待页面级像素事件可用后再补会话与加购口径。");
      }
    }
    if (params.metric === "conversion") {
      if (objectData.pageSignalStatus === "loaded") {
        filters.dataNotes.push("转化页的页面对象已接入 web pixel 的 page_viewed / product_added_to_cart / checkout_started / payment_info_submitted / checkout_completed 事件，再用 landingSite 订单结果补齐成交后风险。");
      } else if (objectData.pageSignalStatus === "country_unavailable") {
        filters.dataNotes.push("当前切到单地区后，页面级像素事件暂不支持按国家拆分，页面对象先回退为 landingSite 订单代理口径。");
      } else {
        filters.dataNotes.push("转化页的页面对象当前先基于订单 landingSite 归因，待页面级像素事件可用后再补页面漏斗口径。");
      }
      filters.dataNotes.push("支付失败订单当前按 financialStatus=voided/pending/authorized 代理，后续会与 checkout 事件口径对齐。");
    }
    const sessionScope =
      params.metric === "traffic" || params.metric === "conversion"
        ? params.hasReadReports
          ? await loadSessionScope(
              params.admin,
              filters.selectedCountry === TODAY_ALL_COUNTRIES ? null : filters.selectedCountry,
              true,
            ).catch((error) => {
              console.warn(`[todayGeo] loadSessionScope failed for metric=${params.metric}:`, error);
              return null;
            })
          : null
        : null;
    if ((params.metric === "traffic" || params.metric === "conversion") && params.hasReadReports && sessionScope === null) {
      filters.dataNotes.push("Storefront sessions 地区查询当前未返回有效数据，流量与转化报告先显示为待补口径。");
    }
    const selectedCountryLabel = filters.selectedCountryLabel;

    const report =
      params.metric === "revenue"
        ? buildRevenueReport(orderScope, objectData, selectedCountryLabel, params.focus)
        : params.metric === "profit"
          ? buildProfitReport(orderScope, objectData, selectedCountryLabel, params.focus)
          : params.metric === "traffic"
            ? buildTrafficReport(sessionScope, orderScope, objectData, selectedCountryLabel)
            : params.metric === "conversion"
              ? buildConversionReport(sessionScope, orderScope, objectData, selectedCountryLabel)
          : await buildRoiDecisionReport(
              params.shop,
              filters.selectedCountry,
              orderScope,
              objectData,
              selectedCountryLabel,
              params.focus,
            );

    return { filters, report, observationWindow };
  } catch (error) {
    console.error(`[todayGeo] loadTodayDecisionReportData failed metric=${params.metric}:`, error);
    return {
      filters: buildFallbackFilters(params.requestedCountry, [
        "Today 报告数据暂时加载失败，当前先展示最近一版默认分析内容，避免报告页空白。",
      ]),
      report: buildFallbackDecisionReport(params.metric),
      observationWindow: toObservationWindowView(7, now),
    };
  }
}
