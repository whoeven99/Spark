/** 从 augment 后的用户消息里取出真实输入（Workspace 会拼上下文 + [用户消息]）。 */
export function extractUserIntentText(lastUserText: string): string {
  const marker = "[用户消息]";
  const idx = lastUserText.lastIndexOf(marker);
  const raw = idx >= 0 ? lastUserText.slice(idx + marker.length) : lastUserText;
  return raw.trim();
}

const IMAGE_KEYWORD_RE = /图片|图像|主图|配图|详情图|截图|image|picture|photo/i;
const TRANSLATE_KEYWORD_RE = /翻译|译图|translate/i;
/** 翻译文案/描述/标题类，属于商品描述而非整图翻译，需排除。 */
const COPY_TRANSLATE_RE = /翻译\s*(商品)?\s*(描述|文案|标题|正文|内容|详情)/;

/**
 * 判断用户真实意图是否为「翻译图片中的文字」（整图翻译），
 * 用于在批量任务里把误判的 product_improve 纠正为 picture_translate。
 * 只看 `[用户消息]` 正文，避免工作台上下文里的 `[图片: url]` 误伤。
 */
export function isPictureTranslateUserIntent(lastUserText: string): boolean {
  const text = extractUserIntentText(lastUserText);
  if (!text) return false;
  if (COPY_TRANSLATE_RE.test(text)) return false;
  return TRANSLATE_KEYWORD_RE.test(text) && IMAGE_KEYWORD_RE.test(text);
}

/**
 * 从用户正文识别整图翻译目标语言，返回图片翻译支持的语言码；识别不到返回 null。
 * 仅覆盖常见语言，未命中时由调用方回落到默认 `zh`。
 */
export function detectPictureTranslateTargetLanguage(lastUserText: string): string | null {
  const text = extractUserIntentText(lastUserText);
  if (!text) return null;
  if (/繁体|繁體|zh-tw|zh-hant|traditional\s*chinese/i.test(text)) return "zh-tw";
  if (/简体|中文|汉语|漢語|zh-cn|zh-hans|\bzh\b|chinese/i.test(text)) return "zh";
  if (/英文|英语|英語|english|\ben\b/i.test(text)) return "en";
  if (/日文|日语|日語|japanese|\bja\b/i.test(text)) return "ja";
  if (/韩文|韩语|韓語|korean|\bko\b/i.test(text)) return "ko";
  return null;
}

function detectCommonTargetLanguage(lastUserText: string): string | null {
  const text = extractUserIntentText(lastUserText);
  if (!text) return null;
  if (/繁体|繁體|zh-tw|zh-hant|traditional\s*chinese/i.test(text)) return "zh-TW";
  if (/简体|中文|汉语|漢語|zh-cn|zh-hans|\bzh\b|chinese/i.test(text)) return "zh-CN";
  if (/英文|英语|英語|english|\ben\b/i.test(text)) return "en";
  if (/日文|日语|日語|japanese|\bja\b/i.test(text)) return "ja";
  if (/韩文|韩语|韓語|korean|\bko\b/i.test(text)) return "ko";
  if (/德文|德语|德語|german|\bde\b/i.test(text)) return "de";
  if (/法文|法语|法語|french|\bfr\b/i.test(text)) return "fr";
  if (/西班牙文|西班牙语|西班牙語|spanish|\bes\b/i.test(text)) return "es";
  if (/葡萄牙文|葡萄牙语|葡萄牙語|portuguese|\bpt\b/i.test(text)) return "pt";
  return null;
}

function looksLikeEnglishUserInput(lastUserText: string): boolean {
  const text = extractUserIntentText(lastUserText);
  if (!text) return false;
  if (/[\u3400-\u9fff]/.test(text)) return false;
  const latinWords = text.match(/[A-Za-z]{2,}/g) ?? [];
  return latinWords.length >= 2;
}

function isChineseLanguageCode(code: string): boolean {
  const normalized = code.trim().toLowerCase().replace(/_/g, "-");
  return (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-hans" ||
    normalized === "zh-tw" ||
    normalized === "zh-hant"
  );
}

/**
 * 批量商品文案任务的目标语言兜底：
 * 1. 用户显式说了目标语言，则优先采用用户要求；
 * 2. 若模型/旧逻辑给了中文，但用户本轮输入明显是英文，则纠偏回 en。
 */
export function detectProductImproveTargetLanguage(
  lastUserText: string,
  currentTargetLanguage?: string,
): string | null {
  const explicit = detectCommonTargetLanguage(lastUserText);
  if (explicit) return explicit;
  if (isChineseLanguageCode(currentTargetLanguage ?? "") && looksLikeEnglishUserInput(lastUserText)) {
    return "en";
  }
  return null;
}
