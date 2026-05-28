import {
  BASE64_PATTERN,
  MODULE_METAFIELD,
  SUSPICIOUS_PATTERN,
  SUSPICIOUS2_PATTERN,
} from "./constants.js";
import { metaTranslate } from "./judgeTranslateUtils.js";

/**
 * METAFIELD branch (TranslateV2Service.needTranslate).
 * PHASE2: JSON value / canTranslateMetafieldJson* deferred — non-JSON-type JSON strings may pass.
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

  // PHASE2: JsonUtils.isJson(value) || type === "JSON" → canTranslateMetafieldJsonByConfig

  return true;
}
