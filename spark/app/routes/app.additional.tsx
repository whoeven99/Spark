import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
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
  statuses: Array<{ label: string; status: "健康" | "关注" | "风险"; detail: string }>;
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
    currencyCode: currencyCode || "未知币种",
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
      diagnoses.push("销售趋势健康：近7天销售额较前7天保持增长。");
    } else if (salesStatus === "风险") {
      diagnoses.push("销售趋势偏弱：近7天销售额较前7天下滑，建议检查流量与活动。");
    } else {
      diagnoses.push("销售趋势平稳：建议继续观察渠道投放与活动转化。");
    }
    if (inventoryStatus === "风险") {
      diagnoses.push("库存风险较高：缺货占比偏高，需优先补货高动销 SKU。");
    } else if (inventoryStatus === "关注") {
      diagnoses.push("库存需关注：低库存 SKU 占比偏高，建议做补货排期。");
    } else {
      diagnoses.push("库存整体健康：当前缺货风险可控。");
    }
    if (conversionStatus === "风险") {
      diagnoses.push("转化偏低：建议优先排查商品页、运费策略和结账流程。");
    }
    if (refundStatus === "风险") {
      diagnoses.push("退款率偏高：建议排查商品描述、质量与履约时效。");
    }

    const dashboard: DashboardData = {
      summary: {
        shop: session.shop,
        updatedAt: now.toLocaleString("zh-CN"),
        periodLabel: "最近7天",
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
          label: "销售趋势",
          status: salesStatus,
          detail: `近7天较前7天：${formatPercent(salesGrowth)}`,
        },
        {
          label: "转化健康度",
          status: conversionStatus,
          detail: `订单+弃购口径转化率：${formatPercent(conversionRate)}`,
        },
        {
          label: "库存健康度",
          status: inventoryStatus,
          detail: `低库存 ${formatPercent(lowStockRate)}，缺货 ${formatPercent(outOfStockRate)}`,
        },
        {
          label: "退款健康度",
          status: refundStatus,
          detail: `退款订单占比：${formatPercent(refundRate)}`,
        },
      ],
      diagnoses,
      clickInsight:
        "点击量健康度：当前未接入广告点击数据源（Meta/Google/TikTok）。建议先完成广告平台授权后再诊断点击率与ROAS。",
    };

    return Response.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    const fallback: DashboardData = {
      summary: {
        shop: session.shop,
        updatedAt: now.toLocaleString("zh-CN"),
        periodLabel: "最近7天",
        salesAmount: "N/A",
        orderCount: 0,
        aov: "N/A",
        conversionRate: "N/A",
        refundRate: "N/A",
        lowStockRate: "N/A",
        outOfStockRate: "N/A",
      },
      statuses: [
        { label: "销售趋势", status: "关注", detail: "暂无法读取订单数据" },
        { label: "转化健康度", status: "关注", detail: "暂无法读取弃购或订单数据" },
        { label: "库存健康度", status: "关注", detail: "暂无法读取库存数据" },
        { label: "退款健康度", status: "关注", detail: "暂无法读取退款数据" },
      ],
      diagnoses: [
        `诊断数据读取失败：${message}`,
        "请检查应用 scopes（read_orders/read_products）和当前员工账号权限后重试。",
      ],
      clickInsight:
        "点击量健康度：当前未接入广告点击数据源（Meta/Google/TikTok）。建议先完成广告平台授权后再诊断点击率与ROAS。",
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
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="店铺运维诊断报告">
      <s-section heading="核心看板（最近7天）">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone="info">店铺：{data.summary.shop}</s-badge>
          <s-badge tone="success">更新时间：{data.summary.updatedAt}</s-badge>
        </s-stack>

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="small">
            <s-paragraph>销售额：{data.summary.salesAmount}</s-paragraph>
            <s-paragraph>订单数：{data.summary.orderCount}</s-paragraph>
            <s-paragraph>客单价（AOV）：{data.summary.aov}</s-paragraph>
            <s-paragraph>转化率（订单+弃购口径）：{data.summary.conversionRate}</s-paragraph>
            <s-paragraph>退款率：{data.summary.refundRate}</s-paragraph>
            <s-paragraph>低库存率：{data.summary.lowStockRate}</s-paragraph>
            <s-paragraph>缺货率：{data.summary.outOfStockRate}</s-paragraph>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="健康状态诊断">
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
                <s-badge tone={statusTone(item.status)}>{item.label}：{item.status}</s-badge>
                <s-paragraph>{item.detail}</s-paragraph>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="系统诊断结论">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-unordered-list>
            {data.diagnoses.map((line) => (
              <s-list-item key={line}>{line}</s-list-item>
            ))}
          </s-unordered-list>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="点击与流量建议">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-paragraph>{data.clickInsight}</s-paragraph>
        </s-box>
      </s-section>
    </s-page>
  );
}
