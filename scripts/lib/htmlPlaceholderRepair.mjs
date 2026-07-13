/**
 * HTML 占位符泄漏检测与修复（与 TypeScriptFrontend/worker htmlTranslate.ts 保持同步）。
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveNodeHtmlParser() {
  const candidates = [
    process.env.WORKER_ROOT?.trim(),
    resolve(__dirname, "../../../TypeScriptFrontend/worker"),
    resolve(__dirname, "../../worker"),
  ].filter(Boolean);

  for (const root of candidates) {
    const pkg = join(root, "node_modules", "node-html-parser");
    if (existsSync(pkg)) {
      const req = createRequire(join(root, "package.json"));
      return req("node-html-parser");
    }
  }

  try {
    const req = createRequire(join(process.cwd(), "package.json"));
    return req("node-html-parser");
  } catch {
    throw new Error(
      "未找到 node-html-parser。请设置 WORKER_ROOT 指向 TypeScriptFrontend/worker，或在该目录执行 npm install。",
    );
  }
}

const { parse, NodeType } = resolveNodeHtmlParser();

const BR_PLACEHOLDER = "⟦BR⟧";
const TEXT_PLACEHOLDER_PREFIX = "__HXLAT_";
const TEXT_PLACEHOLDER_SUFFIX = "__";

export const PLACEHOLDER_REPLACE_RES = [
  /__HXLAT_(\d+)__/g,
  /⟦T(\d+)⟧/g,
  /\x00T(\d+)\x00/g,
  /u0000T(\d+)u0000/g,
];

export const HTML_PLACEHOLDER_LEAK_RE =
  /__HXLAT_\d+__|⟦T\d+⟧|\x00T\d+\x00|u0000T\d+u0000/;

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

const HTML_PARSE_OPTIONS = {
  lowerCaseTagName: false,
  comment: false,
  blockTextElements: {
    script: true,
    noscript: true,
    style: true,
    pre: true,
  },
};

const SKIP_TAGS = new Set(["script", "style", "pre", "code", "noscript"]);
const TRANSLATABLE_ATTRS = ["alt", "title", "aria-label", "placeholder"];

/** 修复前门禁检查的属性（不含 placeholder）。 */
export const ATTR_CHECK_ATTRS = ["alt", "title", "aria-label"];

const ATTR_URL_RE = /^https?:\/\//;
const ATTR_HASH_FILENAME_RE =
  /^[a-fA-F0-9]{8,}(-[a-zA-Z0-9]+)*$|^\S+\.(jpg|jpeg|png|gif|bmp|webp|svg|mp4|pdf)$/i;

export function isHtmlContent(value) {
  return HTML_TAG_RE.test(value);
}

export function hasHtmlPlaceholderLeak(html) {
  return HTML_PLACEHOLDER_LEAK_RE.test(html);
}

/**
 * 检查 HTML 中 alt / title / aria-label 是否仍含占位符泄漏。
 * @returns {{ ok: boolean, issues: Array<{ attr: string, tag: string, value: string }> }}
 */
export function inspectHtmlAttrLeaks(html) {
  if (!html || typeof html !== "string" || !html.trim()) {
    return { ok: true, issues: [] };
  }

  const issues = [];
  try {
    const root = parse(html, HTML_PARSE_OPTIONS);
    for (const el of root.querySelectorAll("*")) {
      for (const attr of ATTR_CHECK_ATTRS) {
        const val = el.getAttribute(attr);
        if (val == null) continue;
        if (!hasHtmlPlaceholderLeak(val)) continue;
        issues.push({
          attr,
          tag: elementTagName(el) || "(unknown)",
          value: val,
        });
      }
    }
  } catch {
    // 解析失败时用正则兜底，避免漏检属性泄漏
    for (const attr of ATTR_CHECK_ATTRS) {
      const re = new RegExp(`${attr}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "gi");
      let match;
      while ((match = re.exec(html)) !== null) {
        const value = match[2] ?? "";
        if (!hasHtmlPlaceholderLeak(value)) continue;
        issues.push({ attr, tag: "(unparsed)", value });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/** 将属性异常格式化为可读摘要。 */
export function formatAttrIssues(issues) {
  if (!issues?.length) return "";
  return issues
    .map((i) => `<${i.tag} ${i.attr}="${String(i.value).slice(0, 120)}">`)
    .join("; ");
}

function textPlaceholder(idx) {
  return `${TEXT_PLACEHOLDER_PREFIX}${idx}${TEXT_PLACEHOLDER_SUFFIX}`;
}

function isTranslatableAttrValue(value) {
  const v = value.trim();
  if (!v) return false;
  if (ATTR_URL_RE.test(v)) return false;
  if (ATTR_HASH_FILENAME_RE.test(v)) return false;
  return true;
}

function preprocessHtmlForTranslation(html) {
  return html.replace(/<br\s*\/?>/gi, BR_PLACEHOLDER);
}

function elementTagName(el) {
  return (el.rawTagName ?? el.tagName ?? "").toLowerCase();
}

function extractHtmlTextNodes(html) {
  const texts = [];
  const root = parse(html, HTML_PARSE_OPTIONS);

  for (const el of root.querySelectorAll("*")) {
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (val == null || !isTranslatableAttrValue(val)) continue;
      const idx = texts.length;
      texts.push(val.trim());
      el.setAttribute(attr, textPlaceholder(idx));
    }
  }

  function walkTextNodes(node) {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const raw = node.rawText ?? "";
      if (!raw.trim()) return;
      const leading = raw.match(/^[\s\u00a0]*/)?.[0] ?? "";
      const trailing = raw.match(/[\s\u00a0]*$/)?.[0] ?? "";
      const core = raw.slice(leading.length, raw.length - trailing.length);
      if (!core.trim()) return;
      const idx = texts.length;
      texts.push(core.trim());
      node.rawText = `${leading}${textPlaceholder(idx)}${trailing}`;
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node;
    if (SKIP_TAGS.has(elementTagName(el))) return;
    for (const child of [...node.childNodes]) walkTextNodes(child);
  }

  for (const child of [...root.childNodes]) walkTextNodes(child);
  return { template: root.toString(), texts };
}

function replacePlaceholdersInString(value, translations) {
  let out = value;
  for (const re of PLACEHOLDER_REPLACE_RES) {
    re.lastIndex = 0;
    out = out.replace(re, (_, idx) => translations[Number(idx)] ?? "");
  }
  return out;
}

function restoreHtmlTextNodes(template, translations) {
  const root = parse(template, HTML_PARSE_OPTIONS);

  for (const el of root.querySelectorAll("*")) {
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (val == null || !HTML_PLACEHOLDER_LEAK_RE.test(val)) continue;
      const restored = replacePlaceholdersInString(val, translations);
      if (restored !== val) el.setAttribute(attr, restored);
    }
  }

  function walkRestore(node) {
    if (node.nodeType === NodeType.TEXT_NODE) {
      const raw = node.rawText ?? "";
      if (!HTML_PLACEHOLDER_LEAK_RE.test(raw)) return;
      node.rawText = replacePlaceholdersInString(raw, translations);
      return;
    }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return;
    const el = node;
    if (SKIP_TAGS.has(elementTagName(el))) return;
    for (const child of [...node.childNodes]) walkRestore(child);
  }

  for (const child of [...root.childNodes]) walkRestore(child);

  let result = root.toString();
  if (hasHtmlPlaceholderLeak(result)) {
    result = replacePlaceholdersInString(result, translations);
  }
  return result;
}

function restoreBrPlaceholders(html) {
  return html.replaceAll(BR_PLACEHOLDER, "<br />");
}

/** 从原文 HTML 提取可翻译单元（与翻译 worker 顺序一致）。 */
export function extractHtmlTextUnits(originalHtml) {
  const { texts } = extractHtmlTextNodes(preprocessHtmlForTranslation(originalHtml));
  return texts;
}

/** 统计泄漏占位符数量。 */
export function countPlaceholderLeaks(html) {
  let count = 0;
  for (const re of PLACEHOLDER_REPLACE_RES) {
    re.lastIndex = 0;
    const matches = html.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * 修复 translatedHtml 中未还原的占位符。
 * @param {string} originalHtml 源 HTML
 * @param {string} translatedHtml 含占位符的译文 HTML
 * @param {(sourceText: string, index: number) => Promise<string|null>} resolveTranslation 按索引查缓存译文
 */
export async function repairHtmlPlaceholderLeaks(
  originalHtml,
  translatedHtml,
  resolveTranslation,
) {
  if (!hasHtmlPlaceholderLeak(translatedHtml)) {
    return { fixed: translatedHtml, changed: false, units: 0, cacheHits: 0, fallbacks: 0 };
  }

  const units = extractHtmlTextUnits(originalHtml);
  const translations = [];
  let cacheHits = 0;
  let fallbacks = 0;

  for (let i = 0; i < units.length; i++) {
    const sourceText = units[i];
    const cached = await resolveTranslation(sourceText, i);
    if (cached != null && cached !== "" && !hasHtmlPlaceholderLeak(cached)) {
      translations[i] = cached;
      cacheHits++;
    } else {
      translations[i] = sourceText;
      fallbacks++;
    }
  }

  const fixed = restoreBrPlaceholders(restoreHtmlTextNodes(translatedHtml, translations));
  const changed = fixed !== translatedHtml;
  const stillLeaking = hasHtmlPlaceholderLeak(fixed);

  return {
    fixed: stillLeaking ? translatedHtml : fixed,
    changed: changed && !stillLeaking,
    units: units.length,
    cacheHits,
    fallbacks,
    stillLeaking,
  };
}
