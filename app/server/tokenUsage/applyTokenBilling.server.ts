import {
  parseUsageMetadata,
  sumParsedTokenUsage,
  type ParsedTokenUsage,
} from "./parseUsageMetadata.server";
import { resolveTokenBillingRule } from "./tokenBillingCatalog.server";
import type { TokenBillingFeature } from "./tokenBillingTypes.server";
import { normalizeBillingModelKey } from "./tokenBillingTypes.server";

export function applyTokenBillingMultiplier(
  usage: ParsedTokenUsage,
  multiplier: number,
): ParsedTokenUsage {
  const m = Number.isFinite(multiplier) && multiplier >= 0 ? multiplier : 1;
  const scale = (n: number) => Math.max(0, Math.ceil(n * m));
  return {
    inputTokens: scale(usage.inputTokens),
    outputTokens: scale(usage.outputTokens),
    totalTokens: scale(usage.totalTokens),
  };
}

/**
 * 将原始用量转为「计入套餐」的 token：定额场景用 baseTokenCost，LLM 场景用 API 返回的 token × multiplier。
 */
export async function billTokenUsage(params: {
  appName: string;
  feature: TokenBillingFeature;
  modelKey: string;
  usage: ParsedTokenUsage | unknown;
}): Promise<ParsedTokenUsage> {
  const parsed = parseUsageMetadata(params.usage);
  const { multiplier, baseTokenCost } = await resolveTokenBillingRule({
    appName: params.appName,
    feature: params.feature,
    modelKey: normalizeBillingModelKey(params.modelKey),
  });

  const raw: ParsedTokenUsage =
    parsed.totalTokens > 0
      ? parsed
      : baseTokenCost != null && baseTokenCost > 0
        ? { inputTokens: 0, outputTokens: 0, totalTokens: baseTokenCost }
        : parsed;

  return applyTokenBillingMultiplier(raw, multiplier);
}

export type BilledTokenUsageItem = {
  feature: TokenBillingFeature;
  modelKey: string;
  usage: ParsedTokenUsage | unknown;
};

export async function sumBilledTokenUsages(params: {
  appName: string;
  items: BilledTokenUsageItem[];
}): Promise<ParsedTokenUsage> {
  const billed: ParsedTokenUsage[] = [];
  for (const item of params.items) {
    billed.push(
      await billTokenUsage({
        appName: params.appName,
        feature: item.feature,
        modelKey: item.modelKey,
        usage: item.usage,
      }),
    );
  }
  return sumParsedTokenUsage(billed);
}
