import prisma from "../../db.server";
import {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "./tokenBillingDefaults.server";
import type { TokenBillingFeature } from "./tokenBillingTypes.server";
import { normalizeBillingModelKey } from "./tokenBillingTypes.server";

export type TokenBillingRuleRecord = {
  ruleKey: string;
  feature: TokenBillingFeature;
  modelKey: string;
  displayName: string;
  multiplier: number;
  baseTokenCost: number | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  rules: TokenBillingRuleRecord[];
  expiresAt: number;
};

let cache: CacheEntry | null = null;

function rowToRecord(row: {
  ruleKey: string;
  feature: string;
  modelKey: string;
  displayName: string;
  multiplier: number;
  baseTokenCost: number | null;
}): TokenBillingRuleRecord | null {
  const feature = row.feature as TokenBillingFeature;
  if (
    feature !== "product_copy" &&
    feature !== "image_prompt" &&
    feature !== "image_generate" &&
    feature !== "picture_translate"
  ) {
    return null;
  }
  const multiplier = Number(row.multiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    return null;
  }
  return {
    ruleKey: row.ruleKey,
    feature,
    modelKey: row.modelKey,
    displayName: row.displayName,
    multiplier,
    baseTokenCost: row.baseTokenCost,
  };
}

export function invalidateTokenBillingRuleCache(): void {
  cache = null;
}

async function loadEnabledRules(): Promise<TokenBillingRuleRecord[]> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.rules;
  }

  const rows = await prisma.tokenBillingRule.findMany({
    where: { enabled: true },
    orderBy: [{ feature: "asc" }, { modelKey: "asc" }],
  });

  const rules = rows
    .map(rowToRecord)
    .filter((r): r is TokenBillingRuleRecord => r != null);

  cache = { rules, expiresAt: Date.now() + CACHE_TTL_MS };
  return rules;
}

function pickRule(
  rules: TokenBillingRuleRecord[],
  feature: TokenBillingFeature,
  modelKey: string,
): TokenBillingRuleRecord | null {
  const normalizedModel = normalizeBillingModelKey(modelKey);
  for (const key of [normalizedModel, "_default"]) {
    const found = rules.find((r) => r.feature === feature && r.modelKey === key);
    if (found) return found;
  }
  return null;
}

export type ResolvedTokenBillingRule = {
  rule: TokenBillingRuleRecord | null;
  multiplier: number;
  baseTokenCost: number | null;
};

function envBaseTokenCost(feature: TokenBillingFeature): number | null {
  if (feature === "picture_translate") {
    return DEFAULT_PICTURE_TRANSLATE_TOKEN_COST;
  }
  if (feature === "image_generate") {
    return DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST;
  }
  return null;
}

export async function resolveTokenBillingRule(params: {
  feature: TokenBillingFeature;
  modelKey: string;
}): Promise<ResolvedTokenBillingRule> {
  const rules = await loadEnabledRules();
  const rule = pickRule(rules, params.feature, params.modelKey);
  const multiplier = rule?.multiplier ?? 1;
  const baseTokenCost = rule?.baseTokenCost ?? envBaseTokenCost(params.feature);

  return { rule, multiplier, baseTokenCost };
}

/** 运维排查：列出已启用的计费规则。 */
export async function listTokenBillingRules(): Promise<TokenBillingRuleRecord[]> {
  return loadEnabledRules();
}
