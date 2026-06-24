/**
 * METAFIELD JSON 规则 — 与 Java Redis `bogda:config` / METAFIELD_JSON_TRANSLATE_RULE 对齐。
 * 来源：GET https://springbackendprod.azurewebsites.net/bogdaconfig（2026-06-24 同步）
 *
 * 可通过 env `METAFIELD_JSON_TRANSLATE_RULE`（JSON 字符串）覆盖。
 */

import type { JsonExtractRule } from "./jsonExtractRules.js";

export type MetafieldJsonTranslateRule = {
  needTranslateJudge?: {
    fallbackToLegacyWhenInvalid?: boolean;
    allowedShopifyTypes?: string[];
    jsonMustContainAny?: string[];
    requireOwnerCheck?: boolean;
  };
  jsonExtractRules?: JsonExtractRule[];
};

/** 线上 Spring Backend Redis 当前值（bogda:config hash field） */
export const PROD_METAFIELD_JSON_TRANSLATE_RULE: MetafieldJsonTranslateRule = {
  needTranslateJudge: {
    allowedShopifyTypes: [
      "RICH_TEXT_FIELD",
      "STRING",
      "SINGLE_LINE_TEXT_FIELD",
      "MULTI_LINE_TEXT_FIELD",
      "JSON",
    ],
    jsonMustContainAny: [
      '"type":"text"',
      '"virtual_options"',
      '"photo_gallery"',
      '"reviews"',
    ],
  },
  jsonExtractRules: [
    {
      mode: "typeFieldMatch",
      typeField: "type",
      typeValue: "text",
      translateField: "value",
    },
    {
      mode: "typeFieldMatch",
      typeField: "type",
      typeValue: "paragraph",
      translateField: "value",
    },
    {
      mode: "typeFieldMatch",
      typeField: "type",
      typeValue: "list",
      translateField: "value",
    },
    { mode: "path", path: "virtual_options[*].title" },
    { mode: "path", path: "virtual_options[*].values[*].key" },
    { mode: "path", path: "reviews[*].title" },
    { mode: "path", path: "reviews[*].body" },
    { mode: "path", path: "photo_gallery[*].title" },
    { mode: "path", path: "photo_gallery[*].body_html" },
  ],
};

export function loadMetafieldJsonTranslateRule(): MetafieldJsonTranslateRule {
  const raw = process.env.METAFIELD_JSON_TRANSLATE_RULE?.trim();
  if (raw) {
    try {
      return JSON.parse(raw) as MetafieldJsonTranslateRule;
    } catch {
      console.warn("[metafieldJsonConfig] invalid METAFIELD_JSON_TRANSLATE_RULE env, using prod defaults");
    }
  }
  return PROD_METAFIELD_JSON_TRANSLATE_RULE;
}
