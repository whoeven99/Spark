import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";

const ORDER_METRICS_QUERY = `#graphql
  query OrderMetrics($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        refunds {
          id
          totalRefundedSet {
            shopMoney {
              amount
            }
          }
        }
      }
    }
  }
`;

const ABANDONED_CHECKOUTS_QUERY = `#graphql
  query AbandonedCheckouts($first: Int!, $after: String, $query: String!) {
    abandonedCheckouts(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
      }
    }
  }
`;

const INVENTORY_QUERY = `#graphql
  query InventoryHealth($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        inventoryQuantity
      }
    }
  }
`;

type MetricsResult = {
  orderCount: number;
  salesAmount: number;
  refundAmount: number;
  refundedOrderCount: number;
  currencyCode: string;
};

type DashboardData = {
  summary: {
    shop: string;
    updatedAt: string;
    periodLabel: string;
    salesAmount: string;
    orderCount: number;
    aov: string;
    conversionRate: string;
    refundRate: string;
    lowStockRate: string;
    outOfStockRate: string;
  };
  diagnoses: string[];
  statuses: Array<{
    label: string;
    status: "健康" | "关注" | "风险";
    detail: string;
    detailType?: "salesTrend" | "conversion" | "inventory" | "refund";
  }>;
  clickInsight: string;
};

function isoSince(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function safeStatus(
  value: number,
  goodThreshold: number,
  riskThreshold: number,
  reverse = false,
): "健康" | "关注" | "风险" {
  if (!Number.isFinite(value)) return "关注";
  if (!reverse) {
    if (value >= goodThreshold) return "健康";
    if (value < riskThreshold) return "风险";
    return "关注";
  }
  if (value <= goodThreshold) return "健康";
  if (value > riskThreshold) return "风险";
  return "关注";
}

async function queryOrderMetrics(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  query: string,
): Promise<MetricsResult> {
  let after: string | undefined;
  let orderCount = 0;
  let salesAmount = 0;
  let refundAmount = 0;
  const refundedOrderIds = new Set<string>();
  let currencyCode = "";

  for (let i = 0; i < 20; i += 1) {
    const response = await admin.graphql(ORDER_METRICS_QUERY, {
      variables: { first: 250, after, query },
    });
    const payload = (await response.json()) as {
      data?: {
        orders?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{
            id?: string;
            currentTotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
            refunds?: Array<{ totalRefundedSet?: { shopMoney?: { amount?: string } } }>;
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) throw new Error(gqlErrors.join("；"));

    const orders = payload.data?.orders;
    const nodes = orders?.nodes ?? [];
    orderCount += nodes.length;

    for (const order of nodes) {
      const amount = Number(order.currentTotalPriceSet?.shopMoney?.amount ?? 0);
      if (Number.isFinite(amount)) salesAmount += amount;
      currencyCode ||= order.currentTotalPriceSet?.shopMoney?.currencyCode ?? "";
      for (const refund of order.refunds ?? []) {
        const refundValue = Number(refund.totalRefundedSet?.shopMoney?.amount ?? 0);
        if (Number.isFinite(refundValue)) {
          refundAmount += refundValue;
          if (order.id) refundedOrderIds.add(order.id);
        }
      }
    }

    if (!orders?.pageInfo?.hasNextPage || !orders.pageInfo.endCursor) break;
    after = orders.pageInfo.endCursor;
  }

  return {
    orderCount,
    salesAmount: Number(salesAmount.toFixed(2)),
    refundAmount: Number(refundAmount.toFixed(2)),
    refundedOrderCount: refundedOrderIds.size,
    currencyCode: currencyCode || "N/A",
  };
}

async function queryAbandonedCount(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  query: string,
) {
  let after: string | undefined;
  let count = 0;
  for (let i = 0; i < 20; i += 1) {
    const response = await admin.graphql(ABANDONED_CHECKOUTS_QUERY, {
      variables: { first: 250, after, query },
    });
    const payload = (await response.json()) as {
      data?: {
        abandonedCheckouts?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{ id?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) throw new Error(gqlErrors.join("；"));

    const checkouts = payload.data?.abandonedCheckouts;
    count += checkouts?.nodes?.length ?? 0;
    if (!checkouts?.pageInfo?.hasNextPage || !checkouts.pageInfo.endCursor) break;
    after = checkouts.pageInfo.endCursor;
  }
  return count;
}

async function queryInventoryHealth(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
) {
  let after: string | undefined;
  let total = 0;
  let low = 0;
  let out = 0;
  for (let i = 0; i < 8; i += 1) {
    const response = await admin.graphql(INVENTORY_QUERY, {
      variables: { first: 250, after },
    });
    const payload = (await response.json()) as {
      data?: {
        productVariants?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: Array<{ inventoryQuantity?: number }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) throw new Error(gqlErrors.join("；"));

    const variants = payload.data?.productVariants;
    for (const node of variants?.nodes ?? []) {
      const qty = Number(node.inventoryQuantity ?? 0);
      if (!Number.isFinite(qty)) continue;
      total += 1;
      if (qty <= 5) low += 1;
      if (qty <= 0) out += 1;
    }
    if (!variants?.pageInfo?.hasNextPage || !variants.pageInfo.endCursor) break;
    after = variants.pageInfo.endCursor;
  }
  return { total, low, out };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const locale = request.headers.get("accept-language")?.startsWith("en") ? "en-US" : "zh-CN";
  const { admin, session } = await authenticate.admin(request);
  const now = new Date();
  const currentRangeQuery = `created_at:>=${isoSince(7)}`;
  const prevRangeQuery = `created_at:>=${isoSince(14)} created_at:<${isoSince(7)}`;
  try {
    const [currentMetrics, prevMetrics, inventory] = await Promise.all([
      queryOrderMetrics(admin, currentRangeQuery),
      queryOrderMetrics(admin, prevRangeQuery),
      queryInventoryHealth(admin),
    ]);

    let abandonedCount = 0;
    try {
      abandonedCount = await queryAbandonedCount(admin, currentRangeQuery);
    } catch {
      abandonedCount = 0;
    }

    const conversionDenominator = currentMetrics.orderCount + abandonedCount;
    const conversionRate =
      conversionDenominator > 0 ? (currentMetrics.orderCount / conversionDenominator) * 100 : 0;
    const refundRate =
      currentMetrics.orderCount > 0
        ? (currentMetrics.refundedOrderCount / currentMetrics.orderCount) * 100
        : 0;
    const aov =
      currentMetrics.orderCount > 0
        ? currentMetrics.salesAmount / currentMetrics.orderCount
        : 0;
    const lowStockRate = inventory.total > 0 ? (inventory.low / inventory.total) * 100 : 0;
    const outOfStockRate = inventory.total > 0 ? (inventory.out / inventory.total) * 100 : 0;
    const salesGrowth =
      prevMetrics.salesAmount > 0
        ? ((currentMetrics.salesAmount - prevMetrics.salesAmount) / prevMetrics.salesAmount) *
          100
        : 0;

    const salesStatus = safeStatus(salesGrowth, 5, -5, false);
    const conversionStatus = safeStatus(conversionRate, 28, 18, false);
    const inventoryStatus = safeStatus(outOfStockRate, 5, 12, true);
    const refundStatus = safeStatus(refundRate, 5, 12, true);

    const diagnoses: string[] = [];
    if (salesStatus === "健康") {
      diagnoses.push("additional.diagSalesHealthy");
    } else if (salesStatus === "风险") {
      diagnoses.push("additional.diagSalesRisk");
    } else {
      diagnoses.push("additional.diagSalesWatch");
    }
    if (inventoryStatus === "风险") {
      diagnoses.push("additional.diagInventoryRisk");
    } else if (inventoryStatus === "关注") {
      diagnoses.push("additional.diagInventoryWatch");
    } else {
      diagnoses.push("additional.diagInventoryHealthy");
    }
    if (conversionStatus === "风险") {
      diagnoses.push("additional.diagConversionRisk");
    }
    if (refundStatus === "风险") {
      diagnoses.push("additional.diagRefundRisk");
    }

    const dashboard: DashboardData = {
      summary: {
        shop: session.shop,
        updatedAt: now.toLocaleString(locale),
        periodLabel: "additional.periodLast7Days",
        salesAmount: `${currentMetrics.salesAmount.toFixed(2)} ${currentMetrics.currencyCode}`,
        orderCount: currentMetrics.orderCount,
        aov: `${aov.toFixed(2)} ${currentMetrics.currencyCode}`,
        conversionRate: formatPercent(conversionRate),
        refundRate: formatPercent(refundRate),
        lowStockRate: formatPercent(lowStockRate),
        outOfStockRate: formatPercent(outOfStockRate),
      },
      statuses: [
        {
          label: "additional.statusSalesTrend",
          status: salesStatus,
          detail: formatPercent(salesGrowth),
          detailType: "salesTrend",
        },
        {
          label: "additional.statusConversion",
          status: conversionStatus,
          detail: formatPercent(conversionRate),
          detailType: "conversion",
        },
        {
          label: "additional.statusInventory",
          status: inventoryStatus,
          detail: `${formatPercent(lowStockRate)}|${formatPercent(outOfStockRate)}`,
          detailType: "inventory",
        },
        {
          label: "additional.statusRefund",
          status: refundStatus,
          detail: formatPercent(refundRate),
          detailType: "refund",
        },
      ],
      diagnoses,
      clickInsight: "additional.clickInsight",
    };

    return Response.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const fallback: DashboardData = {
      summary: {
        shop: session.shop,
        updatedAt: now.toLocaleString(locale),
        periodLabel: "additional.periodLast7Days",
        salesAmount: "additional.fallbackNoData",
        orderCount: 0,
        aov: "additional.fallbackNoData",
        conversionRate: "additional.fallbackNoData",
        refundRate: "additional.fallbackNoData",
        lowStockRate: "additional.fallbackNoData",
        outOfStockRate: "additional.fallbackNoData",
      },
      statuses: [
        { label: "additional.statusSalesTrend", status: "关注", detail: "additional.fallbackSalesTrend" },
        { label: "additional.statusConversion", status: "关注", detail: "additional.fallbackConversion" },
        { label: "additional.statusInventory", status: "关注", detail: "additional.fallbackInventory" },
        { label: "additional.statusRefund", status: "关注", detail: "additional.fallbackRefund" },
      ],
      diagnoses: [
        `additional.fallbackDiagFailure::${message}`,
        "additional.fallbackDiagScopes",
      ],
      clickInsight: "additional.clickInsight",
    };
    return Response.json(fallback);
  }
};

function statusTone(status: "健康" | "关注" | "风险"): "success" | "warning" | "critical" {
  if (status === "健康") return "success";
  if (status === "关注") return "warning";
  return "critical";
}

export default function AdditionalPage() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  const resolveStatusText = (status: "健康" | "关注" | "风险") => {
    if (status === "健康") return t("additional.statusHealthy");
    if (status === "关注") return t("additional.statusWatch");
    return t("additional.statusRisk");
  };
  const resolveDetailText = (item: { detail: string; detailType?: string }) => {
    if (item.detailType === "salesTrend") {
      return t("additional.salesTrendDetail", { value: item.detail });
    }
    if (item.detailType === "conversion") {
      return t("additional.conversionDetail", { value: item.detail });
    }
    if (item.detailType === "inventory") {
      const [low, out] = item.detail.split("|");
      return t("additional.inventoryDetail", { low, out });
    }
    if (item.detailType === "refund") {
      return t("additional.refundDetail", { value: item.detail });
    }
    return t(item.detail);
  };
  const resolveDiagnosis = (line: string) => {
    if (line.startsWith("additional.fallbackDiagFailure::")) {
      return t("additional.fallbackDiagFailure", {
        message: line.replace("additional.fallbackDiagFailure::", ""),
      });
    }
    return t(line);
  };
  const resolveSummary = (value: string) =>
    value.startsWith("additional.") ? t(value) : value;

  return (
    <s-page heading={t("additional.pageTitle")}>
      <s-section heading={t("additional.coreBoard")}>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone="info">{t("additional.shopLabel", { value: data.summary.shop })}</s-badge>
          <s-badge tone="success">{t("additional.updatedAtLabel", { value: data.summary.updatedAt })}</s-badge>
        </s-stack>

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="small">
            <s-paragraph>{t("additional.salesAmount", { value: resolveSummary(data.summary.salesAmount) })}</s-paragraph>
            <s-paragraph>{t("additional.orderCount", { value: data.summary.orderCount })}</s-paragraph>
            <s-paragraph>{t("additional.aov", { value: resolveSummary(data.summary.aov) })}</s-paragraph>
            <s-paragraph>{t("additional.conversionRate", { value: resolveSummary(data.summary.conversionRate) })}</s-paragraph>
            <s-paragraph>{t("additional.refundRate", { value: resolveSummary(data.summary.refundRate) })}</s-paragraph>
            <s-paragraph>{t("additional.lowStockRate", { value: resolveSummary(data.summary.lowStockRate) })}</s-paragraph>
            <s-paragraph>{t("additional.outOfStockRate", { value: resolveSummary(data.summary.outOfStockRate) })}</s-paragraph>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading={t("additional.healthDiagnosis")}>
        <s-stack direction="block" gap="small">
          {data.statuses.map((item) => (
            <s-box
              key={item.label}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="inline" gap="base" alignItems="center">
                <s-badge tone={statusTone(item.status)}>
                  {t(item.label)}：{resolveStatusText(item.status)}
                </s-badge>
                <s-paragraph>{resolveDetailText(item)}</s-paragraph>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading={t("additional.systemConclusion")}>
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-unordered-list>
            {data.diagnoses.map((line) => (
              <s-list-item key={line}>{resolveDiagnosis(line)}</s-list-item>
            ))}
          </s-unordered-list>
        </s-box>
      </s-section>

      <s-section slot="aside" heading={t("additional.trafficAdvice")}>
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-paragraph>{t(data.clickInsight)}</s-paragraph>
        </s-box>
      </s-section>
    </s-page>
  );
}
