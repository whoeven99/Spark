import {
  MODULE_METAFIELD,
  MODULE_METAOBJECT,
  MODULE_PRODUCT_OPTION,
  MODULE_PRODUCT_OPTION_VALUE,
  SHOPIFY_OPTION_SYSTEM_DEFAULTS,
} from "./constants.js";
import { translationRuleJudgment } from "./judgeTranslateUtils.js";
import { passesMetafieldModuleRules } from "./metafieldRules.js";
import { passesThemeModuleRules } from "./themeRules.js";
import type {
  ExistingTranslation,
  IncludeFieldV2Context,
  TranslatableContentInput,
} from "./types.js";
import {
  isBlankValue,
  passesCoverAndOutdatedRules,
  passesV3TypeAndHandleRules,
} from "./v3Base.js";

/**
 * INIT field filter aligned with TranslateV2Service.needTranslate (subset: no HTML/JSON content checks).
 */
export function shouldIncludeFieldV2(
  content: TranslatableContentInput,
  translations: ExistingTranslation[] | undefined,
  ctx: IncludeFieldV2Context,
): boolean {
  const value = content.value ?? "";
  const type = content.type ?? "";
  const key = content.key;
  const { module, isCover, isHandle } = ctx;

  if (isBlankValue(value)) {
    return false;
  }

  // PRODUCT_OPTION / PRODUCT_OPTION_VALUE: skip Shopify's auto-generated system
  // defaults ("Default Title", "Title", "Default"). These are internal Shopify
  // placeholders for single-variant products and must never be translated —
  // writing them back in a different locale breaks Shopify's variant system.
  if (
    (module === MODULE_PRODUCT_OPTION || module === MODULE_PRODUCT_OPTION_VALUE) &&
    SHOPIFY_OPTION_SYSTEM_DEFAULTS.has(value.trim())
  ) {
    return false;
  }

  if (!passesCoverAndOutdatedRules(translations, key, isCover)) {
    return false;
  }

  if (!passesV3TypeAndHandleRules(content, { isCover, isHandle })) {
    return false;
  }

  if (module !== MODULE_METAFIELD && type === "JSON") {
    return false;
  }

  if (type === "URI" && key === "handle") {
    return isHandle;
  }

  if (!translationRuleJudgment(key, value)) {
    return false;
  }

  if (!passesThemeModuleRules(module, key, value)) {
    return false;
  }

  if (!passesMetafieldModuleRules(module, type, value)) {
    return false;
  }

  if (module === MODULE_METAOBJECT && value.includes("grp__")) {
    return false;
  }

  return true;
}
