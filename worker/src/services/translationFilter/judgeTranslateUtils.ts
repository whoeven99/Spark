import {
  BASE64_PATTERN,
  HASH_PREFIX_MAX_LENGTH,
  ICON_KEY_PATTERN,
  ISO_OFFSET_DATETIME_PATTERN,
  EMPTY_BODY_TAG_PATTERN,
  JSON_NO_TRANSLATE_SUBSTRINGS,
  NO_TRANSLATE_KEYS,
  OLD_NO_TRANSLATE,
  SLASH_CONTAINS_MAX_LENGTH,
  URL_PREFIXES,
  WHITELIST_WORDS,
} from "./constants.js";
import { matchesRejectRule } from "./rejectRules.js";

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

function isHtmlContent(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

/**
 * General rules (JudgeTranslateUtils.translationRuleJudgment).
 * HTML/Rich-text bodies skip scalar heuristics (px/url/hash) that target theme tokens.
 */
export function translationRuleJudgment(key: string, value: string): boolean {
  if (value == null || value.trim() === "") {
    return false;
  }

  // PHASE2: key === "value" && isJson(value) → return true

  if (ISO_OFFSET_DATETIME_PATTERN.test(value)) {
    return false;
  }

  if (EMPTY_BODY_TAG_PATTERN.test(value.trim())) {
    return false;
  }

  if (isHtmlContent(value)) {
    return true;
  }

  if (/\d+px\b/.test(value)) {
    return false;
  }

  if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
    return false;
  }

  if (value.startsWith("#") && value.length <= HASH_PREFIX_MAX_LENGTH) {
    return false;
  }

  for (const prefix of URL_PREFIXES) {
    if (value.startsWith(prefix)) {
      return false;
    }
  }

  if (matchesRejectRule(value)) {
    return false;
  }

  return true;
}

/**
 * Theme general/section keys (JudgeTranslateUtils.shouldTranslate).
 * PHASE2: key contains "color" && !isHtml(value) is deferred.
 */
export function shouldTranslateThemeKey(key: string, value: string): boolean {
  if (value == null || value.trim() === "") {
    return false;
  }

  if (value.startsWith("=")) {
    return false;
  }

  if (key.includes("captions")) {
    return false;
  }

  if (value.includes("/") && value.length <= SLASH_CONTAINS_MAX_LENGTH) {
    return false;
  }

  if (BASE64_PATTERN.test(value)) {
    return false;
  }

  if (ICON_KEY_PATTERN.test(key)) {
    return false;
  }

  for (const substring of OLD_NO_TRANSLATE) {
    if (key.includes(substring)) {
      return false;
    }
  }

  for (const substring of NO_TRANSLATE_KEYS) {
    if (key.includes(substring)) {
      return false;
    }
  }

  if (key.includes(".json")) {
    for (const substring of JSON_NO_TRANSLATE_SUBSTRINGS) {
      if (key.includes(substring)) {
        return false;
      }
    }
  }

  // PHASE2: key.includes("color") && !isHtml(value) → return false

  return true;
}

export function whiteListTranslate(key: string): boolean {
  const prefix = key.split(":")[0] ?? key;
  return WHITELIST_WORDS.some((word) => prefix.endsWith(word));
}

// CSS/config enum identifiers: all-lowercase ASCII letters/hyphens/underscores,
// no whitespace, < 20 chars — these are layout/style config values, not UI text.
const CSS_ENUM_RE = /^[a-z][a-z_-]*$/;

export function metaTranslate(value: string): boolean {
  if (value.length < 20 && CSS_ENUM_RE.test(value)) return false;
  return true;
}
