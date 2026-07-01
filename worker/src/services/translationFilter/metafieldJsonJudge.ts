/**
 * METAFIELD JSON INIT gate — aligned with V2 METAFIELD_JSON_TRANSLATE_RULE.needTranslateJudge.
 */

import { jsonHasExtractableText } from "../jsonExtractRules.js";

/** @deprecated Legacy string marker; kept for reference only. */
export const JSON_JUDGE = '"type":"text"';

/**
 * V2 needTranslateJudge.allowedShopifyTypes —
 * only these Shopify field types may contain translatable JSON.
 */
const ALLOWED_SHOPIFY_TYPES = new Set([
  "RICH_TEXT_FIELD",
  "STRING",
  "SINGLE_LINE_TEXT_FIELD",
  "MULTI_LINE_TEXT_FIELD",
  "JSON",
]);

/**
 * V2 needTranslateJudge.jsonMustContainAny —
 * the raw JSON string must contain at least one of these substrings
 * (quick reject before full parse + rule evaluation).
 */
const JSON_MUST_CONTAIN_ANY = [
  '"type":"text"',
  '"virtual_options"',
  '"photo_gallery"',
  '"reviews"',
];

/**
 * True when:
 * 1. The Shopify field type (if provided) is in the allowed-types whitelist.
 * 2. The raw JSON string contains at least one of the required substrings.
 * 3. The parsed JSON has at least one extractable text slot per the extract rules.
 */
export function canTranslateMetafieldJson(value: string, type?: string): boolean {
  if (type && !ALLOWED_SHOPIFY_TYPES.has(type)) {
    return false;
  }
  if (!JSON_MUST_CONTAIN_ANY.some((s) => value.includes(s))) {
    return false;
  }
  return jsonHasExtractableText(value);
}
