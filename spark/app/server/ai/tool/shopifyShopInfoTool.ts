import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/** 与 `authenticate.admin` 返回的 `admin` 兼容的最小类型，用于 GraphQL 查询。 */
export type ShopifyAdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const SHOP_BASIC_INFO_QUERY = `#graphql
  query ShopBasicInfo {
    shop {
      id
      name
      myshopifyDomain
      email
      contactEmail
      currencyCode
      ianaTimezone
      timezoneAbbreviation
      url
      plan {
        publicDisplayName
        shopifyPlus
        partnerDevelopment
      }
      primaryDomain {
        host
        url
      }
    }
  }
`;

const TODAY_ORDER_METRICS_QUERY = `#graphql
  query TodayOrderMetrics($first: Int!, $after: String, $query: String!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sourceName
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
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const TODAY_ABANDONED_CHECKOUTS_QUERY = `#graphql
  query TodayAbandonedCheckouts($first: Int!, $after: String, $query: String!) {
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

const INVENTORY_VARIANTS_QUERY = `#graphql
  query InventoryVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        sku
        inventoryQuantity
        product {
          title
          status
        }
      }
    }
  }
`;

type ShopBasicInfoResponse = {
  data?: {
    shop?: {
      id?: string;
      name?: string;
      myshopifyDomain?: string;
      email?: string;
      contactEmail?: string;
      currencyCode?: string;
      ianaTimezone?: string;
      timezoneAbbreviation?: string;
      url?: string;
      plan?: {
        publicDisplayName?: string;
        displayName?: string;
        shopifyPlus?: boolean;
        partnerDevelopment?: boolean;
      };
      primaryDomain?: { host?: string; url?: string };
    };
  };
  errors?: Array<{ message?: string }>;
};

type TodayOrderMetricsResponse = {
  data?: {
    orders?: {
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
      nodes?: Array<{
        id?: string;
        sourceName?: string;
        currentTotalPriceSet?: {
          shopMoney?: {
            amount?: string;
            currencyCode?: string;
          };
        };
        refunds?: Array<{
          id?: string;
          totalRefundedSet?: {
            shopMoney?: {
              amount?: string;
              currencyCode?: string;
            };
          };
        }>;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

type TodayOrderStats = {
  orderCount: number;
  salesAmount: number;
  currencyCode: string;
  refundedOrderCount: number;
  refundAmount: number;
  sourceBreakdown: Record<string, { orderCount: number; salesAmount: number }>;
};

type AbandonedCheckoutResponse = {
  data?: {
    abandonedCheckouts?: {
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
      nodes?: Array<{ id?: string }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

type InventoryVariantsResponse = {
  data?: {
    productVariants?: {
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
      nodes?: Array<{
        id?: string;
        title?: string;
        sku?: string;
        inventoryQuantity?: number;
        product?: {
          title?: string;
          status?: string;
        };
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

type InventoryHealthStats = {
  checkedVariantCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStockItems: Array<{ name: string; sku: string; quantity: number }>;
};

const metricRangeSchema = z.object({
  days: z
    .number()
    .int("days 必须是整数")
    .min(1, "days 最小为 1")
    .max(90, "days 最大为 90")
    .optional()
    .describe("查询最近几天的数据，默认 1（最近一天）"),
});

function formatShopBasicInfo(payload: ShopBasicInfoResponse): string {
  const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
  if (gqlErrors?.length) {
    return `查询商店信息失败：${gqlErrors.join("；")}`;
  }

  const shop = payload.data?.shop;
  if (!shop) {
    return "未返回商店数据，请确认应用已正确安装并具有访问权限。";
  }

  const lines: string[] = ["当前商店基础信息："];
  if (shop.name) lines.push(`名称：${shop.name}`);
  if (shop.myshopifyDomain) lines.push(`myshopify 域名：${shop.myshopifyDomain}`);
  const pd = shop.primaryDomain;
  if (pd?.host || pd?.url) {
    const hostPart = pd.host ?? "";
    const urlPart = pd.url ? (pd.host ? `（${pd.url}）` : pd.url) : "";
    lines.push(`主域名：${hostPart}${urlPart}`);
  }
  if (shop.url) lines.push(`网店 URL：${shop.url}`);
  if (shop.email) lines.push(`店主邮箱：${shop.email}`);
  if (shop.contactEmail) lines.push(`联系邮箱：${shop.contactEmail}`);
  if (shop.currencyCode) lines.push(`币种：${shop.currencyCode}`);
  if (shop.ianaTimezone) lines.push(`时区：${shop.ianaTimezone}`);
  if (shop.timezoneAbbreviation) lines.push(`时区缩写：${shop.timezoneAbbreviation}`);
  const planName = shop.plan?.publicDisplayName ?? shop.plan?.displayName ?? "";
  if (planName || shop.plan?.shopifyPlus || shop.plan?.partnerDevelopment) {
    const bits: string[] = [];
    if (planName) bits.push(planName);
    if (shop.plan?.shopifyPlus) bits.push("Shopify Plus");
    if (shop.plan?.partnerDevelopment) bits.push("合作伙伴开发店");
    lines.push(`套餐：${bits.join("，")}`);
  }
  if (shop.id) lines.push(`Shop ID：${shop.id}`);

  return lines.join("\n");
}

function normalizeDays(days?: number): number {
  return days && Number.isFinite(days) ? days : 1;
}

function formatDaysLabel(days: number): string {
  return days === 1 ? "最近一天" : `最近 ${days} 天`;
}

function buildCreatedAtQuery(days: number): string {
  const safeDays = normalizeDays(days);
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  return `created_at:>=${since}`;
}

async function queryOrderStatsByDays(
  admin: ShopifyAdminGraphqlClient,
  days = 1,
): Promise<TodayOrderStats> {
  const query = buildCreatedAtQuery(days);
  const first = 250;
  let after: string | undefined;
  let orderCount = 0;
  let salesAmount = 0;
  let currencyCode = "";
  let refundAmount = 0;
  const refundedOrderIds = new Set<string>();
  const sourceBreakdown = new Map<string, { orderCount: number; salesAmount: number }>();

  for (let i = 0; i < 20; i += 1) {
    const response = await admin.graphql(TODAY_ORDER_METRICS_QUERY, {
      variables: { first, after, query },
    });
    const payload = (await response.json()) as TodayOrderMetricsResponse;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      throw new Error(gqlErrors.join("；"));
    }

    const orders = payload.data?.orders;
    const nodes = orders?.nodes ?? [];
    orderCount += nodes.length;

    for (const order of nodes) {
      const source = order.sourceName?.trim() || "unknown";
      const amount = Number(order.currentTotalPriceSet?.shopMoney?.amount ?? 0);
      if (Number.isFinite(amount)) {
        salesAmount += amount;
      }
      currencyCode ||= order.currentTotalPriceSet?.shopMoney?.currencyCode ?? "";
      const sourceStats = sourceBreakdown.get(source) ?? { orderCount: 0, salesAmount: 0 };
      sourceStats.orderCount += 1;
      sourceStats.salesAmount += Number.isFinite(amount) ? amount : 0;
      sourceBreakdown.set(source, sourceStats);

      for (const refund of order.refunds ?? []) {
        const refundValue = Number(
          refund.totalRefundedSet?.shopMoney?.amount ?? 0,
        );
        if (Number.isFinite(refundValue)) {
          refundAmount += refundValue;
          if (order.id) {
            refundedOrderIds.add(order.id);
          }
        }
      }
    }

    if (!orders?.pageInfo?.hasNextPage || !orders.pageInfo.endCursor) {
      break;
    }
    after = orders.pageInfo.endCursor;
  }

  return {
    orderCount,
    salesAmount: Number(salesAmount.toFixed(2)),
    currencyCode: currencyCode || "未知币种",
    refundedOrderCount: refundedOrderIds.size,
    refundAmount: Number(refundAmount.toFixed(2)),
    sourceBreakdown: Object.fromEntries(
      [...sourceBreakdown.entries()].map(([key, value]) => [
        key,
        {
          orderCount: value.orderCount,
          salesAmount: Number(value.salesAmount.toFixed(2)),
        },
      ]),
    ),
  };
}

async function queryAbandonedCheckoutCountByDays(
  admin: ShopifyAdminGraphqlClient,
  days = 1,
): Promise<number> {
  const query = buildCreatedAtQuery(days);
  const first = 250;
  let after: string | undefined;
  let count = 0;

  for (let i = 0; i < 20; i += 1) {
    const response = await admin.graphql(TODAY_ABANDONED_CHECKOUTS_QUERY, {
      variables: { first, after, query },
    });
    const payload = (await response.json()) as AbandonedCheckoutResponse;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      throw new Error(gqlErrors.join("；"));
    }

    const abandonedCheckouts = payload.data?.abandonedCheckouts;
    count += abandonedCheckouts?.nodes?.length ?? 0;

    if (
      !abandonedCheckouts?.pageInfo?.hasNextPage ||
      !abandonedCheckouts.pageInfo.endCursor
    ) {
      break;
    }
    after = abandonedCheckouts.pageInfo.endCursor;
  }

  return count;
}

async function queryInventoryHealthStats(
  admin: ShopifyAdminGraphqlClient,
): Promise<InventoryHealthStats> {
  const first = 250;
  let after: string | undefined;
  let checkedVariantCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  const lowStockItems: Array<{ name: string; sku: string; quantity: number }> = [];

  for (let i = 0; i < 8; i += 1) {
    const response = await admin.graphql(INVENTORY_VARIANTS_QUERY, {
      variables: { first, after },
    });
    const payload = (await response.json()) as InventoryVariantsResponse;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const gqlErrors = payload.errors?.map((e) => e.message).filter(Boolean);
    if (gqlErrors?.length) {
      throw new Error(gqlErrors.join("；"));
    }

    const variants = payload.data?.productVariants;
    for (const variant of variants?.nodes ?? []) {
      const quantity = Number(variant.inventoryQuantity ?? 0);
      if (!Number.isFinite(quantity)) continue;

      checkedVariantCount += 1;
      if (quantity <= 0) {
        outOfStockCount += 1;
      }
      if (quantity <= 5) {
        lowStockCount += 1;
        if (lowStockItems.length < 8) {
          const productTitle = variant.product?.title?.trim() || "未命名商品";
          const variantTitle = variant.title?.trim() || "默认规格";
          lowStockItems.push({
            name: `${productTitle} / ${variantTitle}`,
            sku: variant.sku?.trim() || "N/A",
            quantity,
          });
        }
      }
    }

    if (!variants?.pageInfo?.hasNextPage || !variants.pageInfo.endCursor) {
      break;
    }
    after = variants.pageInfo.endCursor;
  }

  return {
    checkedVariantCount,
    lowStockCount,
    outOfStockCount,
    lowStockItems,
  };
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function createShopBasicInfoTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_shop_info",
    description:
      "查询当前已授权会话对应的 Shopify 商店基础信息（店名、域名、邮箱、币种、时区、套餐等）。用户询问店铺/商店是谁、域名、币种、时区、套餐时使用。",
    schema: z.object({}),
    func: async () => {
      try {
        const response = await admin.graphql(SHOP_BASIC_INFO_QUERY);
        const payload = (await response.json()) as ShopBasicInfoResponse;

        if (!response.ok) {
          return `查询商店信息失败：HTTP ${response.status}`;
        }

        return formatShopBasicInfo(payload);
      } catch {
        return "查询商店信息失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodaySalesTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_sales",
    description:
      "查询 Shopify 商店销售额（按订单 currentTotalPrice 合计）。可传 days 指定最近几天，默认 1（最近一天）。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const stats = await queryOrderStatsByDays(admin, safeDays);
        return `${formatDaysLabel(safeDays)}销售额：${stats.salesAmount} ${stats.currencyCode}（基于订单金额汇总，订单数 ${stats.orderCount}）。`;
      } catch {
        return "查询销售额失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodayOrderCountTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_order_count",
    description:
      "查询 Shopify 商店订单数。可传 days 指定最近几天，默认 1（最近一天）。用户询问订单量、成交单数时使用。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const stats = await queryOrderStatsByDays(admin, safeDays);
        return `${formatDaysLabel(safeDays)}订单数：${stats.orderCount} 单。`;
      } catch {
        return "查询订单数失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodayConversionRateTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_conversion_rate",
    description:
      "查询 Shopify 商店转化率（checkout 完成率近似：订单数 / (订单数 + 弃购数)）。可传 days 指定最近几天，默认 1。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const [orderStats, abandonedCount] = await Promise.all([
          queryOrderStatsByDays(admin, safeDays),
          queryAbandonedCheckoutCountByDays(admin, safeDays),
        ]);
        const denominator = orderStats.orderCount + abandonedCount;
        const rate = denominator > 0 ? (orderStats.orderCount / denominator) * 100 : 0;
        return `${formatDaysLabel(safeDays)}转化率（checkout 口径）：${formatPercent(rate)}（订单 ${orderStats.orderCount}，弃购 ${abandonedCount}）。`;
      } catch {
        return "查询转化率失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodayAovTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_aov",
    description:
      "查询 Shopify 商店客单价 AOV（销售额/订单数）。可传 days 指定最近几天，默认 1（最近一天）。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const stats = await queryOrderStatsByDays(admin, safeDays);
        const aov = stats.orderCount > 0 ? stats.salesAmount / stats.orderCount : 0;
        return `${formatDaysLabel(safeDays)}客单价 AOV：${aov.toFixed(2)} ${stats.currencyCode}（销售额 ${stats.salesAmount}，订单 ${stats.orderCount}）。`;
      } catch {
        return "查询客单价失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodaySourcePerformanceTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_source_performance",
    description:
      "查询 Shopify 商店流量来源销售表现（按订单 sourceName 聚合）。可传 days 指定最近几天，默认 1。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const stats = await queryOrderStatsByDays(admin, safeDays);
        const entries = Object.entries(stats.sourceBreakdown).sort(
          (a, b) => b[1].salesAmount - a[1].salesAmount,
        );
        if (!entries.length) {
          return `${formatDaysLabel(safeDays)}暂无来源数据。`;
        }

        const lines = [
          `${formatDaysLabel(safeDays)}来源销售表现（币种 ${stats.currencyCode}）：`,
          ...entries.slice(0, 8).map(
            ([source, data]) =>
              `- ${source}：销售额 ${data.salesAmount.toFixed(2)}，订单 ${data.orderCount}`,
          ),
          "注：ROAS 需结合广告花费数据计算，当前结果仅展示来源成交贡献。",
        ];
        return lines.join("\n");
      } catch {
        return "查询来源表现失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodayAbandonmentRateTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_abandonment_rate",
    description:
      "查询 Shopify 商店弃购率（checkout 口径）。可传 days 指定最近几天，默认 1（最近一天）。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const [orderStats, abandonedCount] = await Promise.all([
          queryOrderStatsByDays(admin, safeDays),
          queryAbandonedCheckoutCountByDays(admin, safeDays),
        ]);
        const denominator = orderStats.orderCount + abandonedCount;
        const rate = denominator > 0 ? (abandonedCount / denominator) * 100 : 0;
        return `${formatDaysLabel(safeDays)}弃购率（checkout 口径）：${formatPercent(rate)}（弃购 ${abandonedCount}，订单 ${orderStats.orderCount}）。`;
      } catch {
        return "查询弃购率失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopTodayRefundRateTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_today_refund_return_rate",
    description:
      "查询 Shopify 商店退款率与退款金额（退货率以退款订单占比近似）。可传 days 指定最近几天，默认 1。",
    schema: metricRangeSchema,
    func: async ({ days }) => {
      try {
        const safeDays = normalizeDays(days);
        const stats = await queryOrderStatsByDays(admin, safeDays);
        const refundRate = stats.orderCount > 0 ? (stats.refundedOrderCount / stats.orderCount) * 100 : 0;
        const amountRate = stats.salesAmount > 0 ? (stats.refundAmount / stats.salesAmount) * 100 : 0;
        return [
          `${formatDaysLabel(safeDays)}退款率（按退款订单占比）：${formatPercent(refundRate)}。`,
          `${formatDaysLabel(safeDays)}退款金额：${stats.refundAmount.toFixed(2)} ${stats.currencyCode}（占销售额 ${formatPercent(amountRate)}）。`,
          "注：退货率通常需结合履约/物流退货单据口径，当前以退款数据近似。",
        ].join("\n");
      } catch {
        return "查询退款/退货率失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

function createShopInventoryHealthTool(admin: ShopifyAdminGraphqlClient) {
  return new DynamicStructuredTool({
    name: "get_shopify_inventory_health",
    description:
      "查询 Shopify 商店库存健康（低库存、缺货预警与示例 SKU）。用户询问库存周转、缺货风险、库存健康时使用。",
    schema: z.object({}),
    func: async () => {
      try {
        const stats = await queryInventoryHealthStats(admin);
        if (!stats.checkedVariantCount) {
          return "未查询到可用库存数据。";
        }

        const lowRatio = (stats.lowStockCount / stats.checkedVariantCount) * 100;
        const outRatio = (stats.outOfStockCount / stats.checkedVariantCount) * 100;
        const lines = [
          `库存健康概览：已检查 ${stats.checkedVariantCount} 个 SKU。`,
          `低库存（<=5）：${stats.lowStockCount} 个（${formatPercent(lowRatio)}）。`,
          `缺货（<=0）：${stats.outOfStockCount} 个（${formatPercent(outRatio)}）。`,
        ];
        if (stats.lowStockItems.length) {
          lines.push("重点补货建议（示例）：");
          for (const item of stats.lowStockItems) {
            lines.push(`- ${item.name}（SKU: ${item.sku}，库存 ${item.quantity}）`);
          }
        }
        lines.push("注：库存周转率需要结合周期内销量与平均库存，当前提供缺货风险预警。");
        return lines.join("\n");
      } catch {
        return "查询库存健康失败：网络或接口异常，请稍后重试。";
      }
    },
  });
}

export function createShopifyShopInfoTools(admin: ShopifyAdminGraphqlClient) {
  return [
    createShopBasicInfoTool(admin),
    createShopTodaySalesTool(admin),
    createShopTodayOrderCountTool(admin),
    createShopTodayConversionRateTool(admin),
    createShopTodayAovTool(admin),
    createShopTodaySourcePerformanceTool(admin),
    createShopTodayAbandonmentRateTool(admin),
    createShopTodayRefundRateTool(admin),
    createShopInventoryHealthTool(admin),
  ];
}

export function createShopifyShopInfoTool(admin: ShopifyAdminGraphqlClient) {
  return createShopBasicInfoTool(admin);
}
