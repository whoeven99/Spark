/**
 * ROI 归一核算核心（docs/DAILY_OPERATIONS_WORKFLOWS.md §8）。
 *
 * 所有经营场景最终都映射到同一条总账：
 *   Business ROI = (Contribution Profit - Investment Cost) / Investment Cost
 *
 * 本模块只做纯计算与规则映射（等级 / 置信度），不读库。
 * 规则以可配置常量表组织（§8.14），后续可平移到数据库规则表。
 */

export type RoiGrade = "S" | "A" | "B" | "C" | "D";
export type RoiConfidence = "high" | "medium" | "low";

// ──────────────────────────────────────────────
// §8.14.1 ROI 等级规则表（全局统一，场景不得推翻）
// ──────────────────────────────────────────────

export type RoiGradeRule = {
  ruleKey: string;
  minValue: number | null;
  maxValue: number | null;
  grade: RoiGrade;
  meaning: string;
  suggestedAction: string;
};

export const ROI_GRADE_RULES: readonly RoiGradeRule[] = [
  { ruleKey: "roi_grade_s", minValue: 0.5, maxValue: null, grade: "S", meaning: "强赚钱，经营效率优秀", suggestedAction: "扩大投入，复制打法" },
  { ruleKey: "roi_grade_a", minValue: 0.2, maxValue: 0.5, grade: "A", meaning: "达标，具备稳定盈利能力", suggestedAction: "持续优化，稳步加码" },
  { ruleKey: "roi_grade_b", minValue: 0, maxValue: 0.2, grade: "B", meaning: "勉强达标，微赚", suggestedAction: "优化成本与转化，不宜盲目放量" },
  { ruleKey: "roi_grade_c", minValue: -0.2, maxValue: 0, grade: "C", meaning: "未达标，轻度亏损", suggestedAction: "限制投入，优先定位原因" },
  { ruleKey: "roi_grade_d", minValue: null, maxValue: -0.2, grade: "D", meaning: "严重未达标，明显亏损", suggestedAction: "立即止损或重构方案" },
] as const;

/** Business ROI → 等级。roi 为 null（投入成本未知/为 0）时不给等级。 */
export function gradeBusinessRoi(roi: number | null): RoiGradeRule | null {
  if (roi === null || !Number.isFinite(roi)) return null;
  for (const rule of ROI_GRADE_RULES) {
    const aboveMin = rule.minValue === null || roi >= rule.minValue;
    const belowMax = rule.maxValue === null || roi < rule.maxValue;
    if (aboveMin && belowMax) return rule;
  }
  return null;
}

// ──────────────────────────────────────────────
// §8.1 贡献利润与 Business ROI
// ──────────────────────────────────────────────

export type ContributionProfitInput = {
  attributedRevenue: number;
  cogs: number;
  discountCost: number;
  shippingSubsidy: number;
  paymentFees: number;
  refundLoss: number;
};

export function computeContributionProfit(input: ContributionProfitInput): number {
  return (
    input.attributedRevenue -
    input.cogs -
    input.discountCost -
    input.shippingSubsidy -
    input.paymentFees -
    input.refundLoss
  );
}

/** §8.1 约束：Investment Cost <= 0 时 Business ROI = null（数据不足，不许硬算）。 */
export function computeBusinessRoi(
  contributionProfit: number,
  investmentCost: number,
): number | null {
  if (!Number.isFinite(investmentCost) || investmentCost <= 0) return null;
  return (contributionProfit - investmentCost) / investmentCost;
}

// ──────────────────────────────────────────────
// §8.8 / §8.15 置信度判定
// ──────────────────────────────────────────────

export type ConfidenceInput = {
  /** 收入可归因比例 0-1（§8.8 要求 >= 0.7） */
  attributionCoverage: number;
  /** 成本完整度 0-1（关键成本项覆盖比例；广告费缺失时应显著拉低） */
  costCompleteness: number;
  /** 数据新鲜度 0-1（实时计算可给 1） */
  freshness: number;
  /** 样本订单数 */
  sampleOrders: number;
  /** 样本最低要求（§8.8 默认订单 >= 10） */
  minOrders?: number;
};

export type ConfidenceResult = {
  score: number;
  confidence: RoiConfidence;
  /** 不达基础必备项时的原因（用于页面/AI 解释） */
  gaps: string[];
};

const CONFIDENCE_WEIGHTS = {
  attribution: 0.4,
  cost: 0.3,
  freshness: 0.2,
  sample: 0.1,
} as const;

export function judgeConfidence(input: ConfidenceInput): ConfidenceResult {
  const minOrders = input.minOrders ?? 10;
  const sampleScore = Math.min(1, input.sampleOrders / minOrders);
  const score =
    100 *
    (CONFIDENCE_WEIGHTS.attribution * clamp01(input.attributionCoverage) +
      CONFIDENCE_WEIGHTS.cost * clamp01(input.costCompleteness) +
      CONFIDENCE_WEIGHTS.freshness * clamp01(input.freshness) +
      CONFIDENCE_WEIGHTS.sample * sampleScore);

  const gaps: string[] = [];
  if (input.attributionCoverage < 0.7) gaps.push("收入归因覆盖率不足 70%");
  if (input.costCompleteness < 0.8) gaps.push("关键成本项不完整");
  if (input.sampleOrders < minOrders) gaps.push(`样本订单数不足（${input.sampleOrders}/${minOrders}）`);

  const confidence: RoiConfidence = score >= 85 ? "high" : score >= 60 ? "medium" : "low";
  return { score: Math.round(score), confidence, gaps };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ──────────────────────────────────────────────
// 统一输出结构（§8.2 RoiSummary 的服务端形态）
// ──────────────────────────────────────────────

export type RoiSummary = {
  attributedRevenue: number;
  contributionProfit: number;
  /** null = 投入成本未知（如广告花费未接入） */
  investmentCost: number | null;
  businessRoi: number | null;
  roiGrade: RoiGrade | null;
  confidence: RoiConfidence;
  confidenceScore: number;
  confidenceGaps: string[];
  attributionWindow: string;
};
