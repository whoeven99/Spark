import { useState, type CSSProperties } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isFullShippingRefund } from "../server/shopify/sync/refundSyncParse.server";
import {
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  pageAccentBadgeStyle,
  pageColorTokens,
  mobilePageContentStyle,
  pageContentStyle,
  pageEmptyStateStyle,
  pageIntroBannerStyle,
  pageMetaTextStyle,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageStatusCardStyle,
} from "./page/pageUiStyles";
import { useFeatureView } from "../lib/featureTrack";

type StatusLevel = "healthy" | "watch" | "risk";

type TopRefundSku = {
  sku: string;
  title: string;
  quantity: number;
  amount: string;
  reason: string;
};

type AbnormalRefundOrder = {
  orderNumber: string;
  amount: string;
  rate: string;
  reason: string;
  skus: string;
  processedAt: string;
};

type ShippingRefundRow = {
  orderNumber: string;
  shippingRefundAmount: string;
  shippingRefundTax: string;
  reason: string;
  processedAt: string;
  originalShipping: string;
  fullRefund: boolean;
  partialRefund: boolean;
};

type SlaOrder = {
  orderNumber: string;
  ageHours: string;
  status: string;
  customer: string;
};

type CarrierIssue = {
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  shipmentStatus: string;
  ageDays: string;
};

type InventoryRiskItem = {
  sku: string;
  title: string;
  variantTitle: string;
  available: number;
  salesVelocity: string;
  sellableDays: string;
  risk: StatusLevel;
  priority: string;
  estimatedLoss: string;
};

type DashboardData = {
  shop: string;
  updatedAt: string;
  hasData: boolean;
  totalOrdersAllTime: number;
  mostRecentOrderAt: string | null;
  metrics: {
    orderCount: number;
    revenue: string;
    aov: string;
    cancelRate: string;
    refundAmount: string;
    refundRate: string;
    fulfillmentRate: string;
    currency: string;
  };
  statuses: Array<{
    label: string;
    status: StatusLevel;
    detail: string;
    detailType: "order" | "fulfillment" | "refund" | "inventory";
  }>;
  refundGovernance: {
    currentRate: string;
    previousRate: string;
    delta: string;
    topSkus: TopRefundSku[];
    abnormalOrders: AbnormalRefundOrder[];
    shippingRefunds: ShippingRefundRow[];
    suggestions: string[];
  };
  fulfillmentSla: {
    averageHours: string;
    overdueCount: number;
    unfulfilledCount: number;
    carrierIssueCount: number;
    overdueOrders: SlaOrder[];
    unfulfilledOrders: SlaOrder[];
    carrierIssues: CarrierIssue[];
  };
  inventoryRisk: {
    riskSkuCount: number;
    estimatedLoss: string;
    items: InventoryRiskItem[];
  };
  diagnoses: string[];
};

const SLA_HOURS = 48;
const SLA_TABLE_INITIAL_ROWS = 6;
const CARRIER_STALE_DAYS = 7;
const REFUND_SPIKE_PERCENT_POINTS = 3;

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.65rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
};

const tdStyle: CSSProperties = {
  padding: "0.65rem 0.5rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function safeStatus(
  value: number,
  goodThreshold: number,
  riskThreshold: number,
  reverse = false,
): StatusLevel {
  if (!Number.isFinite(value)) return "watch";
  if (!reverse) {
    if (value >= goodThreshold) return "healthy";
    if (value < riskThreshold) return "risk";
    return "watch";
  }
  if (value <= goodThreshold) return "healthy";
  if (value > riskThreshold) return "risk";
  return "watch";
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 36e5);
}

function displaySku(sku: string | null | undefined): string {
  return sku?.trim() || "UNKNOWN";
}

function emptyDashboard(
  shop: string,
  locale: string,
  now: Date,
  message?: string,
): DashboardData {
  return {
    shop,
    updatedAt: now.toLocaleString(locale),
    hasData: false,
    totalOrdersAllTime: 0,
    mostRecentOrderAt: null,
    metrics: {
      orderCount: 0,
      revenue: "orderMonitor.fallbackNoData",
      aov: "orderMonitor.fallbackNoData",
      cancelRate: "orderMonitor.fallbackNoData",
      refundAmount: "orderMonitor.fallbackNoData",
      refundRate: "orderMonitor.fallbackNoData",
      fulfillmentRate: "orderMonitor.fallbackNoData",
      currency: "",
    },
    statuses: [
      {
        label: "orderMonitor.statusOrders",
        status: "watch",
        detail: "",
        detailType: "order",
      },
      {
        label: "orderMonitor.statusFulfillment",
        status: "watch",
        detail: "",
        detailType: "fulfillment",
      },
      {
        label: "orderMonitor.statusRefund",
        status: "watch",
        detail: "",
        detailType: "refund",
      },
      {
        label: "orderMonitor.statusInventory",
        status: "watch",
        detail: "",
        detailType: "inventory",
      },
    ],
    refundGovernance: {
      currentRate: "0.0%",
      previousRate: "0.0%",
      delta: "0.0pp",
      topSkus: [],
      abnormalOrders: [],
      shippingRefunds: [],
      suggestions: [],
    },
    fulfillmentSla: {
      averageHours: "0.0",
      overdueCount: 0,
      unfulfilledCount: 0,
      carrierIssueCount: 0,
      overdueOrders: [],
      unfulfilledOrders: [],
      carrierIssues: [],
    },
    inventoryRisk: {
      riskSkuCount: 0,
      estimatedLoss: "0.00",
      items: [],
    },
    diagnoses: message
      ? [
          `orderMonitor.fallbackDiagFailure::${message}`,
          "orderMonitor.fallbackDiagCheck",
        ]
      : ["orderMonitor.diagNoData"],
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  console.log("[order-monitor] accessToken:", session.accessToken);
  const shop = session.shop;
  const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const previous30Days = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const locale = request.headers.get("accept-language")?.startsWith("en")
    ? "en-US"
    : "zh-CN";
  const now = new Date();

  try {
    const [
      orders,
      previousOrders,
      refunds,
      previousRefunds,
      refundLineItems,
      inventoryRows,
      orderLineItems,
      totalOrdersAllTime,
      mostRecentOrder,
      currencyRow,
    ] = await Promise.all([
      prisma.shopOrder.findMany({
        where: { shop, createdAt: { gte: since30Days } },
        include: {
          fulfillments: true,
          refunds: { include: { lineItems: true } },
        },
      }),
      prisma.shopOrder.findMany({
        where: { shop, createdAt: { gte: previous30Days, lt: since30Days } },
        select: { shopifyOrderId: true },
      }),
      prisma.shopRefund.findMany({
        where: { shop, processedAt: { gte: since30Days } },
        include: { order: true, lineItems: true },
        orderBy: { processedAt: "desc" },
      }),
      prisma.shopRefund.findMany({
        where: { shop, processedAt: { gte: previous30Days, lt: since30Days } },
        select: { shopifyOrderId: true },
      }),
      prisma.shopRefundLineItem.findMany({
        where: { shop, refund: { processedAt: { gte: since30Days } } },
      }),
      prisma.shopInventoryLevel.findMany({ where: { shop } }),
      prisma.shopOrderLineItem.findMany({
        where: {
          shop,
          order: {
            createdAt: { gte: since30Days },
            status: { not: "cancelled" },
          },
        },
        include: { order: true },
      }),
      prisma.shopOrder.count({ where: { shop } }),
      prisma.shopOrder.findFirst({
        where: { shop },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.shopOrder.findFirst({
        where: { shop },
        orderBy: { createdAt: "desc" },
        select: { currency: true },
      }),
    ]);

    if (totalOrdersAllTime === 0) {
      return Response.json(emptyDashboard(shop, locale, now));
    }

    const orderCount = orders.length;
    const cancelledCount = orders.filter(
      (order) => order.status === "cancelled",
    ).length;
    const nonCancelledOrders = orders.filter(
      (order) => order.status !== "cancelled",
    );
    const revenue = nonCancelledOrders.reduce(
      (sum, order) => sum + order.totalPrice,
      0,
    );
    const refundOrderIds = new Set(
      refunds.map((refund) => refund.shopifyOrderId),
    );
    const previousRefundOrderIds = new Set(
      previousRefunds.map((refund) => refund.shopifyOrderId),
    );
    const refundAmount = refunds.reduce(
      (sum, refund) => sum + refund.refundAmount,
      0,
    );
    const currency = currencyRow?.currency ?? "USD";
    const aov =
      nonCancelledOrders.length > 0 ? revenue / nonCancelledOrders.length : 0;
    const cancelRate = orderCount > 0 ? (cancelledCount / orderCount) * 100 : 0;
    const refundRate =
      orderCount > 0 ? (refundOrderIds.size / orderCount) * 100 : 0;
    const previousRefundRate =
      previousOrders.length > 0
        ? (previousRefundOrderIds.size / previousOrders.length) * 100
        : 0;
    const refundRateDelta = refundRate - previousRefundRate;

    const fulfilledOrders = nonCancelledOrders.filter(
      (order) =>
        order.fulfillmentStatus === "fulfilled" ||
        order.fulfillments.some(
          (fulfillment) => fulfillment.status === "success",
        ),
    );
    const fulfillmentRate =
      nonCancelledOrders.length > 0
        ? (fulfilledOrders.length / nonCancelledOrders.length) * 100
        : 0;

    const topSkuMap = new Map<
      string,
      {
        title: string;
        quantity: number;
        amount: number;
        reasons: Map<string, number>;
      }
    >();
    for (const line of refundLineItems) {
      const sku = displaySku(line.sku);
      const current = topSkuMap.get(sku) ?? {
        title: line.title ?? sku,
        quantity: 0,
        amount: 0,
        reasons: new Map<string, number>(),
      };
      current.quantity += line.quantity;
      current.amount += line.subtotal + line.totalTax;
      const reason = line.reason ?? "unspecified";
      current.reasons.set(reason, (current.reasons.get(reason) ?? 0) + 1);
      topSkuMap.set(sku, current);
    }
    const topSkus = Array.from(topSkuMap.entries())
      .map(([sku, item]) => ({
        sku,
        title: item.title,
        quantity: item.quantity,
        amount: item.amount.toFixed(2),
        reason:
          Array.from(item.reasons.entries()).sort(
            (a, b) => b[1] - a[1],
          )[0]?.[0] ?? "unspecified",
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5);

    const abnormalRefundThreshold = Math.max(
      aov * 1.5,
      refundAmount / Math.max(refunds.length, 1),
    );
    const abnormalOrders = refunds
      .filter(
        (refund) =>
          refund.refundAmount >= abnormalRefundThreshold ||
          refund.lineItems.length >= 2,
      )
      .slice(0, 8)
      .map((refund) => ({
        orderNumber: refund.order?.orderNumber
          ? `#${refund.order.orderNumber}`
          : refund.shopifyOrderId,
        amount: refund.refundAmount.toFixed(2),
        rate:
          refund.order?.totalPrice && refund.order.totalPrice > 0
            ? formatPercent(
                (refund.refundAmount / refund.order.totalPrice) * 100,
              )
            : "N/A",
        reason: refund.reason ?? refund.refundNote ?? "unspecified",
        skus:
          refund.lineItems.map((line) => displaySku(line.sku)).join(", ") ||
          "UNKNOWN",
        processedAt: refund.processedAt.toISOString(),
      }));

    // Aggregate shipping refunds by order: a single order may have multiple partial refunds.
    const shippingRefundByOrder = new Map<
      string,
      {
        orderNumber: string;
        shippingRefundAmount: number;
        shippingRefundTax: number;
        reasons: Set<string>;
        latestProcessedAt: Date;
        originalShipping: number;
      }
    >();
    for (const refund of refunds) {
      if ((refund.shippingRefundAmount ?? 0) <= 0) continue;
      const key = refund.shopifyOrderId;
      const current = shippingRefundByOrder.get(key) ?? {
        orderNumber: refund.order?.orderNumber
          ? `#${refund.order.orderNumber}`
          : refund.shopifyOrderId,
        shippingRefundAmount: 0,
        shippingRefundTax: 0,
        reasons: new Set<string>(),
        latestProcessedAt: refund.processedAt,
        originalShipping: refund.order?.totalShipping ?? 0,
      };
      current.shippingRefundAmount += refund.shippingRefundAmount ?? 0;
      current.shippingRefundTax += refund.shippingRefundTax ?? 0;
      const reasonText = refund.reason ?? refund.refundNote;
      if (reasonText) current.reasons.add(reasonText);
      if (refund.processedAt > current.latestProcessedAt) {
        current.latestProcessedAt = refund.processedAt;
      }
      shippingRefundByOrder.set(key, current);
    }
    const shippingRefunds: ShippingRefundRow[] = Array.from(
      shippingRefundByOrder.values(),
    )
      .sort((a, b) => b.shippingRefundAmount - a.shippingRefundAmount)
      .slice(0, 10)
      .map((item) => {
        const fullRefund = isFullShippingRefund(
          item.shippingRefundAmount,
          item.shippingRefundTax,
          item.originalShipping,
        );
        return {
          orderNumber: item.orderNumber,
          shippingRefundAmount: item.shippingRefundAmount.toFixed(2),
          shippingRefundTax: item.shippingRefundTax.toFixed(2),
          reason:
            item.reasons.size > 0
              ? Array.from(item.reasons).join(", ")
              : "unspecified",
          processedAt: item.latestProcessedAt.toISOString(),
          originalShipping: item.originalShipping.toFixed(2),
          fullRefund,
          partialRefund: item.shippingRefundAmount > 0 && !fullRefund,
        };
      });

    const fulfilledDurations = fulfilledOrders
      .map((order) => {
        const shippedAt = order.fulfillments
          .map((fulfillment) => fulfillment.shippedAt ?? fulfillment.createdAt)
          .sort((a, b) => a.getTime() - b.getTime())[0];
        return shippedAt ? hoursBetween(order.createdAt, shippedAt) : null;
      })
      .filter((value): value is number => value !== null);
    const averageSlaHours =
      fulfilledDurations.length > 0
        ? fulfilledDurations.reduce((sum, value) => sum + value, 0) /
          fulfilledDurations.length
        : 0;

    const pendingOrders = nonCancelledOrders.filter(
      (order) =>
        order.fulfillmentStatus !== "fulfilled" &&
        !order.fulfillments.some(
          (fulfillment) => fulfillment.status === "success",
        ),
    );
    const overdueCandidates = pendingOrders
      .filter((order) => hoursBetween(order.createdAt, now) > SLA_HOURS)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const overdueCount = overdueCandidates.length;
    const overdueOrders = overdueCandidates.map((order) => ({
      orderNumber: `#${order.orderNumber}`,
      ageHours: formatNumber(hoursBetween(order.createdAt, now)),
      status: order.fulfillmentStatus ?? "unfulfilled",
      customer: order.customerEmail ?? order.email ?? "N/A",
    }));
    const unfulfilledCandidates = pendingOrders
      .filter((order) => hoursBetween(order.createdAt, now) <= SLA_HOURS)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const unfulfilledCount = unfulfilledCandidates.length;
    const unfulfilledOrders = unfulfilledCandidates.map((order) => ({
      orderNumber: `#${order.orderNumber}`,
      ageHours: formatNumber(hoursBetween(order.createdAt, now)),
      status: order.fulfillmentStatus ?? "unfulfilled",
      customer: order.customerEmail ?? order.email ?? "N/A",
    }));
    const carrierIssues = orders
      .flatMap((order) =>
        order.fulfillments
          .filter((fulfillment) => {
            const ageDays = hoursBetween(fulfillment.updatedAt, now) / 24;
            return (
              ["error", "failure"].includes(fulfillment.status) ||
              fulfillment.shipmentStatus === "failure" ||
              (fulfillment.shipmentStatus === "in_transit" &&
                ageDays > CARRIER_STALE_DAYS)
            );
          })
          .map((fulfillment) => ({
            orderNumber: `#${order.orderNumber}`,
            carrier: fulfillment.trackingCompany ?? "N/A",
            trackingNumber: fulfillment.trackingNumber ?? "N/A",
            shipmentStatus: fulfillment.shipmentStatus ?? fulfillment.status,
            ageDays: formatNumber(
              hoursBetween(fulfillment.updatedAt, now) / 24,
            ),
          })),
      )
      .slice(0, 8);

    const salesByKey = new Map<
      string,
      {
        sku: string;
        title: string;
        variantTitle: string | null;
        quantity: number;
        revenue: number;
      }
    >();
    for (const line of orderLineItems) {
      const key =
        line.inventoryItemId ?? line.sku ?? line.variantId ?? line.lineItemId;
      const current = salesByKey.get(key) ?? {
        sku: displaySku(line.sku),
        title: line.title,
        variantTitle: line.variantTitle,
        quantity: 0,
        revenue: 0,
      };
      if (!current.variantTitle && line.variantTitle) {
        current.variantTitle = line.variantTitle;
      }
      current.quantity += line.quantity;
      current.revenue += Math.max(
        0,
        line.price * line.quantity - line.totalDiscount,
      );
      salesByKey.set(key, current);
    }
    const inventoryByKey = new Map<
      string,
      {
        available: number;
        sku: string;
        title: string;
        variantTitle: string | null;
      }
    >();
    for (const inventory of inventoryRows) {
      const keys = [
        inventory.inventoryItemId,
        inventory.sku,
        inventory.variantId,
      ].filter((value): value is string => Boolean(value));
      for (const key of keys) {
        const current = inventoryByKey.get(key) ?? {
          available: 0,
          sku: displaySku(inventory.sku),
          title: inventory.productTitle ?? displaySku(inventory.sku),
          variantTitle: inventory.variantTitle,
        };
        current.available += inventory.available;
        inventoryByKey.set(key, current);
      }
    }

    const inventoryItems = Array.from(salesByKey.entries())
      .map(([key, sales]) => {
        const inventory =
          inventoryByKey.get(key) ?? inventoryByKey.get(sales.sku);
        const available = inventory?.available ?? 0;
        const velocity = sales.quantity / 30;
        const sellableDays =
          velocity > 0 ? available / velocity : Number.POSITIVE_INFINITY;
        const unitRevenue =
          sales.quantity > 0 ? sales.revenue / sales.quantity : 0;
        const sevenDayDemand = velocity * 7;
        const estimatedLoss =
          Math.max(0, sevenDayDemand - available) * unitRevenue;
        const risk: StatusLevel =
          available <= 0 || sellableDays < 7
            ? "risk"
            : sellableDays < 14
              ? "watch"
              : "healthy";
        return {
          sku: inventory?.sku ?? sales.sku,
          title: inventory?.title ?? sales.title,
          variantTitle: sales.variantTitle ?? "—",
          available,
          salesVelocity: formatNumber(velocity, 2),
          sellableDays: Number.isFinite(sellableDays)
            ? formatNumber(sellableDays)
            : "N/A",
          risk,
          priority: risk === "risk" ? "P0" : risk === "watch" ? "P1" : "P2",
          estimatedLoss,
        };
      })
      .filter((item) => item.risk !== "healthy")
      .sort((a, b) => {
        if (a.priority !== b.priority)
          return a.priority.localeCompare(b.priority);
        return b.estimatedLoss - a.estimatedLoss;
      });
    const estimatedInventoryLoss = inventoryItems.reduce(
      (sum, item) => sum + item.estimatedLoss,
      0,
    );

    const inventoryTotal = inventoryRows.length;
    const inventoryLow = inventoryRows.filter(
      (row) => row.available > 0 && row.available <= 5,
    ).length;
    const inventoryOut = inventoryRows.filter(
      (row) => row.available <= 0,
    ).length;
    const lowStockRate =
      inventoryTotal > 0 ? (inventoryLow / inventoryTotal) * 100 : 0;
    const outOfStockRate =
      inventoryTotal > 0 ? (inventoryOut / inventoryTotal) * 100 : 0;

    const cancelStatus = safeStatus(cancelRate, 5, 10, true);
    const fulfillmentStatus =
      orderCount > 0 ? safeStatus(fulfillmentRate, 70, 40) : "watch";
    const refundStatus = safeStatus(refundRate, 5, 10, true);
    const inventoryStatus = safeStatus(outOfStockRate, 5, 12, true);

    const suggestions: string[] = [];
    if (refundRateDelta > REFUND_SPIKE_PERCENT_POINTS)
      suggestions.push("orderMonitor.suggestionRefundSpike");
    if (topSkus.length > 0)
      suggestions.push("orderMonitor.suggestionTopRefundSku");
    if (abnormalOrders.length > 0)
      suggestions.push("orderMonitor.suggestionRefundOrders");
    if (suggestions.length === 0)
      suggestions.push("orderMonitor.suggestionRefundHealthy");

    const diagnoses: string[] = [];
    const hasRisks =
      cancelStatus === "risk" ||
      fulfillmentStatus === "risk" ||
      refundStatus === "risk" ||
      inventoryStatus === "risk" ||
      overdueCount > 0 ||
      inventoryItems.some((item) => item.risk === "risk");
    if (!hasRisks) {
      diagnoses.push("orderMonitor.diagAllHealthy");
    } else {
      if (cancelStatus === "risk")
        diagnoses.push("orderMonitor.diagOrderWatch");
      if (fulfillmentStatus === "risk" || overdueCount > 0) {
        diagnoses.push("orderMonitor.diagFulfillmentRisk");
      }
      if (
        refundStatus === "risk" ||
        refundRateDelta > REFUND_SPIKE_PERCENT_POINTS
      ) {
        diagnoses.push("orderMonitor.diagRefundRisk");
      }
      if (
        inventoryStatus === "risk" ||
        inventoryItems.some((item) => item.risk === "risk")
      ) {
        diagnoses.push("orderMonitor.diagInventoryRisk");
      }
    }

    const dashboard: DashboardData = {
      shop,
      updatedAt: now.toLocaleString(locale),
      hasData: true,
      totalOrdersAllTime,
      mostRecentOrderAt: mostRecentOrder?.createdAt?.toISOString() ?? null,
      metrics: {
        orderCount,
        revenue: revenue.toFixed(2),
        aov: aov.toFixed(2),
        cancelRate: formatPercent(cancelRate),
        refundAmount: refundAmount.toFixed(2),
        refundRate: formatPercent(refundRate),
        fulfillmentRate: formatPercent(fulfillmentRate),
        currency,
      },
      statuses: [
        {
          label: "orderMonitor.statusOrders",
          status: cancelStatus,
          detail: `${orderCount}|${formatPercent(cancelRate)}`,
          detailType: "order",
        },
        {
          label: "orderMonitor.statusFulfillment",
          status: fulfillmentStatus,
          detail: formatPercent(fulfillmentRate),
          detailType: "fulfillment",
        },
        {
          label: "orderMonitor.statusRefund",
          status: refundStatus,
          detail: formatPercent(refundRate),
          detailType: "refund",
        },
        {
          label: "orderMonitor.statusInventory",
          status: inventoryStatus,
          detail: `${formatPercent(lowStockRate)}|${formatPercent(outOfStockRate)}`,
          detailType: "inventory",
        },
      ],
      refundGovernance: {
        currentRate: formatPercent(refundRate),
        previousRate: formatPercent(previousRefundRate),
        delta: `${refundRateDelta >= 0 ? "+" : ""}${refundRateDelta.toFixed(1)}pp`,
        topSkus,
        abnormalOrders,
        shippingRefunds,
        suggestions,
      },
      fulfillmentSla: {
        averageHours: formatNumber(averageSlaHours),
        overdueCount,
        unfulfilledCount,
        carrierIssueCount: carrierIssues.length,
        overdueOrders,
        unfulfilledOrders,
        carrierIssues,
      },
      inventoryRisk: {
        riskSkuCount: inventoryItems.filter((item) => item.risk === "risk")
          .length,
        estimatedLoss: estimatedInventoryLoss.toFixed(2),
        items: inventoryItems.slice(0, 10).map((item) => ({
          ...item,
          estimatedLoss: item.estimatedLoss.toFixed(2),
        })),
      },
      diagnoses,
    };

    return Response.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(emptyDashboard(shop, locale, now, message));
  }
};

function statusTone(status: StatusLevel): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

function EmptyRows({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{ ...tdStyle, color: pageColorTokens.textSecondary }}
      >
        {label}
      </td>
    </tr>
  );
}

export default function OrderMonitorPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const data = useLoaderData() as DashboardData;
  useFeatureView("order-monitor");

  const resolveStatusText = (status: StatusLevel) => {
    if (status === "healthy") return t("orderMonitor.statusHealthy");
    if (status === "watch") return t("orderMonitor.statusWatch");
    return t("orderMonitor.statusRisk");
  };

  const resolveDetail = (item: { detail: string; detailType: string }) => {
    if (!item.detail) return null;
    if (item.detailType === "order") {
      const [count, cancelRate] = item.detail.split("|");
      return t("orderMonitor.orderDetail", { count, cancelRate });
    }
    if (item.detailType === "fulfillment")
      return t("orderMonitor.fulfillmentDetail", { rate: item.detail });
    if (item.detailType === "refund")
      return t("orderMonitor.refundDetail", { rate: item.detail });
    if (item.detailType === "inventory") {
      const [low, out] = item.detail.split("|");
      return t("orderMonitor.inventoryDetail", { low, out });
    }
    return item.detail;
  };

  const resolveDiagnosis = (line: string) => {
    if (line.startsWith("orderMonitor.fallbackDiagFailure::")) {
      return t("orderMonitor.fallbackDiagFailure", {
        message: line.replace("orderMonitor.fallbackDiagFailure::", ""),
      });
    }
    return t(line);
  };

  const resolveMetric = (value: string | number) => {
    if (typeof value === "string" && value.startsWith("orderMonitor."))
      return t(value);
    return String(value);
  };

  return (
    <s-page heading={t("orderMonitor.pageTitle")}>
      <div
        style={pageIntroBannerStyle("order-monitor", {
          marginBottom: "1.5rem",
        })}
      >
        {t("orderMonitor.pageIntro")}
      </div>

      <div style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}>
        <PageHeaderNav
          title={t("orderMonitor.pageTitle")}
          backLabel={t("common.backToPrevious", { defaultValue: "返回工作台" })}
          workspaceOnly
        />
        {!data.hasData ? (
          <div style={pageEmptyStateStyle}>
            <span>{t("orderMonitor.emptyState")}</span>
          </div>
        ) : null}

        <section>
          <div
            style={
              isMobile
                ? { ...pageSectionHeaderRowStyle, flexDirection: "column", alignItems: "flex-start", gap: "0.65rem" }
                : pageSectionHeaderRowStyle
            }
          >
            <h2 style={pageSectionMajorTitleStyle}>
              {t("orderMonitor.coreBoard")}
            </h2>
            <span style={pageAccentBadgeStyle}>
              {t("orderMonitor.shopLabel", { value: data.shop })}
            </span>
          </div>
          <PageMetricCard
            accent={t("orderMonitor.periodLast30Days")}
            metrics={[
              {
                label: t("orderMonitor.metricOrders"),
                value: String(data.metrics.orderCount),
              },
              {
                label: t("orderMonitor.metricRevenue"),
                value: resolveMetric(data.metrics.revenue),
                unit: data.metrics.currency || undefined,
              },
              {
                label: t("orderMonitor.metricAov"),
                value: resolveMetric(data.metrics.aov),
                unit: data.metrics.currency || undefined,
              },
              {
                label: t("orderMonitor.metricCancelRate"),
                value: resolveMetric(data.metrics.cancelRate),
              },
              {
                label: t("orderMonitor.metricRefundAmount"),
                value: resolveMetric(data.metrics.refundAmount),
                unit: data.metrics.currency || undefined,
              },
              {
                label: t("orderMonitor.metricRefundRate"),
                value: resolveMetric(data.metrics.refundRate),
              },
              {
                label: t("orderMonitor.metricFulfillmentRate"),
                value: resolveMetric(data.metrics.fulfillmentRate),
              },
            ]}
            footer={t("orderMonitor.updatedAtLabel", { value: data.updatedAt })}
          />
        </section>

        <PageSurface title={t("orderMonitor.healthTitle")}>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            {data.statuses.map((item) => (
              <div key={item.label} style={pageStatusCardStyle}>
                <s-stack direction={isMobile ? "block" : "inline"} gap="base" alignItems="center">
                  <s-badge tone={statusTone(item.status)}>
                    {t(item.label)}: {resolveStatusText(item.status)}
                  </s-badge>
                  {resolveDetail(item) ? (
                    <s-paragraph>{resolveDetail(item)}</s-paragraph>
                  ) : null}
                </s-stack>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface
          title={t("orderMonitor.refundGovernanceTitle")}
          subtitle={t("orderMonitor.refundGovernanceSubtitle", {
            current: data.refundGovernance.currentRate,
            previous: data.refundGovernance.previousRate,
            delta: data.refundGovernance.delta,
          })}
        >
          <TableTitle label={t("orderMonitor.topRefundSkuTitle")} />
          <TableWrap><table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("orderMonitor.colSku")}</th>
                <th style={thStyle}>{t("orderMonitor.colProduct")}</th>
                <th style={thStyle}>{t("orderMonitor.colQty")}</th>
                <th style={thStyle}>{t("orderMonitor.colRefundAmount")}</th>
                <th style={thStyle}>{t("orderMonitor.colReason")}</th>
              </tr>
            </thead>
            <tbody>
              {data.refundGovernance.topSkus.length > 0 ? (
                data.refundGovernance.topSkus.map((item) => (
                  <tr key={item.sku}>
                    <td style={tdStyle}>{item.sku}</td>
                    <td style={tdStyle}>{item.title}</td>
                    <td style={tdStyle}>{item.quantity}</td>
                    <td style={tdStyle}>{item.amount}</td>
                    <td style={tdStyle}>{item.reason}</td>
                  </tr>
                ))
              ) : (
                <EmptyRows
                  colSpan={5}
                  label={t("orderMonitor.emptyRefundSku")}
                />
              )}
            </tbody>
          </table></TableWrap>

          <TableTitle label={t("orderMonitor.shippingRefundTitle")} />
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("orderMonitor.colOrder")}</th>
                <th style={thStyle}>
                  {t("orderMonitor.colShippingRefundAmount")}
                </th>
                <th style={thStyle}>
                  {t("orderMonitor.colShippingRefundTax")}
                </th>
                <th style={thStyle}>
                  {t("orderMonitor.colOriginalShipping")}
                </th>
                <th style={thStyle}>{t("orderMonitor.colReason")}</th>
                <th style={thStyle}>{t("orderMonitor.colProcessedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {data.refundGovernance.shippingRefunds.length > 0 ? (
                data.refundGovernance.shippingRefunds.map((item) => (
                  <tr key={`${item.orderNumber}-${item.processedAt}`}>
                    <td style={tdStyle}>{item.orderNumber}</td>
                    <td style={tdStyle}>
                      {item.shippingRefundAmount} {data.metrics.currency}
                    </td>
                    <td style={tdStyle}>
                      {item.shippingRefundTax} {data.metrics.currency}
                    </td>
                    <td style={tdStyle}>
                      {item.originalShipping} {data.metrics.currency}
                      {item.fullRefund ? (
                        <span style={{ marginLeft: "0.4rem" }}>
                          <s-badge tone="success">
                            {t("orderMonitor.shippingRefundFullBadge")}
                          </s-badge>
                        </span>
                      ) : item.partialRefund ? (
                        <span style={{ marginLeft: "0.4rem" }}>
                          <s-badge tone="info">
                            {t("orderMonitor.shippingRefundPartialBadge")}
                          </s-badge>
                        </span>
                      ) : null}
                    </td>
                    <td style={tdStyle}>{item.reason}</td>
                    <td style={tdStyle}>
                      {new Date(item.processedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRows
                  colSpan={6}
                  label={t("orderMonitor.emptyShippingRefund")}
                />
              )}
            </tbody>
          </table>

          <TableTitle label={t("orderMonitor.abnormalRefundOrdersTitle")} />
          <TableWrap><table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("orderMonitor.colOrder")}</th>
                <th style={thStyle}>{t("orderMonitor.colRefundAmount")}</th>
                <th style={thStyle}>{t("orderMonitor.colRefundRatio")}</th>
                <th style={thStyle}>{t("orderMonitor.colSku")}</th>
                <th style={thStyle}>{t("orderMonitor.colReason")}</th>
              </tr>
            </thead>
            <tbody>
              {data.refundGovernance.abnormalOrders.length > 0 ? (
                data.refundGovernance.abnormalOrders.map((item) => (
                  <tr key={`${item.orderNumber}-${item.processedAt}`}>
                    <td style={tdStyle}>{item.orderNumber}</td>
                    <td style={tdStyle}>{item.amount}</td>
                    <td style={tdStyle}>{item.rate}</td>
                    <td style={tdStyle}>{item.skus}</td>
                    <td style={tdStyle}>{item.reason}</td>
                  </tr>
                ))
              ) : (
                <EmptyRows
                  colSpan={5}
                  label={t("orderMonitor.emptyAbnormalRefund")}
                />
              )}
            </tbody>
          </table></TableWrap>

          <s-unordered-list>
            {data.refundGovernance.suggestions.map((line) => (
              <s-list-item key={line}>{t(line)}</s-list-item>
            ))}
          </s-unordered-list>
        </PageSurface>

        <PageSurface
          title={t("orderMonitor.fulfillmentSlaTitle")}
          subtitle={t("orderMonitor.fulfillmentSlaSubtitle", {
            hours: data.fulfillmentSla.averageHours,
            overdue: data.fulfillmentSla.overdueCount,
            unfulfilled: data.fulfillmentSla.unfulfilledCount,
            carrier: data.fulfillmentSla.carrierIssueCount,
          })}
        >
          <TableTitle label={t("orderMonitor.overdueOrdersTitle")} />
          <SlaTable
            rows={data.fulfillmentSla.overdueOrders}
            emptyLabel={t("orderMonitor.emptyOverdue")}
          />
          <TableTitle label={t("orderMonitor.unfulfilledOrdersTitle")} />
          <SlaTable
            rows={data.fulfillmentSla.unfulfilledOrders}
            emptyLabel={t("orderMonitor.emptyUnfulfilled")}
          />
          <TableTitle label={t("orderMonitor.carrierIssuesTitle")} />
          <TableWrap><table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("orderMonitor.colOrder")}</th>
                <th style={thStyle}>{t("orderMonitor.colCarrier")}</th>
                <th style={thStyle}>{t("orderMonitor.colTracking")}</th>
                <th style={thStyle}>{t("orderMonitor.colShipmentStatus")}</th>
                <th style={thStyle}>{t("orderMonitor.colAgeDays")}</th>
              </tr>
            </thead>
            <tbody>
              {data.fulfillmentSla.carrierIssues.length > 0 ? (
                data.fulfillmentSla.carrierIssues.map((item) => (
                  <tr key={`${item.orderNumber}-${item.trackingNumber}`}>
                    <td style={tdStyle}>{item.orderNumber}</td>
                    <td style={tdStyle}>{item.carrier}</td>
                    <td style={tdStyle}>{item.trackingNumber}</td>
                    <td style={tdStyle}>{item.shipmentStatus}</td>
                    <td style={tdStyle}>{item.ageDays}</td>
                  </tr>
                ))
              ) : (
                <EmptyRows
                  colSpan={5}
                  label={t("orderMonitor.emptyCarrierIssues")}
                />
              )}
            </tbody>
          </table></TableWrap>
        </PageSurface>

        <PageSurface
          title={t("orderMonitor.inventoryRiskTitle")}
          subtitle={t("orderMonitor.inventoryRiskSubtitle", {
            count: data.inventoryRisk.riskSkuCount,
            loss: data.inventoryRisk.estimatedLoss,
            currency: data.metrics.currency,
          })}
        >
          <TableWrap><table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("orderMonitor.colSku")}</th>
                <th style={thStyle}>{t("orderMonitor.colProduct")}</th>
                <th style={thStyle}>{t("orderMonitor.colVariantTitle")}</th>
                <th style={thStyle}>{t("orderMonitor.colAvailable")}</th>
                <th style={thStyle}>{t("orderMonitor.colVelocity")}</th>
                <th style={thStyle}>{t("orderMonitor.colSellableDays")}</th>
                <th style={thStyle}>{t("orderMonitor.colPriority")}</th>
                <th style={thStyle}>{t("orderMonitor.colLoss")}</th>
              </tr>
            </thead>
            <tbody>
              {data.inventoryRisk.items.length > 0 ? (
                data.inventoryRisk.items.map((item) => (
                  <tr key={item.sku}>
                    <td style={tdStyle}>{item.sku}</td>
                    <td style={tdStyle}>{item.title}</td>
                    <td style={tdStyle}>{item.variantTitle}</td>
                    <td style={tdStyle}>{item.available}</td>
                    <td style={tdStyle}>{item.salesVelocity}</td>
                    <td style={tdStyle}>{item.sellableDays}</td>
                    <td style={tdStyle}>
                      <s-badge tone={statusTone(item.risk)}>
                        {item.priority}
                      </s-badge>
                    </td>
                    <td style={tdStyle}>{item.estimatedLoss}</td>
                  </tr>
                ))
              ) : (
                <EmptyRows
                  colSpan={8}
                  label={t("orderMonitor.emptyInventoryRisk")}
                />
              )}
            </tbody>
          </table></TableWrap>
        </PageSurface>

        <PageSurface title={t("orderMonitor.conclusionTitle")}>
          <s-unordered-list>
            {data.diagnoses.map((line) => (
              <s-list-item key={line}>{resolveDiagnosis(line)}</s-list-item>
            ))}
          </s-unordered-list>
        </PageSurface>
      </div>

      <s-section slot="aside" heading={t("orderMonitor.syncStatus")}>
        <PageSurface>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            <p style={pageMetaTextStyle}>
              {t("orderMonitor.syncTotalOrders")}: {data.totalOrdersAllTime}
            </p>
            <p style={pageMetaTextStyle}>
              {t("orderMonitor.syncLastAt")}:{" "}
              {data.mostRecentOrderAt
                ? new Date(data.mostRecentOrderAt).toLocaleDateString()
                : t("orderMonitor.syncNever")}
            </p>
          </div>
        </PageSurface>
      </s-section>
    </s-page>
  );
}

function TableTitle({ label }: { label: string }) {
  return (
    <h4
      style={{
        margin: "1.25rem 0 0.35rem",
        fontSize: "0.95rem",
        color: pageColorTokens.textPrimary,
      }}
    >
      {label}
    </h4>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}

function SlaTable({
  rows,
  emptyLabel,
  initialVisibleRows = SLA_TABLE_INITIAL_ROWS,
}: {
  rows: SlaOrder[];
  emptyLabel: string;
  initialVisibleRows?: number;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasMore = rows.length > initialVisibleRows;
  const visibleRows = expanded ? rows : rows.slice(0, initialVisibleRows);
  const hiddenCount = rows.length - initialVisibleRows;

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>{t("orderMonitor.colOrder")}</th>
          <th style={thStyle}>{t("orderMonitor.colAgeHours")}</th>
          <th style={thStyle}>{t("orderMonitor.colStatus")}</th>
          <th style={thStyle}>{t("orderMonitor.colCustomer")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length > 0 ? (
          <>
            {visibleRows.map((item) => (
              <tr key={`${item.orderNumber}-${item.ageHours}`}>
                <td style={tdStyle}>{item.orderNumber}</td>
                <td style={tdStyle}>{item.ageHours}</td>
                <td style={tdStyle}>{item.status}</td>
                <td style={tdStyle}>{item.customer}</td>
              </tr>
            ))}
            {!expanded && hasMore ? (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    ...tdStyle,
                    paddingTop: "0.45rem",
                    paddingBottom: "0.45rem",
                    textAlign: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    style={{
                      border: "none",
                      background: "none",
                      padding: 0,
                      color: pageColorTokens.brandBlue,
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                  >
                    {t("orderMonitor.showMore", { count: hiddenCount })}
                  </button>
                </td>
              </tr>
            ) : null}
          </>
        ) : (
          <EmptyRows colSpan={4} label={emptyLabel} />
        )}
      </tbody>
    </table>
  );
}
