/**
 * HTML text-node extraction and reassembly for translation.
 * Parser-based (node-html-parser), aligned with Spring HtmlTranslateStrategyService + Jsoup.
 * Keep in sync with TypeScriptFrontend/app/server/translateV4/htmlTranslate.server.ts
 */

import { parse, HTMLElement, NodeType, type Node } from "node-html-parser";
import { isHtmlContent } from "./htmlContent.js";

export { isHtmlContent };

const LONG_TEXT_THRESHOLD = Math.max(
  500,
  Number(process.env.TRANSLATE_LONG_TEXT_THRESHOLD) || 3_000,
);
const LONG_TEXT_CHUNK_CHARS = Math.max(
  400,
  Number(process.env.TRANSLATE_LONG_TEXT_CHUNK_CHARS) || 2_500,
);

const ATTR_URL_RE = /^https?:\/\//;
const ATTR_HASH_FILENAME_RE =
  /^[a-fA-F0-9]{8,}(-[a-zA-Z0-9]+)*$|^\S+\.(jpg|jpeg|png|gif|bmp|webp|svg|mp4|pdf)$/i;

const BR_PLACEHOLDER = "⟦BR⟧";
const HTML_BLOCK_COALESCE_TAGS = "p|li|h[1-6]|dt|dd|blockquote|figcaption";
const HTML_NESTED_BLOCK_RE =
  /<(p|li|h[1-6]|td|th|dt|dd|blockquote|figcaption|div|ul|ol|table|thead|tbody|tr)\b/i;
const HTML_TABLE_RE = /<table\b[\s\S]*?<\/table>/gi;
const INLINE_PRESERVE_RE = /<(a|strong|b|em|i|u)\b/i;

const SKIP_TAGS = new Set(["script", "style", "pre", "code", "noscript"]);
const TRANSLATABLE_ATTRS = ["alt", "title", "aria-label", "placeholder"] as const;

function isTranslatableAttrValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (ATTR_URL_RE.test(v)) return false;
  if (ATTR_HASH_FILENAME_RE.test(v)) return false;
  return true;
}

function preprocessHtmlForTranslation(html: string): string {
  let s = html.replace(/<br\s*\/?>/gi, BR_PLACEHOLDER);
  s = s.replace(/<\/?(?:span|mark|small|sub|sup|label|font)(?:\s[^>]*)?>/gi, "");
  return s;
}

export function restoreBrPlaceholders(html: string): string {
  return html.replaceAll(BR_PLACEHOLDER, "<br />");
}

export function effectiveTranslation(original: string, translated: string | undefined): string {
  if (translated === undefined) return original;
  if (original.trim() !== "" && translated.trim() === "") return original;
  return translated;
}

function elementTagName(el: HTMLElement): string {
  return (el.rawTagName ?? el.tagName ?? "").toLowerCase();
}

/** DOM walk — same idea as Jsoup doc.getAllElements() + textNodes(), skipping script/style. */
function extractHtmlTextNodes(html: string): { template: string; texts: string[] } {
  const texts: string[] = [];
  const root = parse(html, {
    lowerCaseTagName: false,
    comment: false,
    voidTag: {
      area: true,
      base: true,
      br: true,
      col: true,
      embed: true,
      hr: true,
      img: true,
      input: true,
      link: true,
      meta: true,
      param: true,
      source: true,
      track: true,
      wbr: true,
    },
    blockTextElements: {
      script: true,
      noscript: true,
      style: true,
      pre: true,
    },
  });

  for (const el of root.querySelectorAll("*")) {
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (val == null || !isTranslatableAttrValue(val)) continue;
      const idx = texts.length;
      texts.push(val.trim());
      el.setAttribute(attr, `\x00T${idx}\x00`);
    }
  }

  function walkTextNodes(node: Node): void {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const raw = node.rawText ?? "";
      if (!raw.trim()) return;
      const leading = raw.match(/^[\s\u00a0]*/)?.[0] ?? "";
      const trailing = raw.match(/[\s\u00a0]*$/)?.[0] ?? "";
      const core = raw.slice(leading.length, raw.length - trailing.length);
      if (!core.trim()) return;
      const idx = texts.length;
      texts.push(core.trim());
      node.rawText = `${leading}\x00T${idx}\x00${trailing}`;
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (SKIP_TAGS.has(elementTagName(el))) return;
    for (const child of [...node.childNodes]) {
      walkTextNodes(child);
    }
  }

  for (const child of [...root.childNodes]) {
    walkTextNodes(child);
  }

  return { template: root.toString(), texts };
}

export function restoreHtmlTextNodes(template: string, translations: string[]): string {
  return template.replace(/\x00T(\d+)\x00/g, (_, idx) => translations[Number(idx)] ?? "");
}

export function sanitizeHtmlTextTranslation(original: string, translated: string): string {
  if (!translated.includes("<")) return translated;
  const stripped = translated
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return original;
  return stripped;
}

function coalesceBlockTextNodesInner(
  template: string,
  texts: string[],
  newTexts: string[],
): { template: string; texts: string[] } {
  const blockRe = new RegExp(
    `<(${HTML_BLOCK_COALESCE_TAGS})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "gi",
  );

  const newTemplate = template.replace(blockRe, (full, tag: string, inner: string) => {
    if (HTML_NESTED_BLOCK_RE.test(inner)) return full;

    const indices: number[] = [];
    inner.replace(/\x00T(\d+)\x00/g, (_, idx: string) => {
      indices.push(Number(idx));
      return "";
    });
    if (indices.length <= 1) return full;
    if (INLINE_PRESERVE_RE.test(inner)) return full;

    const merged = indices
      .map((i) => texts[i])
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const newIdx = newTexts.length;
    newTexts.push(merged);

    const openTag = full.match(new RegExp(`<${tag}\\b[^>]*>`, "i"))![0];
    return `${openTag}\x00T${newIdx}\x00</${tag}>`;
  });

  return { template: newTemplate, texts: newTexts };
}

function coalesceBlockTextNodes(
  template: string,
  texts: string[],
): { template: string; texts: string[] } {
  const newTexts = [...texts];
  if (!HTML_TABLE_RE.test(template)) {
    return coalesceBlockTextNodesInner(template, texts, newTexts);
  }

  HTML_TABLE_RE.lastIndex = 0;
  let out = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = HTML_TABLE_RE.exec(template)) !== null) {
    if (m.index > cursor) {
      const seg = coalesceBlockTextNodesInner(template.slice(cursor, m.index), texts, newTexts);
      out += seg.template;
    }
    out += m[0];
    cursor = m.index + m[0].length;
  }
  if (cursor < template.length) {
    const seg = coalesceBlockTextNodesInner(template.slice(cursor), texts, newTexts);
    out += seg.template;
  }
  return { template: out, texts: newTexts };
}

function splitPlainText(text: string): string[] {
  if (text.length <= LONG_TEXT_THRESHOLD) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > LONG_TEXT_CHUNK_CHARS) {
    let splitIdx = -1;

    const paraIdx = remaining.lastIndexOf("\n\n", LONG_TEXT_CHUNK_CHARS);
    if (paraIdx >= LONG_TEXT_CHUNK_CHARS * 0.4) splitIdx = paraIdx + 2;

    if (splitIdx < 0) {
      const sentIdx = remaining.lastIndexOf(". ", LONG_TEXT_CHUNK_CHARS);
      if (sentIdx >= LONG_TEXT_CHUNK_CHARS * 0.4) splitIdx = sentIdx + 2;
    }

    if (splitIdx <= 0) {
      const wordIdx = remaining.lastIndexOf(" ", LONG_TEXT_CHUNK_CHARS);
      splitIdx = wordIdx > 0 ? wordIdx : LONG_TEXT_CHUNK_CHARS;
    }

    parts.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }

  if (remaining.length > 0) parts.push(remaining);
  return parts;
}

export type HtmlNodePlan = { template: string; nodeParts: string[][] };

/** Split HTML into a structural template and translatable text-node parts. */
export function htmlNodePartsOf(value: string): HtmlNodePlan {
  let { template, texts } = extractHtmlTextNodes(preprocessHtmlForTranslation(value));
  ({ template, texts } = coalesceBlockTextNodes(template, texts));
  const nodeParts = texts.map((t) =>
    t.length > LONG_TEXT_THRESHOLD ? splitPlainText(t) : [t],
  );
  return { template, nodeParts };
}

/**
 * True when HTML contains translatable text outside script/style/pre/code blocks.
 * Script-only embeds (e.g. Loox widget snippets) return false.
 */
export function isTranslatableHtmlContent(value: string): boolean {
  if (!isHtmlContent(value)) return false;
  const { nodeParts } = htmlNodePartsOf(value);
  return nodeParts.some((parts) => parts.some((p) => p.trim().length > 0));
}

/** Flatten node parts to per-marker translations for reassembly. */
export function flattenHtmlNodeTranslations(
  nodeParts: string[][],
  translatePart: (part: string, partIndex: number) => string,
): string[] {
  let partIndex = 0;
  return nodeParts.map((parts) => {
    const pieces = parts.map((part) => {
      const translated = translatePart(part, partIndex++);
      return effectiveTranslation(part, sanitizeHtmlTextTranslation(part, translated));
    });
    const joined = pieces.join("");
    return effectiveTranslation(parts.join(""), joined.trim());
  });
}

/** Reassemble translated text nodes back into HTML. */
export function reassembleHtmlTranslation(template: string, nodeTranslations: string[]): string {
  return restoreBrPlaceholders(restoreHtmlTextNodes(template, nodeTranslations));
}

/** Round-trip helper for tests. */
export function roundtripHtmlForTest(
  html: string,
  translateFn: (text: string, index: number) => string,
): string {
  const { template, nodeParts } = htmlNodePartsOf(html);
  const out = flattenHtmlNodeTranslations(nodeParts, (text, i) => translateFn(text, i));
  return reassembleHtmlTranslation(template, out);
}
