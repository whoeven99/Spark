import { type TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";

export function extractTranslationTaskFormPayload(
  text: string,
): Partial<TranslationTaskFormPayload> {
  const payload: Partial<TranslationTaskFormPayload> = {};

  const sourceLangMatch = text.match(/源语言：\s*（例如：([^）]+)）/);
  if (sourceLangMatch && sourceLangMatch[1]) {
    // Attempt to map common language names to locale codes. This is a simplification.
    const lang = sourceLangMatch[1].toLowerCase();
    if (lang.includes("中文")) {
      payload.sourceLocale = "zh-CN";
    } else if (lang.includes("英文")) {
      payload.sourceLocale = "en-US";
    }
    // Add more language mappings as needed
  }

  const targetLangMatch = text.match(/目标语言：\s*（例如：([^）]+)）/);
  if (targetLangMatch && targetLangMatch[1]) {
    const lang = targetLangMatch[1].toLowerCase();
    if (lang.includes("中文")) {
      payload.targetLocale = "zh-CN";
    } else if (lang.includes("英文")) {
      payload.targetLocale = "en-US";
    }
    // Add more language mappings as needed
  }

  // Default values for limitPerType and resourceTypes
  payload.limitPerType = 20; // Default limit
  payload.resourceTypes = ["PRODUCT"]; // Default resource type

  return payload;
}
