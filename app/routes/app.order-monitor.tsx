import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { isFullShippingRefund } from "../server/shopify/sync/refundSyncParse.server";
import {
  PageMetricCard,
  PageSurface,
  pageAccentBadgeStyle,
  pageContentStyle,
  pageEmptyStateStyle,
  pageIntroBannerStyle,
  pageMetaTextStyle,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageStatusCardStyle,
} from "./page/pageUiStyles";

type StatusLevel = "healthy" | "watch" | "risk";

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
  diagnoses: string[];
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  console.log("[order-monitor] accessToken:", session.accessToken);
  const shop = session.shop;
  const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const locale = request.headers.get("accept-language")?.startsWith("en") ? "en-US" : "zh-CN";
  const now = new Date();

  try {
    const [
      orderCount,
      cancelledCount,
      fulfilledCount,
      revenueAgg,
      refundedOrders,
      refundAgg,
      totalOrdersAllTime,
      inventoryTotal,
      inventoryLow,
      inventoryOut,
      mostRecentOrder,
      currencyRow,
    ] = await Promise.all([
      prisma.shopOrder.count({ where: { shop, createdAt: { gte: since30Days } } }),
      prisma.shopOrder.count({
        where: { shop, createdAt: { gte: since30Days }, status: "cancelled" },
      }),
      prisma.shopOrder.count({
        where: { shop, createdAt: { gte: since30Days }, fulfillmentStatus: "fulfilled" },
      }),
      prisma.shopOrder.aggregate({
        where: { shop, createdAt: { gte: since30Days }, status: { not: "cancelled" } },
        _sum: { totalPrice: true },
      }),
      prisma.shopRefund.findMany({
        where: { shop, processedAt: { gte: since30Days } },
        select: { shopifyOrderId: true },
        distinct: ["shopifyOrderId"],
      }),
      prisma.shopRefund.aggregate({
        where: { shop, processedAt: { gte: since30Days } },
        _sum: { refundAmount: true },
      }),
      prisma.shopOrder.count({ where: { shop } }),
      prisma.shopInventoryLevel.count({ where: { shop } }),
      prisma.shopInventoryLevel.count({ where: { shop, available: { gt: 0, lte: 5 } } }),
      prisma.shopInventoryLevel.count({ where: { shop, available: { lte: 0 } } }),
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

    const revenue = revenueAgg._sum.totalPrice ?? 0;
    const refundAmount = refundAgg._sum.refundAmount ?? 0;
    const currency = currencyRow?.currency ?? "USD";
    const nonCancelledCount = orderCount - cancelledCount;
    const aov = nonCancelledCount > 0 ? revenue / nonCancelledCount : 0;
    const cancelRate = orderCount > 0 ? (cancelledCount / orderCount) * 100 : 0;
    const refundOrderCount = refundedOrders.length;
    const refundRate = orderCount > 0 ? (refundOrderCount / orderCount) * 100 : 0;
    const fulfillmentRate =
      nonCancelledCount > 0 ? (fulfilledCount / nonCancelledCount) * 100 : 0;
    const lowStockRate = inventoryTotal > 0 ? (inventoryLow / inventoryTotal) * 100 : 0;
    const outOfStockRate = inventoryTotal > 0 ? (inventoryOut / inventoryTotal) * 100 : 0;

    const cancelStatus = safeStatus(cancelRate, 5, 10, true);
    const fulfillmentStatus =
      orderCount > 0 ? safeStatus(fulfillmentRate, 70, 40) : "watch";
    const refundStatus = safeStatus(refundRate, 5, 10, true);
    const inventoryStatus = safeStatus(outOfStockRate, 5, 12, true);

    const diagnoses: string[] = [];
    if (totalOrdersAllTime === 0) {
      diagnoses.push("orderMonitor.diagNoData");
    } else {
      const hasRisks =
        cancelStatus === "risk" ||
        fulfillmentStatus === "risk" ||
        refundStatus === "risk" ||
        inventoryStatus === "risk";
      if (!hasRisks) {
        diagnoses.push("orderMonitor.diagAllHealthy");
      } else {
        if (cancelStatus === "risk") diagnoses.push("orderMonitor.diagOrderWatch");
        if (fulfillmentStatus === "risk") diagnoses.push("orderMonitor.diagFulfillmentRisk");
        if (refundStatus === "risk") diagnoses.push("orderMonitor.diagRefundRisk");
        if (inventoryStatus === "risk") diagnoses.push("orderMonitor.diagInventoryRisk");
      }
    }

    const dashboard: DashboardData = {
      shop,
      updatedAt: now.toLocaleString(locale),
      hasData: totalOrdersAllTime > 0,
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
      diagnoses,
    };

    return Response.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const fallback: DashboardData = {
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
        { label: "orderMonitor.statusOrders", status: "watch", detail: "", detailType: "order" },
        {
          label: "orderMonitor.statusFulfillment",
          status: "watch",
          detail: "",
          detailType: "fulfillment",
        },
        { label: "orderMonitor.statusRefund", status: "watch", detail: "", detailType: "refund" },
        {
          label: "orderMonitor.statusInventory",
          status: "watch",
          detail: "",
          detailType: "inventory",
        },
      ],
      diagnoses: [
        `orderMonitor.fallbackDiagFailure::${message}`,
        "orderMonitor.fallbackDiagCheck",
      ],
    };
    return Response.json(fallback);
  }
};

function statusTone(status: StatusLevel): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

export default function OrderMonitorPage() {
  const { t } = useTranslation();
  const data = useLoaderData() as DashboardData;

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
    if (item.detailType === "fulfillment") {
      return t("orderMonitor.fulfillmentDetail", { rate: item.detail });
    }
    if (item.detailType === "refund") {
      return t("orderMonitor.refundDetail", { rate: item.detail });
    }
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
    if (typeof value === "string" && value.startsWith("orderMonitor.")) return t(value);
    return String(value);
  };

  return (
    <s-page heading={t("orderMonitor.pageTitle")}>
      <div style={pageIntroBannerStyle("order-monitor", { marginBottom: "1.5rem" })}>
        {t("orderMonitor.pageIntro")}
      </div>

      <div style={pageContentStyle}>
        {!data.hasData ? (
          <div style={pageEmptyStateStyle}>
            <span>{t("orderMonitor.emptyState")}</span>
          </div>
        ) : null}

        <section>
          <div style={pageSectionHeaderRowStyle}>
            <h2 style={pageSectionMajorTitleStyle}>{t("orderMonitor.coreBoard")}</h2>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {data.statuses.map((item) => (
              <div key={item.label} style={pageStatusCardStyle}>
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-badge tone={statusTone(item.status)}>
                    {t(item.label)}：{resolveStatusText(item.status)}
                  </s-badge>
                  {resolveDetail(item) ? (
                    <s-paragraph>{resolveDetail(item)}</s-paragraph>
                  ) : null}
                </s-stack>
              </div>
            ))}
          </div>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p style={pageMetaTextStyle}>
              {t("orderMonitor.syncTotalOrders")}：{data.totalOrdersAllTime}
            </p>
            <p style={pageMetaTextStyle}>
              {t("orderMonitor.syncLastAt")}：{" "}
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
