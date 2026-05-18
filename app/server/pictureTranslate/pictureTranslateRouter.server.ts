import {
  AIDGE_IMAGE_TYPE_SET,
  HUO_SHAN_IMAGE_TRANSLATE_OUTPUT_CODE_SET,
  HUO_SHAN_IMAGE_TYPE_SET,
  isDifferentImageTranslateInputCode,
  mapZhTwToZhHantForVolcano,
} from "./pictureTranslatePictureUtils.server";

export type PictureTranslateProvider = "volc" | "aidge";

export type PictureTranslateRouteOk = {
  ok: true;
  provider: PictureTranslateProvider;
  /** 火山 SDK / 校验用 */
  sourceVolc: string;
  targetVolc: string;
  /** Aidge API 用（保留 zh-tw） */
  sourceAidge: string;
  targetAidge: string;
};

export type PictureTranslateRouteFailure = {
  ok: false;
  reason: "language_pair_not_supported" | "auto_requires_explicit_source";
};

export type PictureTranslateRouteResult =
  | PictureTranslateRouteOk
  | PictureTranslateRouteFailure;

function normalizeAidgeLanguageCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed === "zh-Hant" || trimmed === "zh-hant") return "zh-tw";
  return trimmed;
}

function isVolcLanguagePair(source: string, target: string): boolean {
  const sourceVolc = mapZhTwToZhHantForVolcano(source);
  const targetVolc = mapZhTwToZhHantForVolcano(target);
  return isDifferentImageTranslateInputCode(sourceVolc, targetVolc, 2);
}

function isAidgeLanguagePair(source: string, target: string): boolean {
  const sourceAidge = normalizeAidgeLanguageCode(source);
  const targetAidge = normalizeAidgeLanguageCode(target);
  return isDifferentImageTranslateInputCode(sourceAidge, targetAidge, 1);
}

export function isImageExtensionSupportedForProvider(
  extensionLower: string,
  provider: PictureTranslateProvider,
): boolean {
  if (provider === "volc") {
    return HUO_SHAN_IMAGE_TYPE_SET.has(extensionLower);
  }
  return AIDGE_IMAGE_TYPE_SET.has(extensionLower);
}

/**
 * 双引擎路由：重叠语言范围优先火山；仅 Aidge 范围走 Aidge；均不支持则不译。
 * `sourceLanguage === "auto"` 时仅当目标语在火山输出集且图片格式满足火山时走火山（与一期 Tool 行为一致）。
 */
export function resolvePictureTranslateProvider(params: {
  sourceLanguage: string;
  targetLanguage: string;
  imageExtensionLower: string;
}): PictureTranslateRouteResult {
  const sourceRaw = params.sourceLanguage.trim();
  const targetRaw = params.targetLanguage.trim();
  const ext = params.imageExtensionLower.toLowerCase();

  const targetVolc = mapZhTwToZhHantForVolcano(targetRaw);
  const targetAidge = normalizeAidgeLanguageCode(targetRaw);

  if (sourceRaw === "auto" || !sourceRaw) {
    if (
      HUO_SHAN_IMAGE_TRANSLATE_OUTPUT_CODE_SET.has(targetVolc) &&
      HUO_SHAN_IMAGE_TYPE_SET.has(ext)
    ) {
      return {
        ok: true,
        provider: "volc",
        sourceVolc: "auto",
        targetVolc,
        sourceAidge: "auto",
        targetAidge,
      };
    }
    return { ok: false, reason: "auto_requires_explicit_source" };
  }

  const sourceVolc = mapZhTwToZhHantForVolcano(sourceRaw);
  const sourceAidge = normalizeAidgeLanguageCode(sourceRaw);

  if (isVolcLanguagePair(sourceRaw, targetRaw) && HUO_SHAN_IMAGE_TYPE_SET.has(ext)) {
    return {
      ok: true,
      provider: "volc",
      sourceVolc,
      targetVolc,
      sourceAidge,
      targetAidge,
    };
  }

  if (isAidgeLanguagePair(sourceRaw, targetRaw) && AIDGE_IMAGE_TYPE_SET.has(ext)) {
    return {
      ok: true,
      provider: "aidge",
      sourceVolc,
      targetVolc,
      sourceAidge,
      targetAidge,
    };
  }

  return { ok: false, reason: "language_pair_not_supported" };
}

/** HTTP `modelType` 强制指定引擎时不做交叉 fallback。 */
export function resolvePictureTranslateProviderForced(params: {
  modelType: 1 | 2;
  sourceLanguage: string;
  targetLanguage: string;
  imageExtensionLower: string;
}): PictureTranslateRouteResult {
  const sourceRaw = params.sourceLanguage.trim();
  const targetRaw = params.targetLanguage.trim();
  const ext = params.imageExtensionLower.toLowerCase();

  if (params.modelType === 2) {
    if (sourceRaw === "auto" || !sourceRaw) {
      return { ok: false, reason: "auto_requires_explicit_source" };
    }
    if (!isVolcLanguagePair(sourceRaw, targetRaw)) {
      return { ok: false, reason: "language_pair_not_supported" };
    }
    if (!HUO_SHAN_IMAGE_TYPE_SET.has(ext)) {
      return { ok: false, reason: "language_pair_not_supported" };
    }
    return {
      ok: true,
      provider: "volc",
      sourceVolc: mapZhTwToZhHantForVolcano(sourceRaw),
      targetVolc: mapZhTwToZhHantForVolcano(targetRaw),
      sourceAidge: normalizeAidgeLanguageCode(sourceRaw),
      targetAidge: normalizeAidgeLanguageCode(targetRaw),
    };
  }

  if (sourceRaw === "auto" || !sourceRaw) {
    return { ok: false, reason: "auto_requires_explicit_source" };
  }
  if (!isAidgeLanguagePair(sourceRaw, targetRaw)) {
    return { ok: false, reason: "language_pair_not_supported" };
  }
  if (!AIDGE_IMAGE_TYPE_SET.has(ext)) {
    return { ok: false, reason: "language_pair_not_supported" };
  }
  return {
    ok: true,
    provider: "aidge",
    sourceVolc: mapZhTwToZhHantForVolcano(sourceRaw),
    targetVolc: mapZhTwToZhHantForVolcano(targetRaw),
    sourceAidge: normalizeAidgeLanguageCode(sourceRaw),
    targetAidge: normalizeAidgeLanguageCode(targetRaw),
  };
}
