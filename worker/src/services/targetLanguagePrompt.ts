/**
 * Target-language-specific prompt blocks for translation quality.
 * Keep in sync with TypeScriptFrontend/app/server/translateV4/targetLanguagePrompt.server.ts
 */

function targetLangCode(target: string): string {
  return target.toLowerCase().split(/[-_]/)[0] ?? target.toLowerCase();
}

export function buildTargetLanguageBlock(target: string): string {
  const tl = targetLangCode(target);
  if (tl === "ar") {
    return `
Arabic (${target}) requirements:
- Write the entire value in natural right-to-left Arabic word order. Do not keep English/Latin prefixes (section numbers, brand names, labels) at the start while translating only the remainder into Arabic.
- Example: "II. ChessboArt Craftsmanship & Aesthetics: A Visual Journey" → "ثانيًا: حرفية وجماليات تشيسبو آرت: رحلة بصرية" (localize Roman numerals, transliterate brand names into Arabic script, full Arabic sentence structure).
- Preserve ⟦N⟧ URL/path sentinels exactly; place them naturally within the Arabic sentence.
- Technical terms without glossary entries may stay in Latin when embedded mid-sentence, but never leave a Latin-only prefix on an otherwise Arabic line.`;
  }
  if (tl === "he") {
    return `
Hebrew (${target}) requirements:
- Use natural right-to-left Hebrew word order for the entire value. Do not keep English/Latin prefixes at the start while translating only the rest into Hebrew.
- Preserve ⟦N⟧ URL/path sentinels exactly within the Hebrew sentence.`;
  }
  if (tl === "fa") {
    return `
Persian (${target}) requirements:
- Use natural right-to-left Persian word order for the entire value. Do not keep English/Latin prefixes at the start while translating only the rest into Persian.
- Preserve ⟦N⟧ URL/path sentinels exactly within the Persian sentence.`;
  }
  return "";
}
