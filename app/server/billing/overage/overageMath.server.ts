/** 超额计费纯函数：单价、封顶余额、批量阈值。 */

export const OVERAGE_FLUSH_TOKEN_THRESHOLD = 100_000;
export const OVERAGE_FLUSH_AMOUNT_THRESHOLD = 1;

export function parseMoney(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(amount: number, digits = 4): string {
  return amount.toFixed(digits);
}

/** USD amount for `tokens` at `pricePerThousand` (USD / 1,000 tokens). */
export function tokensToOverageAmount(
  tokens: number,
  pricePerThousand: string | null | undefined,
): number {
  const price = parseMoney(pricePerThousand);
  if (tokens <= 0 || price <= 0) return 0;
  return (tokens / 1000) * price;
}

export function overageAmountToTokens(
  amountUsd: number,
  pricePerThousand: string | null | undefined,
): number {
  const price = parseMoney(pricePerThousand);
  if (amountUsd <= 0 || price <= 0) return 0;
  return Math.floor((amountUsd / price) * 1000);
}

export function remainingCapAmount(params: {
  cappedAmount: string | null | undefined;
  usageBalanceUsed: string | null | undefined;
}): number {
  const cap = parseMoney(params.cappedAmount);
  const used = parseMoney(params.usageBalanceUsed);
  return Math.max(0, cap - used);
}

/**
 * 门禁/展示用的生效上限：本地 overageSpendLimit（若有）与 Shopify cappedAmount 取较小值。
 * spendLimit 为空时等同 Shopify 授权封顶。
 */
export function effectiveOverageCapAmount(params: {
  cappedAmount: string | null | undefined;
  overageSpendLimit?: string | null | undefined;
}): string {
  const shopifyCap = parseMoney(params.cappedAmount);
  const hasLocal =
    params.overageSpendLimit != null && String(params.overageSpendLimit).trim() !== "";
  const localCap = hasLocal ? parseMoney(params.overageSpendLimit) : shopifyCap;
  if (shopifyCap <= 0) {
    return formatMoney(Math.max(0, localCap), 2);
  }
  return formatMoney(Math.min(Math.max(0, localCap), shopifyCap), 2);
}

export function shouldFlushOverage(params: {
  pendingTokens: number;
  pricePerThousand: string | null | undefined;
}): boolean {
  if (params.pendingTokens <= 0) return false;
  if (params.pendingTokens >= OVERAGE_FLUSH_TOKEN_THRESHOLD) return true;
  const amount = tokensToOverageAmount(
    params.pendingTokens,
    params.pricePerThousand,
  );
  return amount >= OVERAGE_FLUSH_AMOUNT_THRESHOLD;
}

export function isCapApproaching(params: {
  cappedAmount: string | null | undefined;
  usageBalanceUsed: string | null | undefined;
  thresholdRatio?: number;
}): boolean {
  const cap = parseMoney(params.cappedAmount);
  if (cap <= 0) return false;
  const used = parseMoney(params.usageBalanceUsed);
  const ratio = params.thresholdRatio ?? 0.9;
  return used / cap >= ratio;
}
