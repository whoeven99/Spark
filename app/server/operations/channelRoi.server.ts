import prisma from "../../db.server";
import type { ShopCostConfigView } from "./roi/costConfig.server";
import { loadSkuCostMap } from "./roi/skuCostSync.server";
import {
  computeBusinessRoi,
  computeContributionProfit,
  gradeBusinessRoi,
  judgeConfidence,
  type RoiSummary,
} from "./roi/roiCore.server";
import { loadCustomerValueMap } from "./customerValue.server";

/**
 * 渠道经营三层输出（docs/DAILY_OPERATIONS_WORKFLOWS.md §8.2 / §8.5.13）：
 * 1. 收入层：按订单 UTM / 来源归因的真实收入（last-click 口径）
 * 2. 利润层：贡献利润近似（逐 SKU COGS 优先，缺失回退默认毛利率；未含运费补贴）
 * 3. ROI 层：投放成本未接入 → businessRoi = null、不给等级、confidence 标注缺口
 */

const WINDOW_DAYS = 30;
const MAX_CHANNELS = 8;

export type ChannelCustomerQuality = {
  distinctCustomers: number;
  /** 首单订单占比（%） */
  newOrderShare: number;
  /** 复购客户占比（%，该渠道客户中订单数>=2 的占比） */
  repeatCustomerShare: number;
  averageCustomerValueScore: number | null;
  refundRiskCustomerShare: number;
};

export type ChannelMetrics = {
  channelKey: string;
  label: string;
  orderCount: number;
  revenue: number;
  discountCost: number;
  refundLoss: number;
  paymentFees: number;
  cogs: number;
  /** 逐 SKU 真实成本覆盖的收入占比（%），其余按默认毛利率估算 */
  cogsRealCoveragePercent: number;
  contributionProfit: number;
  contributionMarginPercent: number | null;
  roi: RoiSummary;
  customers: ChannelCustomerQuality;
};

export type ChannelRoiResult = {
  windowDays: number;
  currency: string;
  totalRevenue: number;
  /** 可归因到具体渠道的收入占比（%，非 direct/unknown） */
  attributedRevenueShare: number;
  channels: ChannelMetrics[];
  /** 口径说明（页面/AI 共用） */
  caveats: string[];
};

// ── 渠道归类 ────────────────────────────────

const REFERRER_CHANNELS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /google\./i, key: "google" },
  { pattern: /facebook\.|fb\.com/i, key: "facebook" },
  { pattern: /instagram\./i, key: "instagram" },
  { pattern: /tiktok\./i, key: "tiktok" },
  { pattern: /bing\./i, key: "bing" },
  { pattern: /youtube\./i, key: "youtube" },
  { pattern: /pinterest\./i, key: "pinterest" },
  { pattern: /twitter\.|x\.com/i, key: "x" },
];

function classifyChannel(order: {
  utmSource: string | null;
  sourceName: string | null;
  referringSite: string | null;
}): string {
  const utm = order.utmSource?.trim().toLowerCase();
  if (utm) return utm;
  const referrer = order.referringSite?.trim();
  if (referrer) {
    for (const { pattern, key } of REFERRER_CHANNELS) {
      if (pattern.test(referrer)) return key;
    }
    return "referral";
  }
  const source = order.sourceName?.trim().toLowerCase();
  if (source && source !== "web") {
    // 纯数字 sourceName 是销售渠道 app id（如 Buy Button / 三方渠道）
    return /^\d+$/.test(source) ? "app" : source;
  }
  return "direct";
}

const CHANNEL_LABELS: Record<string, string> = {
  direct: "直接访问",
  referral: "其他引荐",
  google: "Google",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  bing: "Bing",
  youtube: "YouTube",
  pinterest: "Pinterest",
  x: "X (Twitter)",
  pos: "线下 POS",
  shopify_draft_order: "草稿订单",
  app: "渠道应用",
};

function channelLabel(key: string): string {
  return CHANNEL_LABELS[key] ?? key;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ── 主计算 ────────────────────────────────

export async function computeChannelRoi(
  shop: string,
  costConfig: ShopCostConfigView,
  now: Date = new Date(),
): Promise<ChannelRoiResult> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [orders, refunds, skuCostMap, customerValueMap] = await Promise.all([
    prisma.shopOrder.findMany({
      where: { shop, createdAt: { gte: since }, status: { not: "cancelled" } },
      select: {
        shopifyOrderId: true,
        totalPrice: true,
        totalDiscounts: true,
        currency: true,
        utmSource: true,
        sourceName: true,
        referringSite: true,
        isFirstOrder: true,
        shopifyCustomerId: true,
        lineItems: {
          select: {
            inventoryItemId: true,
            variantId: true,
            sku: true,
            quantity: true,
            price: true,
            totalDiscount: true,
          },
        },
      },
    }),
    prisma.shopRefund.findMany({
      where: { shop, processedAt: { gte: since } },
      select: { refundAmount: true, shopifyOrderId: true },
    }),
    loadSkuCostMap(shop),
    loadCustomerValueMap(shop),
  ]);

  const currency = orders[0]?.currency ?? "USD";
  const margin = Math.max(0, Math.min(100, costConfig.defaultGrossMarginPercent)) / 100;

  // 订单 → 渠道映射（退款归因用）
  const orderChannel = new Map<string, string>();

  type Bucket = {
    orderCount: number;
    revenue: number;
    discountCost: number;
    refundLoss: number;
    cogs: number;
    lineRevenueTotal: number;
    lineRevenueWithRealCost: number;
    firstOrderCount: number;
    customerIds: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  const getBucket = (key: string): Bucket => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        orderCount: 0,
        revenue: 0,
        discountCost: 0,
        refundLoss: 0,
        cogs: 0,
        lineRevenueTotal: 0,
        lineRevenueWithRealCost: 0,
        firstOrderCount: 0,
        customerIds: new Set(),
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const order of orders) {
    const key = classifyChannel(order);
    orderChannel.set(order.shopifyOrderId, key);
    const bucket = getBucket(key);
    bucket.orderCount += 1;
    bucket.revenue += order.totalPrice;
    bucket.discountCost += order.totalDiscounts;
    if (order.isFirstOrder) bucket.firstOrderCount += 1;
    if (order.shopifyCustomerId) bucket.customerIds.add(order.shopifyCustomerId);

    for (const line of order.lineItems) {
      const lineRevenue = Math.max(0, line.price * line.quantity - line.totalDiscount);
      bucket.lineRevenueTotal += lineRevenue;
      const unitCost =
        (line.inventoryItemId ? skuCostMap.get(line.inventoryItemId) : undefined) ??
        (line.sku ? skuCostMap.get(`sku:${line.sku}`) : undefined) ??
        (line.variantId ? skuCostMap.get(`variant:${line.variantId}`) : undefined);
      if (unitCost !== undefined) {
        bucket.cogs += unitCost * line.quantity;
        bucket.lineRevenueWithRealCost += lineRevenue;
      } else {
        bucket.cogs += lineRevenue * (1 - margin);
      }
    }
  }

  for (const refund of refunds) {
    const key = orderChannel.get(refund.shopifyOrderId);
    if (!key) continue;
    getBucket(key).refundLoss += refund.refundAmount;
  }

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const attributedRevenue = Array.from(buckets.entries())
    .filter(([key]) => key !== "direct" && key !== "referral")
    .reduce((sum, [, b]) => sum + b.revenue, 0);
  const attributedShare = totalRevenue > 0 ? attributedRevenue / totalRevenue : 0;

  const channels: ChannelMetrics[] = Array.from(buckets.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, MAX_CHANNELS)
    .map(([key, bucket]) => {
      const paymentFees =
        bucket.revenue * (costConfig.paymentFeePercent / 100) +
        bucket.orderCount * costConfig.paymentFeeFixed;
      const contributionProfit = computeContributionProfit({
        attributedRevenue: bucket.revenue,
        cogs: bucket.cogs,
        discountCost: bucket.discountCost,
        shippingSubsidy: 0,
        paymentFees,
        refundLoss: bucket.refundLoss,
      });

      const cogsRealCoverage =
        bucket.lineRevenueTotal > 0
          ? bucket.lineRevenueWithRealCost / bucket.lineRevenueTotal
          : 0;
      // 投放成本未接入：成本完整度按 COGS 覆盖打五折，确保 ROI 层停留在低置信度
      const confidence = judgeConfidence({
        attributionCoverage: attributedShare,
        costCompleteness: cogsRealCoverage * 0.5,
        freshness: 1,
        sampleOrders: bucket.orderCount,
      });
      const investmentCost = null;
      const businessRoi = computeBusinessRoi(contributionProfit, investmentCost ?? 0);
      const grade = gradeBusinessRoi(businessRoi);

      const customerEntries = Array.from(bucket.customerIds).map((id) =>
        customerValueMap.get(id),
      );
      const knownCustomers = customerEntries.filter(
        (entry): entry is NonNullable<typeof entry> => Boolean(entry),
      );
      const repeatCustomers = knownCustomers.filter(
        (entry) => entry.segment === "active" || entry.segment === "vip",
      ).length;
      const refundRiskCustomers = knownCustomers.filter((entry) =>
        entry.tags.includes("refund_risk"),
      ).length;

      return {
        channelKey: key,
        label: channelLabel(key),
        orderCount: bucket.orderCount,
        revenue: round(bucket.revenue),
        discountCost: round(bucket.discountCost),
        refundLoss: round(bucket.refundLoss),
        paymentFees: round(paymentFees),
        cogs: round(bucket.cogs),
        cogsRealCoveragePercent: round(cogsRealCoverage * 100, 1),
        contributionProfit: round(contributionProfit),
        contributionMarginPercent:
          bucket.revenue > 0 ? round((contributionProfit / bucket.revenue) * 100, 1) : null,
        roi: {
          attributedRevenue: round(bucket.revenue),
          contributionProfit: round(contributionProfit),
          investmentCost,
          businessRoi,
          roiGrade: grade?.grade ?? null,
          confidence: confidence.confidence,
          confidenceScore: confidence.score,
          confidenceGaps: [...confidence.gaps, "投放成本未接入（广告平台数据待同步）"],
          attributionWindow: `${WINDOW_DAYS}d`,
        },
        customers: {
          distinctCustomers: bucket.customerIds.size,
          newOrderShare:
            bucket.orderCount > 0
              ? round((bucket.firstOrderCount / bucket.orderCount) * 100, 1)
              : 0,
          repeatCustomerShare:
            knownCustomers.length > 0
              ? round((repeatCustomers / knownCustomers.length) * 100, 1)
              : 0,
          averageCustomerValueScore:
            knownCustomers.length > 0
              ? round(
                  knownCustomers.reduce((sum, entry) => sum + entry.score, 0) /
                    knownCustomers.length,
                  1,
                )
              : null,
          refundRiskCustomerShare:
            knownCustomers.length > 0
              ? round((refundRiskCustomers / knownCustomers.length) * 100, 1)
              : 0,
        },
      };
    });

  return {
    windowDays: WINDOW_DAYS,
    currency,
    totalRevenue: round(totalRevenue),
    attributedRevenueShare: round(attributedShare * 100, 1),
    channels,
    caveats: [
      `贡献利润为估算口径：逐 SKU 成本优先，缺失部分按默认毛利率 ${costConfig.defaultGrossMarginPercent}% 估算；支付手续费按 ${costConfig.paymentFeePercent}% + ${costConfig.paymentFeeFixed}/单估算；未含运费补贴`,
      "投放成本未接入，Business ROI 暂不评级（接入广告数据后自动启用 S~D 等级）",
      "渠道归因为 last-click 口径（订单 UTM / 引荐来源）",
    ],
  };
}
