/** 定价工作台 v2 — 纯函数计算引擎 */

export type FeatureScenario = {
  id: string;
  name: string;
  feature: string;
  modelKey: string;
  callsPerUserPerMonth: number;
  /** LLM：每次 input token */
  inputTokensPerCall: number;
  /** LLM：每次 output token */
  outputTokensPerCall: number;
  /** USD / 1M input tokens */
  priceInputPer1M: number;
  /** USD / 1M output tokens */
  priceOutputPer1M: number;
  /** 非 token 计量 API 的每次固定美元成本 */
  flatCostPerCallUsd: number;
  multiplier: number;
  baseTokenCost: number;
  enabled: boolean;
};

export type GlobalAssumptions = {
  payingShops: number;
  targetGrossMarginPct: number;
  shopifyRevSharePct: number;
  paymentFeePct: number;
  planPriceUsd: number;
  tokenGrantPerUser: number;
};

export type FeatureCalcRow = FeatureScenario & {
  rawTokensPerCall: number;
  costPerCallUsd: number;
  billedTokensPerCall: number;
  monthlyCostPerUserUsd: number;
  monthlyBilledTokensPerUser: number;
  suggestedMultiplier: number;
  suggestedBaseTokenCost: number;
};

export type PricingTotals = {
  variableCostPerUser: number;
  billedTokensPerUser: number;
  effectiveCostPerBilledToken: number;
  fixedCostMonthly: number;
  fixedPerUser: number;
};

export type PlanMarginRow = {
  planKey: string;
  displayName: string;
  kind: string;
  billingInterval: string | null;
  priceUsd: number;
  tokens: number;
  tokensPerDollar: number;
  netRevenueUsd: number;
  impliedMarginPct: number;
  suggestedTokens: number;
  tokenDeltaPct: number;
};

export type ReversePricing = {
  netRevenueUsd: number;
  suggestedPriceListUsd: number;
  suggestedGrantForPrice: number;
  currentMarginPct: number;
  maxTokenFaceValue: number;
  currentTokenFaceValue: number;
};

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function positive(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

export function netRevenueFromListPrice(
  listPriceUsd: number,
  shopifyRevSharePct: number,
  paymentFeePct: number,
): number {
  const fee = clamp(shopifyRevSharePct + paymentFeePct, 0, 99) / 100;
  return positive(listPriceUsd) * (1 - fee);
}

export function listPriceFromNetRevenue(
  netRevenueUsd: number,
  shopifyRevSharePct: number,
  paymentFeePct: number,
): number {
  const fee = clamp(shopifyRevSharePct + paymentFeePct, 0, 99) / 100;
  const factor = 1 - fee;
  return factor > 0 ? positive(netRevenueUsd) / factor : Number.POSITIVE_INFINITY;
}

/** 与主 App `applyTokenBillingMultiplier` 对齐 */
export function billedTokensForCall(
  inputTokens: number,
  outputTokens: number,
  multiplier: number,
  baseTokenCost: number,
): number {
  const rawTotal = positive(inputTokens) + positive(outputTokens);
  const m = positive(multiplier);
  if (rawTotal > 0) {
    return Math.max(0, Math.ceil(rawTotal * m));
  }
  const base = positive(baseTokenCost);
  if (base > 0) {
    return Math.max(0, Math.ceil(base * m));
  }
  return 0;
}

export function costPerCallUsd(row: FeatureScenario): number {
  const input = positive(row.inputTokensPerCall);
  const output = positive(row.outputTokensPerCall);
  const tokenCost =
    (input / 1_000_000) * positive(row.priceInputPer1M) +
    (output / 1_000_000) * positive(row.priceOutputPer1M);
  return tokenCost + positive(row.flatCostPerCallUsd);
}

export function calcFeatureRows(
  scenarios: FeatureScenario[],
  tokenDollarValue: number,
): FeatureCalcRow[] {
  const baselineRawCost = scenarios
    .filter((s) => s.enabled)
    .map((s) => {
      const raw = positive(s.inputTokensPerCall) + positive(s.outputTokensPerCall);
      if (raw <= 0) return null;
      return costPerCallUsd(s) / raw;
    })
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b)[0];

  return scenarios.map((row) => {
    const rawTokens =
      positive(row.inputTokensPerCall) + positive(row.outputTokensPerCall);
    const cost = costPerCallUsd(row);
    const billed = billedTokensForCall(
      row.inputTokensPerCall,
      row.outputTokensPerCall,
      row.multiplier,
      row.baseTokenCost,
    );
    const calls = row.enabled ? positive(row.callsPerUserPerMonth) : 0;

    let suggestedMultiplier = row.multiplier;
    if (baselineRawCost && rawTokens > 0) {
      const rawCostPerToken = cost / rawTokens;
      suggestedMultiplier = clamp(rawCostPerToken / baselineRawCost, 0.1, 20);
    }

    const suggestedBase =
      tokenDollarValue > 0 && row.flatCostPerCallUsd > 0
        ? Math.ceil(
            row.flatCostPerCallUsd /
              tokenDollarValue /
              Math.max(positive(row.multiplier), 0.01),
          )
        : row.baseTokenCost;

    return {
      ...row,
      rawTokensPerCall: rawTokens,
      costPerCallUsd: cost,
      billedTokensPerCall: billed,
      monthlyCostPerUserUsd: calls * cost,
      monthlyBilledTokensPerUser: calls * billed,
      suggestedMultiplier: Number(suggestedMultiplier.toFixed(2)),
      suggestedBaseTokenCost: suggestedBase,
    };
  });
}

export function calcTotals(
  rows: FeatureCalcRow[],
  fixedCostMonthly: number,
  payingShops: number,
): PricingTotals {
  const enabled = rows.filter((r) => r.enabled);
  const variableCostPerUser = enabled.reduce(
    (s, r) => s + r.monthlyCostPerUserUsd,
    0,
  );
  const billedTokensPerUser = enabled.reduce(
    (s, r) => s + r.monthlyBilledTokensPerUser,
    0,
  );
  const effectiveCostPerBilledToken =
    billedTokensPerUser > 0 ? variableCostPerUser / billedTokensPerUser : 0;
  const shops = Math.max(1, positive(payingShops));
  const fixedPerUser = positive(fixedCostMonthly) / shops;

  return {
    variableCostPerUser,
    billedTokensPerUser,
    effectiveCostPerBilledToken,
    fixedCostMonthly: positive(fixedCostMonthly),
    fixedPerUser,
  };
}

export function calcReversePricing(
  assumptions: GlobalAssumptions,
  totals: PricingTotals,
): ReversePricing {
  const margin = clamp(assumptions.targetGrossMarginPct, 0, 99.9) / 100;
  const cpb = totals.effectiveCostPerBilledToken;
  const grant = positive(assumptions.tokenGrantPerUser);
  const listPrice = positive(assumptions.planPriceUsd);

  const netRev = netRevenueFromListPrice(
    listPrice,
    assumptions.shopifyRevSharePct,
    assumptions.paymentFeePct,
  );

  const costAtGrant = totals.fixedPerUser + grant * cpb;
  const netNeededForGrant =
    margin < 1 ? costAtGrant / (1 - margin) : Number.POSITIVE_INFINITY;
  const suggestedPriceListUsd = listPriceFromNetRevenue(
    netNeededForGrant,
    assumptions.shopifyRevSharePct,
    assumptions.paymentFeePct,
  );

  const suggestedGrantForPrice =
    cpb > 0
      ? Math.max(0, Math.floor((netRev * (1 - margin) - totals.fixedPerUser) / cpb))
      : 0;

  const currentMarginPct =
    netRev > 0 ? (1 - costAtGrant / netRev) * 100 : 0;

  const maxTokenFaceValue =
    cpb > 0 && netRev > 0
      ? Math.floor((netRev * (1 - margin) - totals.fixedPerUser) / cpb) / listPrice
      : 0;

  const currentTokenFaceValue = listPrice > 0 ? grant / listPrice : 0;

  return {
    netRevenueUsd: netRev,
    suggestedPriceListUsd,
    suggestedGrantForPrice,
    currentMarginPct,
    maxTokenFaceValue,
    currentTokenFaceValue,
  };
}

export type PlanCatalogRow = {
  planKey: string;
  displayName: string;
  kind: string;
  billingInterval: string | null;
  priceAmount: string;
  tokens: number;
};

export function calcPlanMargins(
  plans: PlanCatalogRow[],
  assumptions: GlobalAssumptions,
  totals: PricingTotals,
): PlanMarginRow[] {
  const margin = clamp(assumptions.targetGrossMarginPct, 0, 99.9) / 100;
  const cpb = totals.effectiveCostPerBilledToken;

  return plans
    .filter((p) => p.kind === "SUBSCRIPTION" || p.kind === "ONE_TIME_PACK")
    .map((plan) => {
      const priceUsd = positive(Number(plan.priceAmount));
      const tokens = positive(plan.tokens);
      const netRev = netRevenueFromListPrice(
        priceUsd,
        assumptions.shopifyRevSharePct,
        assumptions.paymentFeePct,
      );
      const costAtGrant = totals.fixedPerUser + tokens * cpb;
      const impliedMarginPct = netRev > 0 ? (1 - costAtGrant / netRev) * 100 : 0;
      const suggestedTokens =
        cpb > 0
          ? Math.max(0, Math.floor((netRev * (1 - margin) - totals.fixedPerUser) / cpb))
          : 0;
      const tokenDeltaPct =
        tokens > 0 ? ((suggestedTokens - tokens) / tokens) * 100 : 0;

      return {
        planKey: plan.planKey,
        displayName: plan.displayName,
        kind: plan.kind,
        billingInterval: plan.billingInterval,
        priceUsd,
        tokens,
        tokensPerDollar: priceUsd > 0 ? tokens / priceUsd : 0,
        netRevenueUsd: netRev,
        impliedMarginPct,
        suggestedTokens,
        tokenDeltaPct,
      };
    });
}

export const DEFAULT_SCENARIOS: FeatureScenario[] = [
  {
    id: "product_copy",
    name: "商品文案",
    feature: "product_copy",
    modelKey: "deepseek-chat",
    callsPerUserPerMonth: 180,
    inputTokensPerCall: 900,
    outputTokensPerCall: 500,
    priceInputPer1M: 0.14,
    priceOutputPer1M: 0.28,
    flatCostPerCallUsd: 0,
    multiplier: 1,
    baseTokenCost: 0,
    enabled: true,
  },
  {
    id: "image_prompt",
    name: "画面扩写",
    feature: "image_prompt",
    modelKey: "deepseek-chat",
    callsPerUserPerMonth: 60,
    inputTokensPerCall: 600,
    outputTokensPerCall: 300,
    priceInputPer1M: 0.14,
    priceOutputPer1M: 0.28,
    flatCostPerCallUsd: 0,
    multiplier: 1,
    baseTokenCost: 0,
    enabled: true,
  },
  {
    id: "image_generate",
    name: "文生图",
    feature: "image_generate",
    modelKey: "gpt-image-2",
    callsPerUserPerMonth: 20,
    inputTokensPerCall: 0,
    outputTokensPerCall: 0,
    priceInputPer1M: 0,
    priceOutputPer1M: 0,
    flatCostPerCallUsd: 0.035,
    multiplier: 1,
    baseTokenCost: 5000,
    enabled: true,
  },
  {
    id: "picture_translate",
    name: "整图翻译",
    feature: "picture_translate",
    modelKey: "volc-translate",
    callsPerUserPerMonth: 30,
    inputTokensPerCall: 0,
    outputTokensPerCall: 0,
    priceInputPer1M: 0,
    priceOutputPer1M: 0,
    flatCostPerCallUsd: 0.01,
    multiplier: 1,
    baseTokenCost: 2000,
    enabled: true,
  },
];
