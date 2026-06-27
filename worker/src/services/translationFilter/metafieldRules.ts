import {
  BASE64_PATTERN,
  MODULE_METAFIELD,
  SUSPICIOUS_PATTERN,
  SUSPICIOUS2_PATTERN,
} from "./constants.js";
import { tryParseJsonContainer } from "../jsonExtractRules.js";
import { metaTranslate } from "./judgeTranslateUtils.js";
import { canTranslateMetafieldJson } from "./metafieldJsonJudge.js";

function isJsonContainer(value: string): boolean {
  return tryParseJsonContainer(value) !== undefined;
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

  if (value === "CC_CC-PT") {
    return false;
  }

  // JSON-shaped values: allow only when extract rules find translatable text slots.
  if (isJsonContainer(value) || type === "JSON") {
    return canTranslateMetafieldJson(value, type);
  }

  return true;
}
