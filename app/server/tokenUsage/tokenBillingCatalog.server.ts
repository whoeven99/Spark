import prisma from "../../db.server";
import {
  DEFAULT_IMAGE_GENERATION_IMAGE_TOKEN_COST,
  DEFAULT_PICTURE_TRANSLATE_TOKEN_COST,
} from "./tokenBillingDefaults.server";
import type { TokenBillingFeature } from "./tokenBillingTypes.server";
import { normalizeBillingModelKey } from "./tokenBillingTypes.server";

export type TokenBillingRuleRecord = {
  ruleKey: string;
  appName: string;
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
  appName: string;
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
    appName: row.appName,
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
    orderBy: [{ appName: "asc" }, { feature: "asc" }, { modelKey: "asc" }],
  });

  const rules = rows
    .map(rowToRecord)
    .filter((r): r is TokenBillingRuleRecord => r != null);

  cache = { rules, expiresAt: Date.now() + CACHE_TTL_MS };
  return rules;
}

function pickRule(
  rules: TokenBillingRuleRecord[],
  appName: string,
  feature: TokenBillingFeature,
  modelKey: string,
): TokenBillingRuleRecord | null {
  const normalizedModel = normalizeBillingModelKey(modelKey);
  const candidates: Array<{ appName: string; modelKey: string }> = [
    { appName, modelKey: normalizedModel },
    { appName, modelKey: "_default" },
    { appName: "*", modelKey: normalizedModel },
    { appName: "*", modelKey: "_default" },
  ];

  for (const key of candidates) {
    const found = rules.find(
      (r) =>
        r.feature === feature &&
        r.appName === key.appName &&
        r.modelKey === key.modelKey,
    );
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
  appName: string;
  feature: TokenBillingFeature;
  modelKey: string;
}): Promise<ResolvedTokenBillingRule> {
  const appName = params.appName.trim() || "*";
  const rules = await loadEnabledRules();
  const rule = pickRule(rules, appName, params.feature, params.modelKey);
  const multiplier = rule?.multiplier ?? 1;
  const baseTokenCost = rule?.baseTokenCost ?? envBaseTokenCost(params.feature);

  return { rule, multiplier, baseTokenCost };
}

/** 运维排查：列出某 App 下已启用的计费规则。 */
export async function listTokenBillingRulesForApp(
  appName: string,
): Promise<TokenBillingRuleRecord[]> {
  const rules = await loadEnabledRules();
  return rules.filter((r) => r.appName === appName || r.appName === "*");
}
