export type PictureTranslateProvider = "volc" | "aidge";

export type LanguageOption = {
  code: string;
  i18nKey: string;
  providers: PictureTranslateProvider[];
  canBeSource: boolean;
  canBeTarget: boolean;
};

export const VOLCENGINE_SOURCE_LANGUAGE_CODES_RAW = [
  "bs",
  "et",
  "lt",
  "ta",
  "lv",
  "sl",
  "ms",
  "mr",
  "ml",
  "sk",
  "az",
  "bn",
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "gu",
  "hi",
  "hr",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "no",
  "pa",
  "pl",
  "pt",
  "ru",
  "sv",
  "th",
  "vi",
  "zh",
  "zh-Hant",
] as const;

export const VOLCENGINE_TARGET_LANGUAGE_CODES_RAW = [
  "zh",
  "en",
  "pt",
  "fr",
  "de",
  "id",
  "nl",
  "it",
  "tr",
  "ru",
  "pl",
  "fi",
  "ro",
  "cs",
  "el",
  "uk",
  "sv",
  "ms",
  "no",
  "sk",
  "mk",
  "lv",
  "tl",
  "mn",
  "lt",
  "hr",
  "et",
  "bs",
  "da",
  "bg",
  "af",
  "ja",
  "ko",
  "zh-Hant",
  "th",
  "hi",
  "mr",
  "te",
  "ta",
  "my",
  "ml",
  "km",
  "kn",
  "he",
  "bn",
  "ka",
] as const;

export const AIDGE_SOURCE_LANGUAGE_CODES_RAW = [
  "zh",
  "zh-tw",
  "en",
  "fr",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
  "es",
  "th",
  "tr",
  "vi",
] as const;

export const AIDGE_TARGET_LANGUAGE_CODES_RAW = [
  "ar",
  "bn",
  "zh",
  "zh-tw",
  "cs",
  "da",
  "nl",
  "en",
  "fi",
  "fr",
  "de",
  "el",
  "he",
  "hu",
  "id",
  "it",
  "ja",
  "kk",
  "ko",
  "ms",
  "pl",
  "pt",
  "ru",
  "es",
  "sv",
  "th",
  "tl",
  "tr",
  "uk",
  "ur",
  "vi",
] as const;

function normalizeLanguageCodeForUi(code: string): string {
  if (code === "zh-Hant") return "zh-tw";
  return code;
}

function toI18nLanguageKey(code: string): string {
  return `language.${code.toLowerCase()}`;
}

function addLanguageCapabilities(
  languageMap: Map<string, LanguageOption>,
  code: string,
  provider: PictureTranslateProvider,
  capability: "source" | "target",
): void {
  const normalizedCode = normalizeLanguageCodeForUi(code);
  const prev = languageMap.get(normalizedCode);
  if (!prev) {
    languageMap.set(normalizedCode, {
      code: normalizedCode,
      i18nKey: toI18nLanguageKey(normalizedCode),
      providers: [provider],
      canBeSource: capability === "source",
      canBeTarget: capability === "target",
    });
    return;
  }

  if (!prev.providers.includes(provider)) {
    prev.providers.push(provider);
  }
  if (capability === "source") {
    prev.canBeSource = true;
  } else {
    prev.canBeTarget = true;
  }
}

function buildPictureTranslateLanguages(): LanguageOption[] {
  const languageMap = new Map<string, LanguageOption>();

  for (const code of VOLCENGINE_SOURCE_LANGUAGE_CODES_RAW) {
    addLanguageCapabilities(languageMap, code, "volc", "source");
  }
  for (const code of VOLCENGINE_TARGET_LANGUAGE_CODES_RAW) {
    addLanguageCapabilities(languageMap, code, "volc", "target");
  }
  for (const code of AIDGE_SOURCE_LANGUAGE_CODES_RAW) {
    addLanguageCapabilities(languageMap, code, "aidge", "source");
  }
  for (const code of AIDGE_TARGET_LANGUAGE_CODES_RAW) {
    addLanguageCapabilities(languageMap, code, "aidge", "target");
  }

  const languages = Array.from(languageMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  return [
    {
      code: "auto",
      i18nKey: "language.auto",
      providers: ["volc", "aidge"],
      canBeSource: true,
      canBeTarget: false,
    },
    ...languages,
  ];
}

export const pictureTranslateLanguages = buildPictureTranslateLanguages();

export function filterPictureTranslateSourceLanguages(
  provider: PictureTranslateProvider | null,
): LanguageOption[] {
  return pictureTranslateLanguages.filter((language) => {
    if (!language.canBeSource) return false;
    if (!provider) return true;
    return language.providers.includes(provider);
  });
}

export function filterPictureTranslateTargetLanguages(params: {
  sourceLanguage: string;
  provider: PictureTranslateProvider | null;
}): LanguageOption[] {
  const selectedSource = params.sourceLanguage.trim().toLowerCase();
  return pictureTranslateLanguages.filter((language) => {
    if (!language.canBeTarget) return false;
    if (params.provider && !language.providers.includes(params.provider)) return false;
    if (!selectedSource || selectedSource === "auto") return true;
    return language.code.toLowerCase() !== selectedSource;
  });
}

function normalizeForVolc(code: string): string {
  return code === "zh-tw" ? "zh-Hant" : code;
}

function normalizeForAidge(code: string): string {
  if (code === "zh-Hant" || code === "zh-hant") return "zh-tw";
  return code;
}

const VOLCENGINE_SOURCE_SET = new Set<string>(VOLCENGINE_SOURCE_LANGUAGE_CODES_RAW);
const VOLCENGINE_TARGET_SET = new Set<string>(VOLCENGINE_TARGET_LANGUAGE_CODES_RAW);
const AIDGE_SOURCE_SET = new Set<string>(AIDGE_SOURCE_LANGUAGE_CODES_RAW);
const AIDGE_TARGET_SET = new Set<string>(AIDGE_TARGET_LANGUAGE_CODES_RAW);

function isAidgeBaseInputCode(source: string, target: string): boolean {
  switch (target) {
    case "zh-tw":
      return source === "en" || source === "zh";
    case "el":
      return source === "tr" || source === "en";
    case "kk":
      return source === "zh";
    default:
      return true;
  }
}

function isVolcLanguagePair(source: string, target: string): boolean {
  const s = normalizeForVolc(source);
  const t = normalizeForVolc(target);
  return VOLCENGINE_SOURCE_SET.has(s) && VOLCENGINE_TARGET_SET.has(t);
}

function isAidgeLanguagePair(source: string, target: string): boolean {
  const s = normalizeForAidge(source);
  const t = normalizeForAidge(target);
  return (
    AIDGE_SOURCE_SET.has(s) &&
    AIDGE_TARGET_SET.has(t) &&
    isAidgeBaseInputCode(s, t)
  );
}

/**
 * 根据源语言和目标语言选择 modelType。
 * - modelType 1 = Aidge
 * - modelType 2 = 火山 (Volcengine)
 * 优先火山，fallback Aidge。
 */
export function selectModelTypeForLanguagePair(
  sourceLanguage: string,
  targetLanguage: string,
): 1 | 2 {
  const source = sourceLanguage.trim();
  const target = targetLanguage.trim();

  if (source === "auto" || !source) {
    const targetVolc = normalizeForVolc(target);
    if (VOLCENGINE_TARGET_SET.has(targetVolc)) {
      return 2;
    }
    return 1;
  }

  if (isVolcLanguagePair(source, target)) {
    return 2;
  }

  if (isAidgeLanguagePair(source, target)) {
    return 1;
  }

  return 2;
}
