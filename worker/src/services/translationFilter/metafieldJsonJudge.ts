/**
 * METAFIELD JSON inclusion — aligned with TranslateV2Service.canTranslateMetafieldJsonByConfig.
 */

import { jsonHasExtractableText, tryParseJsonContainer } from "../jsonExtractRules.js";
import { loadMetafieldJsonTranslateRule } from "../metafieldJsonConfig.js";

export const JSON_JUDGE = '"type":"text"';

export type MetafieldJsonJudgeConfig = {
  needTranslateJudge?: {
    fallbackToLegacyWhenInvalid?: boolean;
    allowedShopifyTypes?: string[];
    jsonMustContainAny?: string[];
    requireOwnerCheck?: boolean;
  };
};

function matchAllowedType(type: string, allowedTypes: string[] | undefined): boolean {
  if (!allowedTypes || allowedTypes.length === 0) return true;
  return allowedTypes.includes(type);
}

function matchMustContainCondition(value: string, mustContain: string[] | undefined): boolean {
  if (!mustContain || mustContain.length === 0) return true;
  return mustContain.some((cond) => cond && value.includes(cond));
}

/** Java canTranslateMetafieldJsonLegacy — RICH_TEXT with type:text marker only. */
export function canTranslateMetafieldJsonLegacy(value: string, type: string): boolean {
  if (!value.includes(JSON_JUDGE) || type !== "RICH_TEXT_FIELD") {
    return false;
  }
  return true;
}

function applyNeedTranslateJudge(
  value: string,
  type: string,
  judge: NonNullable<MetafieldJsonJudgeConfig["needTranslateJudge"]>,
): boolean {
  const fallback =
    judge.fallbackToLegacyWhenInvalid === undefined || judge.fallbackToLegacyWhenInvalid;

  if (!matchAllowedType(type, judge.allowedShopifyTypes)) {
    return false;
  }

  if (judge.jsonMustContainAny !== undefined && !Array.isArray(judge.jsonMustContainAny)) {
    return fallback && canTranslateMetafieldJsonLegacy(value, type);
  }

  if (!matchMustContainCondition(value, judge.jsonMustContainAny)) {
    return false;
  }

  return true;
}

/**
 * Whether a METAFIELD JSON value should enter the translation job (INIT filter).
 * Uses prod Redis config by default (see metafieldJsonConfig.ts).
 */
export function canTranslateMetafieldJson(value: string, type: string): boolean {
  const config = loadMetafieldJsonTranslateRule();
  const judge = config.needTranslateJudge;

  if (judge) {
    return applyNeedTranslateJudge(value, type, judge);
  }

  if (canTranslateMetafieldJsonLegacy(value, type)) {
    return true;
  }

  if (tryParseJsonContainer(value) !== undefined || type === "JSON") {
    return jsonHasExtractableText(value);
  }

  return false;
}
