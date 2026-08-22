import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  getShopCostConfig,
  type ShopCostConfigView,
} from "./roi/costConfig.server";
import { ensureSkuCostsFresh } from "./roi/skuCostSync.server";
import {
  ensureCustomerValueLayer,
  getCustomerValueAggregates,
  loadCustomerValueMap,
  type CustomerValueAggregates,
} from "./customerValue.server";
import { computeChannelRoi, type ChannelRoiResult } from "./channelRoi.server";
import prisma from "../../db.server";

export type ValueLayerData = {
  costConfig: ShopCostConfigView;
  customers: CustomerValueAggregates;
  channels: ChannelRoiResult;
  scope: ValueLayerScopeInfo;
};

export type ValueLayerScope = {
  countryCode?: string | null;
};

export type ValueLayerScopeInfo = {
  countryCode: string | null;
  label: string;
  summary: string;
  notes: string[];
};

const COUNTRY_DISPLAY_NAMES = new Intl.DisplayNames(["zh-CN"], { type: "region" });

function normalizeCountryCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function countryLabel(countryCode: string): string {
  return `${COUNTRY_DISPLAY_NAMES.of(countryCode) ?? countryCode} (${countryCode})`;
}

function describeScope(countryCode: string | null): ValueLayerScopeInfo {
  if (!countryCode) {
    return {
      countryCode: null,
      label: "全店",
      summary: "当前价值层按全店近 30 天视角展示。",
      notes: [
        "渠道 ROI、折扣和退款仅统计全店近 30 天订单。",
        "客户分层、标签和动态 LTV 来自全店客户价值模型。",
        "成本配置仍为全店统一配置。",
      ],
    };
  }

  const label = countryLabel(countryCode);
  return {
    countryCode,
    label,
    summary: `当前价值层按 ${label} 视角展示。`,
    notes: [
      `渠道 ROI、折扣和退款仅统计 ${label} 近 30 天订单。`,
      `客户数来自近 30 天在 ${label} 下单的客户池；客户分层、标签和动态 LTV 仍沿用全店客户价值模型。`,
      "成本配置仍为全店统一配置。",
    ],
  };
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function loadScopedCustomerAggregates(
  shop: string,
  countryCode: string,
): Promise<CustomerValueAggregates> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [orders, customerValueMap] = await Promise.all([
    prisma.shopOrder.findMany({
      where: {
        shop,
        createdAt: { gte: since },
        status: { not: "cancelled" },
        shopifyCustomerId: { not: null },
        OR: [{ shippingCountryCode: countryCode }, { billingCountryCode: countryCode }],
      },
      select: {
        shopifyCustomerId: true,
      },
    }),
    loadCustomerValueMap(shop),
  ]);

  const distinctCustomerIds = Array.from(
    new Set(orders.map((order) => order.shopifyCustomerId).filter((value): value is string => Boolean(value))),
  );
  const rows = distinctCustomerIds
    .map((customerId) => customerValueMap.get(customerId))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const aggregates: CustomerValueAggregates = {
    totalCustomers: distinctCustomerIds.length,
    payingCustomers: rows.length,
    segmentCounts: { new: 0, active: 0, vip: 0, at_risk: 0, churned: 0 },
    tagCounts: { refund_risk: 0, discount_sensitive: 0 },
    averageScore: 0,
    medianScore: 0,
    repeatPurchaseRate: 0,
    highValueShare: 0,
    averageDynamicLtv: 0,
    updatedAt: new Date().toISOString(),
  };
  if (rows.length === 0) return aggregates;

  let scoreSum = 0;
  let highValueCount = 0;
  let repeatCount = 0;
  for (const row of rows) {
    aggregates.segmentCounts[row.segment] += 1;
    for (const tag of row.tags) {
      aggregates.tagCounts[tag] += 1;
    }
    scoreSum += row.score;
    if (row.score >= 70) highValueCount += 1;
    if (row.segment === "active" || row.segment === "vip") repeatCount += 1;
  }
  const scores = rows.map((row) => row.score).sort((left, right) => left - right);
  aggregates.averageScore = round(scoreSum / rows.length, 1);
  aggregates.medianScore = round(scores[Math.floor(scores.length / 2)] ?? 0, 1);
  aggregates.repeatPurchaseRate = round((repeatCount / rows.length) * 100, 1);
  aggregates.highValueShare = round((highValueCount / rows.length) * 100, 1);

  const customerValueRows = await prisma.shopCustomerValue.findMany({
    where: {
      shop,
      shopifyCustomerId: { in: distinctCustomerIds },
    },
    select: {
      dynamicLtv: true,
    },
  });
  if (customerValueRows.length > 0) {
    const totalDynamicLtv = customerValueRows.reduce((sum, row) => sum + row.dynamicLtv, 0);
    aggregates.averageDynamicLtv = round(totalDynamicLtv / customerValueRows.length, 0);
  }
  return aggregates;
}

/**
 * 诊断页价值层：成本口径 → SKU 成本 / 客户价值 → 渠道 ROI。
 *
 * 冷路径会回补 Shopify SKU 成本并重建客户价值表，耗时可达数秒，
 * 因此不要放进页面 loader，走 `/api/today-value-layer` 在首屏之后拉。
 *
 * 依赖顺序不可乱：`computeChannelRoi` 同时读 `loadSkuCostMap` 与
 * `loadCustomerValueMap`，必须等前两步落库后才算。
 */
export async function loadValueLayer(
  admin: ShopifyAdminGraphqlClient,
  shop: string,
  scope: ValueLayerScope = {},
): Promise<ValueLayerData> {
  const costConfig = await getShopCostConfig(shop);
  const countryCode = normalizeCountryCode(scope.countryCode);
  const scopeInfo = describeScope(countryCode);
  const [, customers] = await Promise.all([
    ensureSkuCostsFresh(admin, shop),
    ensureCustomerValueLayer(shop, costConfig.defaultGrossMarginPercent),
  ]);
  const [customerAggregates, channels] = await Promise.all([
    countryCode ? loadScopedCustomerAggregates(shop, countryCode) : getCustomerValueAggregates(shop),
    computeChannelRoi(shop, costConfig, new Date(), { countryCode }),
  ]);
  return {
    costConfig,
    customers: countryCode ? customerAggregates : customers,
    channels,
    scope: scopeInfo,
  };
}
