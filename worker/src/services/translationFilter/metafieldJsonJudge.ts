/**
 * METAFIELD JSON INIT gate — Spring empty Redis: legacy path only (no owner check).
 */

export const JSON_JUDGE = '"type":"text"';

/** Java canTranslateMetafieldJsonLegacy without hasMetafieldOwner. */
export function canTranslateMetafieldJson(value: string, type: string): boolean {
  return value.includes(JSON_JUDGE) && type === "RICH_TEXT_FIELD";
}
