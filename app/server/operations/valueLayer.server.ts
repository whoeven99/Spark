import type { ShopifyAdminGraphqlClient } from "../ai/skills/shopifyInfo/shopifyInfo.tool";
import {
  getShopCostConfig,
  type ShopCostConfigView,
} from "./roi/costConfig.server";
import { ensureSkuCostsFresh } from "./roi/skuCostSync.server";
import {
  ensureCustomerValueLayer,
  type CustomerValueAggregates,
} from "./customerValue.server";
import { computeChannelRoi, type ChannelRoiResult } from "./channelRoi.server";

export type ValueLayerData = {
  costConfig: ShopCostConfigView;
  customers: CustomerValueAggregates;
  channels: ChannelRoiResult;
};

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
): Promise<ValueLayerData> {
  const costConfig = await getShopCostConfig(shop);
  const [, customers] = await Promise.all([
    ensureSkuCostsFresh(admin, shop),
    ensureCustomerValueLayer(shop, costConfig.defaultGrossMarginPercent),
  ]);
  const channels = await computeChannelRoi(shop, costConfig);
  return { costConfig, customers, channels };
}
