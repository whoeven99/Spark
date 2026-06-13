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
  targetGrossMarginPct: number;
  shopifyRevSharePct: number;
};

export type ProbePricingInput = GlobalAssumptions & {
  probePriceUsd: number;
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
  suggestedTokens: number;
  netRevenueUsd: number;
  effectiveCostPerBilledToken: number;
};

/** 参考 Token 面值（$/token 反算），用于能力模型 base 建议，与探针价解耦 */
export const REFERENCE_TOKEN_FACE_VALUE = 500_000 / 29.99;

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
): number {
  const fee = clamp(shopifyRevSharePct, 0, 99) / 100;
  return positive(listPriceUsd) * (1 - fee);
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
): PricingTotals {
  const enabled = rows.filter((r) => r.enabled && r.billedTokensPerCall > 0);
  const effectiveCostPerBilledToken =
    enabled.length > 0
      ? enabled.reduce((s, r) => s + r.costPerCallUsd / r.billedTokensPerCall, 0) /
        enabled.length
      : 0;

  return {
    variableCostPerUser: 0,
    billedTokensPerUser: 0,
    effectiveCostPerBilledToken,
    fixedCostMonthly: positive(fixedCostMonthly),
    fixedPerUser: 0,
  };
}

/** 给定标价（如 $10），在目标毛利率下建议发放多少计费 Token（仅变量成本） */
export function calcSuggestedTokensForPrice(
  listPriceUsd: number,
  targetGrossMarginPct: number,
  shopifyRevSharePct: number,
  effectiveCostPerBilledToken: number,
): number {
  const margin = clamp(targetGrossMarginPct, 0, 99.9) / 100;
  const cpb = positive(effectiveCostPerBilledToken);
  if (cpb <= 0) return 0;
  const netRev = netRevenueFromListPrice(listPriceUsd, shopifyRevSharePct);
  return Math.max(0, Math.floor((netRev * (1 - margin)) / cpb));
}

export function calcProbePricing(
  input: ProbePricingInput,
  totals: PricingTotals,
): ReversePricing {
  const cpb = totals.effectiveCostPerBilledToken;
  const netRev = netRevenueFromListPrice(input.probePriceUsd, input.shopifyRevSharePct);
  const suggestedTokens = calcSuggestedTokensForPrice(
    input.probePriceUsd,
    input.targetGrossMarginPct,
    input.shopifyRevSharePct,
    cpb,
  );

  return {
    suggestedTokens,
    netRevenueUsd: netRev,
    effectiveCostPerBilledToken: cpb,
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
  const cpb = totals.effectiveCostPerBilledToken;

  return plans
    .filter((p) => p.kind === "SUBSCRIPTION" || p.kind === "ONE_TIME_PACK")
    .map((plan) => {
      const priceUsd = positive(Number(plan.priceAmount));
      const tokens = positive(plan.tokens);
      const netRev = netRevenueFromListPrice(priceUsd, assumptions.shopifyRevSharePct);
      const costAtGrant = tokens * cpb;
      const impliedMarginPct = netRev > 0 ? (1 - costAtGrant / netRev) * 100 : 0;
      const suggestedTokens = calcSuggestedTokensForPrice(
        priceUsd,
        assumptions.targetGrossMarginPct,
        assumptions.shopifyRevSharePct,
        cpb,
      );
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

/* ────────────────────────────────────────────────────────────
 * 毛利热力 & 阶梯调价
 * 统一口径：把"模型成本"和"套餐售价"都折算到 $ / 100 万 credits，
 * 在同一标尺上比较，避免每 token 的小数。
 * ──────────────────────────────────────────────────────────── */

const PER_MILLION = 1_000_000;

/** 某能力真实成本，折算成 $ / 100 万计费 credits（= 每次成本 ÷ 每次扣费 × 1M）。 */
export function costPerMillionCredits(row: FeatureCalcRow): number {
  if (row.billedTokensPerCall <= 0) return 0;
  return (row.costPerCallUsd / row.billedTokensPerCall) * PER_MILLION;
}

  planKey: string;
  displayName: string;
  kind: string;
  billingInterval: string | null;
  priceUsd: number;
  credits: number;
  /** 标价折算的 $ / 100 万 credits */
  salePerMCredits: number;
  /** 过 Shopify 抽成后的净收 $ / 100 万 credits */
  netPerMCredits: number;
  /** 目标毛利下，每 100 万 credits 允许的最高模型成本 */
  costCeilingPerMCredits: number;
};

export function planCreditEconomics(
  plan: PlanCatalogRow,
  assumptions: GlobalAssumptions,
): PlanCreditEconomics {
  const priceUsd = positive(Number(plan.priceAmount));
  const credits = positive(plan.tokens);
  const salePerMCredits = credits > 0 ? (priceUsd / credits) * PER_MILLION : 0;
  const netPerMCredits = netRevenueFromListPrice(
    salePerMCredits,
    assumptions.shopifyRevSharePct,
  );
  const margin = clamp(assumptions.targetGrossMarginPct, 0, 99.9) / 100;
  return {
    planKey: plan.planKey,
    displayName: plan.displayName,
    kind: plan.kind,
    billingInterval: plan.billingInterval,
    priceUsd,
    credits,
    salePerMCredits,
    netPerMCredits,
    costCeilingPerMCredits: netPerMCredits * (1 - margin),
  };
}

export type FeatureCreditCost = {
  id: string;
  name: string;
  feature: string;
  modelKey: string;
  costPerCallUsd: number;
  billedTokensPerCall: number;
  costPerMCredits: number;
};

export function featureCreditCosts(rows: FeatureCalcRow[]): FeatureCreditCost[] {
  return rows
    .filter((r) => r.enabled && r.billedTokensPerCall > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      feature: r.feature,
      modelKey: r.modelKey,
      costPerCallUsd: r.costPerCallUsd,
      billedTokensPerCall: r.billedTokensPerCall,
      costPerMCredits: costPerMillionCredits(r),
    }));
}

/** 按各能力月调用量加权的混合成本 $ / 100 万 credits（与套餐无关）。 */
export function blendedCostPerMillionCredits(rows: FeatureCalcRow[]): number {
  let billed = 0;
  let costUsd = 0;
  for (const r of rows) {
    if (!r.enabled || r.billedTokensPerCall <= 0) continue;
    const calls = positive(r.callsPerUserPerMonth);
    billed += calls * r.billedTokensPerCall;
    costUsd += calls * r.costPerCallUsd;
  }
  return billed > 0 ? (costUsd / billed) * PER_MILLION : 0;
}

/** 给定每 100 万 credits 的模型成本，算某套餐满额消耗时的毛利率(%)。 */
export function marginForPlan(
  plan: PlanCreditEconomics,
  costPerMCredits: number,
): number {
  if (plan.netPerMCredits <= 0) return 0;
  return (1 - costPerMCredits / plan.netPerMCredits) * 100;
}

export type PlanFeatureMatrix = {
  plans: PlanCreditEconomics[];
  features: FeatureCreditCost[];
  /** plans × features 毛利率(%)，cells[planKey][featureId] */
  cells: Record<string, Record<string, number>>;
  blendedCostPerMCredits: number;
  /** 按混合用量，各套餐的整体毛利率(%) */
  blendedMarginByPlan: Record<string, number>;
};

export function planFeatureMarginMatrix(
  plans: PlanCatalogRow[],
  rows: FeatureCalcRow[],
  assumptions: GlobalAssumptions,
): PlanFeatureMatrix {
  const econ = plans
    .filter((p) => p.kind === "SUBSCRIPTION" || p.kind === "ONE_TIME_PACK")
    .map((p) => planCreditEconomics(p, assumptions));
  const features = featureCreditCosts(rows);
  const blended = blendedCostPerMillionCredits(rows);

  const cells: Record<string, Record<string, number>> = {};
  const blendedMarginByPlan: Record<string, number> = {};
  for (const plan of econ) {
    cells[plan.planKey] = {};
    for (const f of features) {
      cells[plan.planKey][f.id] = marginForPlan(plan, f.costPerMCredits);
    }
    blendedMarginByPlan[plan.planKey] = marginForPlan(plan, blended);
  }

  return {
    plans: econ,
    features,
    cells,
    blendedCostPerMCredits: blended,
    blendedMarginByPlan,
  };
}

export type VolumeLadderRow = {
  planKey: string;
  displayName: string;
  kind: string;
  credits: number;
  currentPriceUsd: number;
  currentSalePerMCredits: number;
  suggestedSalePerMCredits: number;
  suggestedPriceUsd: number;
  suggestedMarginPct: number;
  /** 相对同类最小套餐，每 credit 便宜多少(%)，越大越划算 */
  discountVsSmallestPct: number;
};

/**
 * 阶梯调价建议：在「承保成本/1M credits」下，
 * 最大套餐定到刚好达标的地板价，越小的套餐溢价越高 →
 * 既保证每档 ≥ 目标毛利，又让越贵(越大)的套餐每 credit 越便宜。
 */
export function suggestVolumeLadder(
  plans: PlanCatalogRow[],
  underwriteCostPerMCredits: number,
  assumptions: GlobalAssumptions,
  maxPremiumPct: number,
): VolumeLadderRow[] {
  const margin = clamp(assumptions.targetGrossMarginPct, 0, 99.9) / 100;
  const revShare = clamp(assumptions.shopifyRevSharePct, 0, 99) / 100;
  const cost = positive(underwriteCostPerMCredits);
  // 地板价：净收 × (1-margin) = cost → sale = cost / ((1-revShare)(1-margin))
  const denom = (1 - revShare) * (1 - margin);
  const floorSalePerM = denom > 0 ? cost / denom : 0;
  const premium = positive(maxPremiumPct) / 100;

  const out: VolumeLadderRow[] = [];
  for (const kind of ["SUBSCRIPTION", "ONE_TIME_PACK"]) {
    const group = plans
      .filter((p) => p.kind === kind)
      .map((p) => planCreditEconomics(p, assumptions))
      .sort((a, b) => a.credits - b.credits);
    if (group.length === 0) continue;
    const n = group.length;
    const smallestSale = floorSalePerM * (1 + premium);

    group.forEach((plan, i) => {
      // rank 0(最小)→溢价最高；rank n-1(最大)→地板价
      const t = n > 1 ? i / (n - 1) : 1;
      const factor = 1 + premium * (1 - t);
      const suggestedSalePerM = floorSalePerM * factor;
      const suggestedPriceUsd = (suggestedSalePerM * plan.credits) / PER_MILLION;
      const suggestedMarginPct =
        suggestedSalePerM > 0
          ? (1 - cost / (suggestedSalePerM * (1 - revShare))) * 100
          : 0;
      out.push({
        planKey: plan.planKey,
        displayName: plan.displayName,
        kind: plan.kind,
        credits: plan.credits,
        currentPriceUsd: plan.priceUsd,
        currentSalePerMCredits: plan.salePerMCredits,
        suggestedSalePerMCredits: suggestedSalePerM,
        suggestedPriceUsd,
        suggestedMarginPct,
        discountVsSmallestPct:
          smallestSale > 0
            ? ((smallestSale - suggestedSalePerM) / smallestSale) * 100
            : 0,
      });
    });
  }
  return out;
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
