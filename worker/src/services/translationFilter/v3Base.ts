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

/** Aligns with V2: skip when translation exists and outdated is not true */
export function passesCoverAndOutdatedRules(
  translations: ExistingTranslation[] | undefined,
  key: string,
  isCover: boolean,
): boolean {
  if (isCover || !translations?.length) {
    return true;
  }
  const keyTranslation = translations.find((t) => key != null && key === t.key);
  if (keyTranslation != null && keyTranslation.outdated !== true) {
    return false;
  }
  return true;
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
