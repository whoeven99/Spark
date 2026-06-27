/**
 * METAFIELD JSON INIT gate — content-based (aligned with jsonExtractRules).
 */

import { jsonHasExtractableText } from "../jsonExtractRules.js";

/** @deprecated Legacy string marker; detection is now content-based via extract rules. */
export const JSON_JUDGE = '"type":"text"';

/**
 * True when the value is parseable JSON and matches configured extract rules
 * (e.g. Shopify rich-text `type:"text"` / `value`, virtual_options paths).
 * Shopify field type (RICH_TEXT_FIELD / JSON / …) is not used.
 */
export function canTranslateMetafieldJson(value: string, _type?: string): boolean {
  return jsonHasExtractableText(value);
}
