import prisma from "../../../db.server";

/**
 * 店铺成本口径配置：默认毛利率 / 支付费率 / 月度固定投入。
 * 未配置时返回默认值（口径会在页面与 ROI 输出中明确标注为估算）。
 */

export type ShopCostConfigView = {
  defaultGrossMarginPercent: number;
  paymentFeePercent: number;
  paymentFeeFixed: number;
  monthlyFixedCost: number;
  /** 是否商家显式配置过（false = 全默认估算口径） */
  isConfigured: boolean;
};

export const DEFAULT_COST_CONFIG: ShopCostConfigView = {
  defaultGrossMarginPercent: 60,
  paymentFeePercent: 2.9,
  paymentFeeFixed: 0.3,
  monthlyFixedCost: 0,
  isConfigured: false,
};

function shouldFallbackToDefaultCostConfig(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = "code" in error ? String(error.code ?? "") : "";
  const maybeMessage = "message" in error ? String(error.message ?? "") : "";
  const haystack = `${maybeCode} ${maybeMessage}`.toLowerCase();

  return (
    haystack.includes("p2021") ||
    haystack.includes("p2022") ||
    haystack.includes("shopcostconfig") ||
    haystack.includes("table") && haystack.includes("does not exist") ||
    haystack.includes("column") && haystack.includes("does not exist")
  );
}

export async function getShopCostConfig(shop: string): Promise<ShopCostConfigView> {
  let row;
  try {
    row = await prisma.shopCostConfig.findUnique({ where: { shop } });
  } catch (error) {
    if (!shouldFallbackToDefaultCostConfig(error)) {
      throw error;
    }
    console.warn("[costConfig] falling back to default config:", error);
    return DEFAULT_COST_CONFIG;
  }
  if (!row) return DEFAULT_COST_CONFIG;
  return {
    defaultGrossMarginPercent: row.defaultGrossMarginPercent,
    paymentFeePercent: row.paymentFeePercent,
    paymentFeeFixed: row.paymentFeeFixed,
    monthlyFixedCost: row.monthlyFixedCost,
    isConfigured: true,
  };
}

export type CostConfigUpdate = {
  defaultGrossMarginPercent: number;
  paymentFeePercent: number;
  paymentFeeFixed: number;
  monthlyFixedCost: number;
};

function sanitize(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export async function upsertShopCostConfig(
  shop: string,
  update: CostConfigUpdate,
): Promise<ShopCostConfigView> {
  const data = {
    defaultGrossMarginPercent: sanitize(update.defaultGrossMarginPercent, 0, 100, 60),
    paymentFeePercent: sanitize(update.paymentFeePercent, 0, 20, 2.9),
    paymentFeeFixed: sanitize(update.paymentFeeFixed, 0, 100, 0.3),
    monthlyFixedCost: sanitize(update.monthlyFixedCost, 0, 10_000_000, 0),
  };
  const row = await prisma.shopCostConfig.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  return {
    defaultGrossMarginPercent: row.defaultGrossMarginPercent,
    paymentFeePercent: row.paymentFeePercent,
    paymentFeeFixed: row.paymentFeeFixed,
    monthlyFixedCost: row.monthlyFixedCost,
    isConfigured: true,
  };
}
