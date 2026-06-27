/** Translation output quality checks — shared by worker batch and TSF single translate. */

const LATIN_WORD_RE = /[a-zA-Z]{2,}/;
const CJK_RE = /[一-鿿㐀-䶿]/u;

function hasLatinWords(text: string): boolean {
  return LATIN_WORD_RE.test(text);
}

function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

function targetLangCode(target: string): string {
  return target.toLowerCase().split(/[-_]/)[0] ?? target.toLowerCase();
}

function hasTargetScriptChars(text: string, targetLang: string): boolean {
  switch (targetLang) {
    case "zh":
      return /[一-鿿㐀-䶿]/u.test(text);
    case "ja":
      return /[ぁ-ゖァ-ヶ一-鿿]/u.test(text);
    case "ko":
      return /[가-힣ᄀ-ᇿ]/u.test(text);
    case "ar":
      return /[؀-ۿ]/u.test(text);
    case "ru":
    case "uk":
    case "bg":
      return /[Ѐ-ӿ]/u.test(text);
    case "th":
      return /[฀-๿]/u.test(text);
    case "hi":
    case "mr":
    case "ne":
      return /[ऀ-ॿ]/u.test(text);
    default:
      return false;
  }
}

export function looksLikeUntranslated(
  source: string,
  translated: string,
  target: string,
): boolean {
  const tl = targetLangCode(target);
  if (tl === "en") return false;

  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const src = norm(source);
  const tr = norm(translated);
  if (!src || !tr) return false;

  if (src === tr && hasLatinWords(src)) return true;

  if (["zh", "ja", "ko"].includes(tl) && src.length > 40 && hasLatinWords(src)) {
    const latinChars = src.match(/[a-zA-Z]/g)?.length ?? 0;
    if (latinChars / src.length > 0.45 && !hasTargetScriptChars(tr, tl)) {
      return true;
    }
  }
  return false;
}

/** CJK leaked into a non-CJK target when the source leaf had none. */
export function looksLikeWrongScriptLeak(
  source: string,
  translated: string,
  target: string,
): boolean {
  const tl = targetLangCode(target);
  if (["zh", "ja", "ko"].includes(tl)) return false;
  return hasCjk(translated) && !hasCjk(source);
}

/** LLM invented content for an empty source leaf (e.g. empty description → "S3"). */
export function looksLikeEmptySourceHallucination(source: string, translated: string): boolean {
  if (source.trim() !== "") return false;
  return translated.trim() !== "";
}

/** Model echoed the prompt's "number" wording instead of preserving ⟦N⟧ sentinels. */
export function hasPromptSentinelLeakage(text: string): boolean {
  return /\[number\]/i.test(text);
}

/** Glossary target must not inject CJK into non-CJK locales unless source already has CJK. */
export function glossaryTargetMatchesLocale(
  targetText: string,
  sourceText: string,
  target: string,
): boolean {
  const tl = targetLangCode(target);
  if (["zh", "ja", "ko"].includes(tl)) return true;
  if (hasCjk(targetText) && !hasCjk(sourceText)) return false;
  return true;
}

export function isTranslatableLeafText(text: string): boolean {
  return text.trim().length > 0;
}
