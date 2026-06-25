import {
  BLACKLIST_WORDS,
  GENERAL_OR_SECTION_PATTERN,
  IMAGE_PATTERN,
  LOCALE_CONTENT_KEY_BLOCKLIST,
  MODULE_ONLINE_STORE_THEME_LOCALE_CONTENT,
  PATH_PATTERN,
  TRANSLATABLE_RESOURCE_TYPES,
} from "./constants.js";
import { isHtmlContent, isJsonObject } from "./jsonUtils.js";
import { shouldTranslateThemeKey, whiteListTranslate } from "./judgeTranslateUtils.js";

/**
 * Theme module branch (TranslateV2Service.needTranslate).
 */
export function passesThemeModuleRules(module: string, key: string, value: string): boolean {
  if (!TRANSLATABLE_RESOURCE_TYPES.has(module)) {
    return true;
  }

  if (isHtmlContent(value)) {
    return true;
  }

  if (isJsonObject(value)) {
    return false;
  }

  if (key.includes("general.lange")) {
    return false;
  }

  if (key.includes("block") && key.includes("add_button_selector")) {
    return false;
  }

  if (BLACKLIST_WORDS.has(value)) {
    return false;
  }

  if (module === MODULE_ONLINE_STORE_THEME_LOCALE_CONTENT) {
    const lowerKey = key.toLowerCase();
    if (LOCALE_CONTENT_KEY_BLOCKLIST.some((term) => lowerKey.includes(term))) {
      return false;
    }
  }

  if (IMAGE_PATTERN.test(value)) {
    return false;
  }

  if (PATH_PATTERN.test(value)) {
    return false;
  }

  if (GENERAL_OR_SECTION_PATTERN.test(key)) {
    if (whiteListTranslate(key)) {
      return true;
    }
    if (!shouldTranslateThemeKey(key, value)) {
      return false;
    }
  }

  return true;
}
