/**
 * 与 Spring `PictureUtils` / `PCUserPicturesService.translatePic` 对齐的图片翻译校验工具。
 * 语言集合与 Java `Set.of` 顺序无关，以 Set 语义为准。
 */

/** 火山机器翻译支持的输入 code（与 PictureUtils.java 一致） */
export const HUO_SHAN_IMAGE_TRANSLATE_INPUT_CODE_SET = new Set<string>([
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
]);

/** 火山机器翻译支持的输出 code（与 PictureUtils.java 一致） */
export const HUO_SHAN_IMAGE_TRANSLATE_OUTPUT_CODE_SET = new Set<string>([
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
]);

/** Aidge 基础图片翻译输入范围（modelType=1 / 自动路由 fallback） */
export const AIDGE_IMAGE_TRANSLATE_INPUT_CODE_SET = new Set<string>([
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
]);

/** Aidge 基础图片翻译输出范围 */
export const AIDGE_IMAGE_TRANSLATE_OUTPUT_CODE_SET = new Set<string>([
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
]);

export const HUO_SHAN_IMAGE_TYPE_SET = new Set<string>(["png", "jpg"]);

export const AIDGE_IMAGE_TYPE_SET = new Set<string>([
  "png",
  "jpg",
  "jpeg",
  "bmp",
  "webp",
]);

/**
 * 与 `PictureUtils.getExtensionFromUrl` 一致：先按 `?` 截断 query，再取最后一个 `.` 之后子串；无有效后缀则 null。
 */
export function getExtensionFromUrl(url: string): string | null {
  const cleanUrl = url.split("?")[0] ?? "";
  const lastDot = cleanUrl.lastIndexOf(".");
  if (lastDot !== -1 && lastDot < cleanUrl.length - 1) {
    return cleanUrl.slice(lastDot + 1);
  }
  return null;
}

/** modelType === 2 时与 Spring 一致：zh-tw → zh-Hant（source / target 均映射后再做火山集合校验与 SDK 调用） */
export function mapZhTwToZhHantForVolcano(code: string): string {
  return code === "zh-tw" ? "zh-Hant" : code;
}

export function isBaseImageTranslateInputCode(
  sourceCode: string,
  targetCode: string,
): boolean {
  switch (targetCode) {
    case "zh-tw":
      return sourceCode === "en" || sourceCode === "zh";
    case "el":
      return sourceCode === "tr" || sourceCode === "en";
    case "kk":
      return sourceCode === "zh";
    default:
      return true;
  }
}

export function isDifferentImageTranslateInputCode(
  sourceCode: string,
  targetCode: string,
  model: number,
): boolean {
  if (model === 1) {
    const inRange =
      AIDGE_IMAGE_TRANSLATE_INPUT_CODE_SET.has(sourceCode) &&
      AIDGE_IMAGE_TRANSLATE_OUTPUT_CODE_SET.has(targetCode);
    return inRange && isBaseImageTranslateInputCode(sourceCode, targetCode);
  }
  if (model === 2) {
    return (
      HUO_SHAN_IMAGE_TRANSLATE_INPUT_CODE_SET.has(sourceCode) &&
      HUO_SHAN_IMAGE_TRANSLATE_OUTPUT_CODE_SET.has(targetCode)
    );
  }
  return false;
}

export function isSupportModelAndImageType(
  imageType: string,
  modelType: number,
): boolean {
  const imageTypeLower = imageType.toLowerCase();
  if (modelType === 1) {
    return AIDGE_IMAGE_TYPE_SET.has(imageTypeLower);
  }
  if (modelType === 2) {
    return HUO_SHAN_IMAGE_TYPE_SET.has(imageTypeLower);
  }
  return false;
}
