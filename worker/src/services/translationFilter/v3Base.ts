import { NON_TRANSLATABLE_TYPES } from "./constants.js";
import type {
  ExistingTranslation,
  IncludeFieldOptions,
  TranslatableContentInput,
} from "./types.js";

/** V3 base rules (TranslateV3Service.shouldStoreContent) */

export function isBlankValue(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

export function passesV3TypeAndHandleRules(
  content: TranslatableContentInput,
  opts: IncludeFieldOptions,
): boolean {
  const type = content.type ?? "";
  const key = content.key;

  if (NON_TRANSLATABLE_TYPES.has(type)) {
    return false;
  }

  if (type === "URI" && key === "handle" && !opts.isHandle) {
    return false;
  }

  return true;
}

/**
 * Non-cover INIT: field needs translation when target locale has no row,
 * outdated=true, or an empty translation value (Shopify placeholder).
 */
export function translationNeedsRefresh(
  translation: ExistingTranslation | undefined,
): boolean {
  if (!translation) {
    return true;
  }
  if (translation.outdated === true) {
    return true;
  }
  if (isBlankValue(translation.value)) {
    return true;
  }
  return false;
}

/** Non-cover: include field when translationNeedsRefresh; cover always includes. */
export function passesCoverAndOutdatedRules(
  translations: ExistingTranslation[] | undefined,
  key: string,
  isCover: boolean,
): boolean {
  if (isCover) {
    return true;
  }
  const keyTranslation = translations?.find((t) => key != null && key === t.key);
  return translationNeedsRefresh(keyTranslation);
}

export function shouldIncludeFieldV3(
  content: TranslatableContentInput,
  translations: ExistingTranslation[] | undefined,
  opts: IncludeFieldOptions,
): boolean {
  if (isBlankValue(content.value)) {
    return false;
  }
  if (!passesV3TypeAndHandleRules(content, opts)) {
    return false;
  }
  if (!passesCoverAndOutdatedRules(translations, content.key, opts.isCover)) {
    return false;
  }
  return true;
}
