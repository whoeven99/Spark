import prisma from "../../db.server";

/**
 * 客户分层与客户价值引擎（docs/DAILY_OPERATIONS_WORKFLOWS.md §8.5，阶段三规则版提前实现）。
 *
 * 全部使用规则近似，不引入预测模型：
 * - 5 主分层：new / active / vip / at_risk / churned（§8.5.11 / §8.16）
 * - 2 风险标签：refund_risk / discount_sensitive
 * - Dynamic LTV = 历史贡献利润（毛利率近似） + 分层规则估算的未来利润（§8.5.2）
 * - Customer Value Score 0-100（§8.5.10 权重）
 *
 * 结果落 ShopCustomerValue（每客户最新状态），每日懒刷新。
 */

export type CustomerSegment = "new" | "active" | "vip" | "at_risk" | "churned";
export type CustomerRiskTag = "refund_risk" | "discount_sensitive";

/** §8.16.3 建议窗口参数（可配置） */
export const SEGMENT_WINDOWS = {
  newWindowDays: 30,
  activeWindowDays: 60,
  riskWindowDays: 90,
  churnWindowDays: 180,
  vipScoreThreshold: 85,
  highValueScoreThreshold: 70,
} as const;

export const RISK_TAG_THRESHOLDS = {
  /** 客户退款率（退款额/消费额 %）超过该值打 refund_risk */
  refundRiskPercent: 30,
  /** 折扣订单占比超过该值打 discount_sensitive */
  discountSensitivePercent: 50,
} as const;

/** §8.5.2 未来利润规则近似：按分层给复购概率与预期单数 */
const SEGMENT_FUTURE_FACTORS: Record<
  CustomerSegment,
  { repeatProbability: number; expectedOrders: number }
> = {
  new: { repeatProbability: 0.2, expectedOrders: 1 },
  active: { repeatProbability: 0.45, expectedOrders: 2 },
  vip: { repeatProbability: 0.7, expectedOrders: 3 },
  at_risk: { repeatProbability: 0.15, expectedOrders: 1 },
  churned: { repeatProbability: 0.05, expectedOrders: 0.5 },
};

/** Score 权重（§8.5.10） */
const SCORE_WEIGHTS = {
  profitQuality: 0.35,
  retention: 0.25,
  membership: 0.15,
  riskPenalty: 0.15,
  dataConfidence: 0.1,
} as const;

/** 无会员体系时的会员分基线 */
const BASE_NON_MEMBER_SCORE = 50;
/** 单店参与计算的客户数上限（按消费额取 Top，防止超大店一次算爆） */
const MAX_CUSTOMERS = 5000;

export type CustomerValueAggregates = {
  totalCustomers: number;
  payingCustomers: number;
  segmentCounts: Record<CustomerSegment, number>;
  tagCounts: Record<CustomerRiskTag, number>;
  averageScore: number;
  medianScore: number;
  /** 复购客户占比（%，订单数 >= 2 / 有购买客户） */
  repeatPurchaseRate: number;
  /** 高价值客户占比（%，score >= 70） */
  highValueShare: number;
  averageDynamicLtv: number;
  updatedAt: string | null;
};

function emptyAggregates(): CustomerValueAggregates {
  return {
    totalCustomers: 0,
    payingCustomers: 0,
    segmentCounts: { new: 0, active: 0, vip: 0, at_risk: 0, churned: 0 },
    tagCounts: { refund_risk: 0, discount_sensitive: 0 },
    averageScore: 0,
    medianScore: 0,
    repeatPurchaseRate: 0,
    highValueShare: 0,
    averageDynamicLtv: 0,
    updatedAt: null,
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 864e5));
}

/** 百分位归一：值在样本中的排名 → 0-100；并列值取平均名次（相同值必须同分）。样本只有 1 个时取 50。 */
function percentileScores(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  if (n === 1) return [50];
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const scores = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1].value === sorted[i].value) j += 1;
    const averageRank = (i + j) / 2;
    for (let k = i; k <= j; k += 1) {
      scores[sorted[k].index] = (averageRank / (n - 1)) * 100;
    }
    i = j + 1;
  }
  return scores;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** 重算全店客户价值并落库，返回聚合结果。 */
export async function recomputeCustomerValues(
  shop: string,
  grossMarginPercent: number,
  now: Date = new Date(),
): Promise<CustomerValueAggregates> {
  const [customerRows, refunds, orderRows] = await Promise.all([
    prisma.shopCustomer.findMany({
      where: { shop },
      select: { shopifyCustomerId: true, email: true },
    }),
    prisma.shopRefund.findMany({
      where: { shop },
      select: {
        refundAmount: true,
        order: { select: { shopifyCustomerId: true } },
      },
    }),
    prisma.shopOrder.findMany({
      where: { shop, status: { not: "cancelled" }, shopifyCustomerId: { not: null } },
      select: {
        shopifyCustomerId: true,
        totalPrice: true,
        totalDiscounts: true,
        createdAt: true,
      },
    }),
  ]);

  const refundByCustomer = new Map<string, number>();
  for (const refund of refunds) {
    const customerId = refund.order?.shopifyCustomerId;
    if (!customerId) continue;
    refundByCustomer.set(
      customerId,
      (refundByCustomer.get(customerId) ?? 0) + refund.refundAmount,
    );
  }

  const emailByCustomer = new Map(
    customerRows.map((row) => [row.shopifyCustomerId, Boolean(row.email)]),
  );

  // 消费统计从订单表派生（持续同步的事实源；ShopCustomer 的 ordersCount/totalSpent 可能未回填）
  const orderStats = new Map<
    string,
    { orders: number; discounted: number; spent: number; firstAt: Date; lastAt: Date }
  >();
  for (const row of orderRows) {
    const customerId = row.shopifyCustomerId as string;
    const current = orderStats.get(customerId) ?? {
      orders: 0,
      discounted: 0,
      spent: 0,
      firstAt: row.createdAt,
      lastAt: row.createdAt,
    };
    current.orders += 1;
    current.spent += row.totalPrice;
    if (row.totalDiscounts > 0) current.discounted += 1;
    if (row.createdAt < current.firstAt) current.firstAt = row.createdAt;
    if (row.createdAt > current.lastAt) current.lastAt = row.createdAt;
    orderStats.set(customerId, current);
  }
  const customers = Array.from(orderStats.entries())
    .map(([shopifyCustomerId, stats]) => ({
      shopifyCustomerId,
      email: emailByCustomer.get(shopifyCustomerId) ?? false,
      ordersCount: stats.orders,
      totalSpent: stats.spent,
      firstOrderDate: stats.firstAt,
      lastOrderDate: stats.lastAt,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, MAX_CUSTOMERS);

  const margin = Math.max(0, Math.min(100, grossMarginPercent)) / 100;

  type Working = {
    shopifyCustomerId: string;
    hasEmail: boolean;
    ordersCount: number;
    totalSpent: number;
    refundAmount: number;
    refundRate: number;
    discountOrderShare: number;
    daysSinceLastOrder: number | null;
    daysSinceFirstOrder: number | null;
    firstOrderAt: Date | null;
    lastOrderAt: Date | null;
    realizedGrossProfit: number;
    provisionalSegment: CustomerSegment;
    predictedFutureProfit: number;
    dynamicLtv: number;
    retentionRaw: number;
  };

  const paying: Working[] = [];
  for (const customer of customers) {
    if (customer.ordersCount <= 0 && customer.totalSpent <= 0) continue;
    const refundAmount = refundByCustomer.get(customer.shopifyCustomerId) ?? 0;
    const stats = orderStats.get(customer.shopifyCustomerId);
    const daysSinceLastOrder = customer.lastOrderDate
      ? daysBetween(customer.lastOrderDate, now)
      : null;
    const daysSinceFirstOrder = customer.firstOrderDate
      ? daysBetween(customer.firstOrderDate, now)
      : null;
    const realizedGrossProfit = customer.totalSpent * margin - refundAmount;

    // §8.5.11 规则分层（vip 需先算分，这里先给临时分层）
    let provisionalSegment: CustomerSegment;
    if (daysSinceLastOrder === null) {
      provisionalSegment = "churned";
    } else if (daysSinceLastOrder > SEGMENT_WINDOWS.churnWindowDays) {
      provisionalSegment = "churned";
    } else if (daysSinceLastOrder > SEGMENT_WINDOWS.riskWindowDays) {
      provisionalSegment = "at_risk";
    } else if (
      customer.ordersCount === 1 &&
      daysSinceFirstOrder !== null &&
      daysSinceFirstOrder <= SEGMENT_WINDOWS.newWindowDays
    ) {
      provisionalSegment = "new";
    } else {
      provisionalSegment = "active";
    }

    const factors = SEGMENT_FUTURE_FACTORS[provisionalSegment];
    const avgProfitPerOrder =
      customer.ordersCount > 0 ? Math.max(0, realizedGrossProfit) / customer.ordersCount : 0;
    const predictedFutureProfit =
      factors.repeatProbability * factors.expectedOrders * avgProfitPerOrder;

    paying.push({
      shopifyCustomerId: customer.shopifyCustomerId,
      hasEmail: Boolean(customer.email),
      ordersCount: customer.ordersCount,
      totalSpent: customer.totalSpent,
      refundAmount,
      refundRate:
        customer.totalSpent > 0
          ? Math.min(100, (refundAmount / customer.totalSpent) * 100)
          : 0,
      discountOrderShare:
        stats && stats.orders > 0 ? (stats.discounted / stats.orders) * 100 : 0,
      daysSinceLastOrder,
      daysSinceFirstOrder,
      firstOrderAt: customer.firstOrderDate,
      lastOrderAt: customer.lastOrderDate,
      realizedGrossProfit,
      provisionalSegment,
      predictedFutureProfit,
      dynamicLtv: realizedGrossProfit + predictedFutureProfit,
      retentionRaw:
        Math.max(0, customer.ordersCount - 1) +
        (daysSinceLastOrder === null
          ? 0
          : Math.max(0, (SEGMENT_WINDOWS.churnWindowDays - daysSinceLastOrder) /
              SEGMENT_WINDOWS.churnWindowDays)),
    });
  }

  // §8.5.10 评分：利润质量与留存用店内百分位归一
  const profitScores = percentileScores(paying.map((c) => c.dynamicLtv));
  const retentionScores = percentileScores(paying.map((c) => c.retentionRaw));

  const ltvSorted = paying.map((c) => c.dynamicLtv).sort((a, b) => a - b);
  const vipLtvThreshold =
    ltvSorted.length > 0 ? ltvSorted[Math.floor(ltvSorted.length * 0.9)] : 0;

  const rows = paying.map((customer, index) => {
    const riskPenaltyAdjusted = clampScore(
      100 -
        customer.refundRate * 1.5 -
        Math.max(0, customer.discountOrderShare - 30) * 0.8,
    );
    const dataConfidence = customer.hasEmail ? 80 : 60;
    const score = clampScore(
      SCORE_WEIGHTS.profitQuality * profitScores[index] +
        SCORE_WEIGHTS.retention * retentionScores[index] +
        SCORE_WEIGHTS.membership * BASE_NON_MEMBER_SCORE +
        SCORE_WEIGHTS.riskPenalty * riskPenaltyAdjusted +
        SCORE_WEIGHTS.dataConfidence * dataConfidence,
    );

    let segment = customer.provisionalSegment;
    if (
      (segment === "active" || segment === "new") &&
      score >= SEGMENT_WINDOWS.vipScoreThreshold &&
      customer.dynamicLtv >= vipLtvThreshold
    ) {
      segment = "vip";
    }

    const tags: CustomerRiskTag[] = [];
    if (customer.refundRate > RISK_TAG_THRESHOLDS.refundRiskPercent) {
      tags.push("refund_risk");
    }
    if (customer.discountOrderShare > RISK_TAG_THRESHOLDS.discountSensitivePercent) {
      tags.push("discount_sensitive");
    }

    return {
      shop,
      shopifyCustomerId: customer.shopifyCustomerId,
      segment,
      tags,
      ordersCount: customer.ordersCount,
      totalSpent: round(customer.totalSpent),
      realizedGrossProfit: round(customer.realizedGrossProfit),
      predictedFutureProfit: round(customer.predictedFutureProfit),
      dynamicLtv: round(customer.dynamicLtv),
      customerValueScore: round(score, 1),
      refundAmount: round(customer.refundAmount),
      refundRate: round(customer.refundRate, 1),
      discountOrderShare: round(customer.discountOrderShare, 1),
      daysSinceLastOrder: customer.daysSinceLastOrder,
      firstOrderAt: customer.firstOrderAt,
      lastOrderAt: customer.lastOrderAt,
    };
  });

  // 全量重建（每客户一行最新状态）
  await prisma.$transaction([
    prisma.shopCustomerValue.deleteMany({ where: { shop } }),
    ...chunk(rows, 200).map((batch) =>
      prisma.shopCustomerValue.createMany({ data: batch }),
    ),
  ]);

  return buildAggregates(Math.max(customerRows.length, customers.length), rows, now);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type AggregateRow = {
  segment: string;
  tags: unknown;
  ordersCount: number;
  customerValueScore: number;
  dynamicLtv: number;
};

function buildAggregates(
  totalCustomers: number,
  rows: AggregateRow[],
  now: Date,
): CustomerValueAggregates {
  const aggregates = emptyAggregates();
  aggregates.totalCustomers = totalCustomers;
  aggregates.payingCustomers = rows.length;
  aggregates.updatedAt = now.toISOString();
  if (rows.length === 0) return aggregates;

  let scoreSum = 0;
  let ltvSum = 0;
  let repeatCount = 0;
  let highValueCount = 0;
  for (const row of rows) {
    const segment = row.segment as CustomerSegment;
    if (segment in aggregates.segmentCounts) {
      aggregates.segmentCounts[segment] += 1;
    }
    const tags = Array.isArray(row.tags) ? (row.tags as CustomerRiskTag[]) : [];
    for (const tag of tags) {
      if (tag in aggregates.tagCounts) aggregates.tagCounts[tag] += 1;
    }
    scoreSum += row.customerValueScore;
    ltvSum += row.dynamicLtv;
    if (row.ordersCount >= 2) repeatCount += 1;
    if (row.customerValueScore >= SEGMENT_WINDOWS.highValueScoreThreshold) {
      highValueCount += 1;
    }
  }
  const scores = rows.map((r) => r.customerValueScore).sort((a, b) => a - b);
  aggregates.averageScore = round(scoreSum / rows.length, 1);
  aggregates.medianScore = round(scores[Math.floor(scores.length / 2)], 1);
  aggregates.repeatPurchaseRate = round((repeatCount / rows.length) * 100, 1);
  aggregates.highValueShare = round((highValueCount / rows.length) * 100, 1);
  aggregates.averageDynamicLtv = round(ltvSum / rows.length);
  return aggregates;
}

/** 从已落库的数据聚合（不重算）。 */
export async function getCustomerValueAggregates(
  shop: string,
): Promise<CustomerValueAggregates> {
  const [rows, totalCustomers, latest] = await Promise.all([
    prisma.shopCustomerValue.findMany({
      where: { shop },
      select: {
        segment: true,
        tags: true,
        ordersCount: true,
        customerValueScore: true,
        dynamicLtv: true,
      },
    }),
    prisma.shopCustomer.count({ where: { shop } }),
    prisma.shopCustomerValue.findFirst({
      where: { shop },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  const aggregates = buildAggregates(totalCustomers, rows, new Date());
  aggregates.updatedAt = latest?.updatedAt.toISOString() ?? null;
  return aggregates;
}

/** 懒刷新：当天已算过则直接聚合返回；force 时重算（成本口径变更后调用）。 */
export async function ensureCustomerValueLayer(
  shop: string,
  grossMarginPercent: number,
  options?: { force?: boolean; now?: Date },
): Promise<CustomerValueAggregates> {
  const now = options?.now ?? new Date();
  if (!options?.force) {
    const latest = await prisma.shopCustomerValue.findFirst({
      where: { shop },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    if (latest && latest.updatedAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
      return getCustomerValueAggregates(shop);
    }
  }
  return recomputeCustomerValues(shop, grossMarginPercent, now);
}

/** 渠道层使用：customerId → { score, segment, tags }。 */
export async function loadCustomerValueMap(
  shop: string,
): Promise<Map<string, { score: number; segment: CustomerSegment; tags: CustomerRiskTag[] }>> {
  const rows = await prisma.shopCustomerValue.findMany({
    where: { shop },
    select: { shopifyCustomerId: true, customerValueScore: true, segment: true, tags: true },
  });
  const map = new Map<string, { score: number; segment: CustomerSegment; tags: CustomerRiskTag[] }>();
  for (const row of rows) {
    map.set(row.shopifyCustomerId, {
      score: row.customerValueScore,
      segment: row.segment as CustomerSegment,
      tags: Array.isArray(row.tags) ? (row.tags as CustomerRiskTag[]) : [],
    });
  }
  return map;
}
