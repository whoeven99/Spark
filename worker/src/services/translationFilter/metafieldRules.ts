import {
  BASE64_PATTERN,
  MODULE_METAFIELD,
  SUSPICIOUS_PATTERN,
  SUSPICIOUS2_PATTERN,
} from "./constants.js";
import { tryParseJsonContainer } from "../jsonExtractRules.js";
import { isHtmlContent } from "./jsonUtils.js";
import { metaTranslate } from "./judgeTranslateUtils.js";
import { canTranslateMetafieldJson } from "./metafieldJsonJudge.js";

function isJsonContainer(value: string): boolean {
  return tryParseJsonContainer(value) !== undefined;
}

/** Hardcoded metafield literals (TranslateV2Service + common Shopify app sentinels). */
const METAFIELD_LITERAL_BLOCKLIST = new Set([
  "CC_CC-PT",
  "_none",
  "subscribe_newsletter",
]);

/**
 * Metafield-only technical value patterns (IDs, app bundle keys, internal tokens).
 * SUSPICIOUS_* covers 9–10 char IDs; these catch shorter / structured tokens.
 */
const METAFIELD_VALUE_BLOCK_PATTERNS: RegExp[] = [
  /** 5–8 char mixed-case alphanumeric (e.g. UFdVwM). */
  /^(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{5,8}$/,
  /** Shopify app extension identifiers: app--{numericId}--{slug}. */
  /^app--\d+--[a-z0-9_-]+$/i,
  /** Underscore-prefixed internal tokens (_none, _disabled, …). */
  /^_[a-z][a-z0-9_-]*$/i,
];

/**
 * Port StringUtils.isValidString — opaque scalar (numbers, punctuation-heavy, short hash).
 * Used for METAFIELD SINGLE_LINE_TEXT non-HTML (ShopifyService.countMetafieldData).
 */
function isMetafieldOpaqueScalar(value: string): boolean {
  if (value.includes('{"') && value.includes("}")) {
    return true;
  }
  if (!/^[a-zA-Z0-9\p{P}]+$/u.test(value)) {
    return false;
  }
  if (/^[0-9\p{P}]+$/u.test(value)) {
    return true;
  }
  if (/^[0-9]+$/.test(value)) {
    return true;
  }
  if (value.startsWith("#") && value.length <= 10) {
    return true;
  }
  const punctCount = (value.match(/[\p{P}]/gu) ?? []).length;
  return punctCount >= 2;
}

function isBlockedMetafieldValue(value: string): boolean {
  if (METAFIELD_LITERAL_BLOCKLIST.has(value)) {
    return true;
  }
  return METAFIELD_VALUE_BLOCK_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * METAFIELD branch (TranslateV2Service.needTranslate).
 */
export function passesMetafieldModuleRules(
  module: string,
  type: string,
  value: string,
): boolean {
  if (module !== MODULE_METAFIELD) {
    return true;
  }

  if (SUSPICIOUS_PATTERN.test(value) || SUSPICIOUS2_PATTERN.test(value)) {
    return false;
  }

  if (!metaTranslate(value)) {
    return false;
  }

  if (BASE64_PATTERN.test(value)) {
    return false;
  }

  if (value.startsWith("=")) {
    return false;
  }

  if (value.includes("class='jdgm-all-reviews__header'")) {
    return false;
  }

  if (isBlockedMetafieldValue(value)) {
    return false;
  }

  if (
    type === "SINGLE_LINE_TEXT_FIELD" &&
    !isHtmlContent(value) &&
    isMetafieldOpaqueScalar(value)
  ) {
    return false;
  }

  if (isJsonContainer(value) || type === "JSON") {
    return canTranslateMetafieldJson(value, type);
  }

  return true;
}
