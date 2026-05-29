import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for LLM translation");
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

export type TranslateItem = {
  key: string;
  value: string;
  digest: string;
};

export type TranslateResult = {
  key: string;
  translatedValue: string;
  digest: string;
};

// ─── Field classification ──────────────────────────────────────────────────────

// These fields must not be translated (Shopify uses them as URL segments)
const SKIP_KEYS = new Set(["handle"]);
// These fields contain HTML content
const HTML_KEYS = new Set(["body_html", "summary_html", "content"]);

export function classifyField(key: string): "skip" | "html" | "plain" {
  if (SKIP_KEYS.has(key)) return "skip";
  if (HTML_KEYS.has(key) || key.endsWith("_html")) return "html";
  return "plain";
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Max total chars sent to the translation API in one request
const MAX_CHARS_PER_BATCH = 5000;
// Plain text items longer than this get split before translation
const LONG_TEXT_THRESHOLD = 4000;
const LONG_TEXT_CHUNK_CHARS = 3500;

// ─── HTML text-node extraction ────────────────────────────────────────────────

// Tags whose content we never translate
const SKIP_BLOCK_RE = /<(script|style|pre|code)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;

/**
 * Replaces every visible text node in an HTML string with a numeric placeholder.
 * Returns the rewritten template and the ordered array of extracted texts.
 * Whitespace-only gaps between tags are left in place.
 */
function extractHtmlTextNodes(html: string): { template: string; texts: string[] } {
  const texts: string[] = [];
  const skipped = new Map<string, string>();
  let sIdx = 0;

  // Protect non-translatable blocks
  const withSkips = html.replace(SKIP_BLOCK_RE, (match) => {
    const key = `\x00S${sIdx++}\x00`;
    skipped.set(key, match);
    return key;
  });

  // Replace each text node between tags with an indexed marker
  const template = withSkips.replace(/>([^<]+)</g, (_match, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return `>${raw}<`;
    const idx = texts.length;
    texts.push(trimmed);
    // Preserve leading/trailing whitespace around the marker
    const start = raw.indexOf(trimmed);
    const end = start + trimmed.length;
    return `>${raw.slice(0, start)}\x00T${idx}\x00${raw.slice(end)}<`;
  });

  // Restore skipped blocks
  let out = template;
  for (const [k, v] of skipped) out = out.replaceAll(k, v);
  return { template: out, texts };
}

function restoreHtmlTextNodes(template: string, translations: string[]): string {
  return template.replace(/\x00T(\d+)\x00/g, (_, idx) => translations[Number(idx)] ?? "");
}

// ─── Plain text splitting ─────────────────────────────────────────────────────

/**
 * Splits a long plain-text string into chunks at natural boundaries
 * (paragraphs → sentences → words). Parts can be joined with "" after translation.
 */
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

// ─── Char-based batching ──────────────────────────────────────────────────────

function batchByChars(items: TranslateItem[], maxChars: number): TranslateItem[][] {
  const batches: TranslateItem[][] = [];
  let current: TranslateItem[] = [];
  let currentChars = 0;

  for (const item of items) {
    const len = item.value.length;
    if (current.length > 0 && currentChars + len > maxChars) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += len;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

// ─── Google Translate engine ──────────────────────────────────────────────────

async function callGoogleTranslate(
  texts: string[],
  source: string,
  target: string,
  format: "html" | "text",
): Promise<string[]> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!apiKey) throw new Error("GOOGLE_TRANSLATE_API_KEY is required");

  const resp = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source, target, format }),
    },
  );

  if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as {
    data: { translations: Array<{ translatedText: string }> };
  };
  return data.data.translations.map((t) => t.translatedText);
}

/**
 * Translate an HTML field with Google Translate.
 * Short HTML: sent as-is with format:"html" so Google preserves tags natively.
 * Long HTML: text nodes are extracted, batched, translated, then restored.
 * This keeps each extracted node well under Google's per-string char limit.
 */
async function translateHtmlGoogle(html: string, source: string, target: string): Promise<string> {
  if (html.length <= LONG_TEXT_THRESHOLD) {
    const [result] = await callGoogleTranslate([html], source, target, "html");
    return result ?? html;
  }

  // For long HTML, extract text nodes and translate them individually
  const { template, texts } = extractHtmlTextNodes(html);
  if (texts.length === 0) return html;

  const items: TranslateItem[] = texts.map((t, i) => ({ key: String(i), value: t, digest: "" }));
  const batches = batchByChars(items, MAX_CHARS_PER_BATCH);
  const translated = new Array<string>(texts.length).fill("");

  for (const batch of batches) {
    const results = await callGoogleTranslate(batch.map((b) => b.value), source, target, "text");
    batch.forEach((b, i) => {
      translated[Number(b.key)] = results[i] ?? b.value;
    });
  }

  return restoreHtmlTextNodes(template, translated);
}

// ─── LLM (OpenAI) engine ──────────────────────────────────────────────────────

/**
 * Translate an HTML field with an LLM.
 * Text nodes are extracted from the HTML, sent to the LLM as plain text batches,
 * then restored into the original HTML structure.
 */
async function translateHtmlLLM(html: string, source: string, target: string, aiModel: string): Promise<string> {
  const { template, texts } = extractHtmlTextNodes(html);
  if (texts.length === 0) return html;

  const items: TranslateItem[] = texts.map((t, i) => ({ key: String(i), value: t, digest: "" }));
  const batches = batchByChars(items, MAX_CHARS_PER_BATCH);
  const translated = new Array<string>(texts.length).fill("");

  for (const batch of batches) {
    const results = await callLLM(batch, source, target, aiModel);
    for (const r of results) translated[Number(r.key)] = r.translatedValue;
  }

  return restoreHtmlTextNodes(template, translated);
}

async function callLLM(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
): Promise<TranslateResult[]> {
  const payload = items.map((i) => ({ key: i.key, value: i.value }));
  const prompt = `You are a professional e-commerce translator.
Translate from "${source}" to "${target}".
Return a JSON object: {"translations": [{"key": "<original key>", "translatedValue": "<translated>"}]}.
Rules:
- Be accurate and natural for e-commerce
- If the value is empty, return it unchanged

Input:
${JSON.stringify(payload)}

Return ONLY the JSON object, no markdown.`;

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: aiModel || "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Array<{ key: string; translatedValue: string }> = [];
  try {
    const obj = JSON.parse(raw) as { translations?: unknown };
    parsed = Array.isArray(obj.translations) ? (obj.translations as typeof parsed) : [];
  } catch {
    console.warn("[llm] failed to parse response, using originals");
  }

  const resultMap = new Map(parsed.map((r) => [r.key, r.translatedValue]));
  return items.map((item) => ({
    key: item.key,
    translatedValue: resultMap.get(item.key) ?? item.value,
    digest: item.digest,
  }));
}

// ─── Main exported function ────────────────────────────────────────────────────

/**
 * Translate all fields for one Shopify resource.
 *
 * - skip fields (handle): returned as-is
 * - html fields: text nodes extracted → batched → translated → HTML reconstructed
 * - plain fields: long values split at sentence/paragraph boundaries, batched by char count
 *
 * Engine routing: aiModel="google-translate" → Google Translate API; anything else → OpenAI.
 */
export async function translateBatch(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
  testMode: boolean,
): Promise<TranslateResult[]> {
  if (testMode) {
    return items.map((item) => ({ key: item.key, translatedValue: `${item.value} - test`, digest: item.digest }));
  }

  const resultMap = new Map<string, TranslateResult>();
  const envModel = process.env.TRANSLATION_AI_MODEL?.trim();
  const usedModel = envModel || aiModel;
  const isGoogle = usedModel === "google-translate";

  // 1. Skip fields
  for (const item of items) {
    if (classifyField(item.key) === "skip") {
      resultMap.set(item.key, { key: item.key, translatedValue: item.value, digest: item.digest });
    }
  }

  // 2. HTML fields — each translated individually with node-level batching
  for (const item of items.filter((i) => classifyField(i.key) === "html")) {
    try {
      const translatedValue = isGoogle
        ? await translateHtmlGoogle(item.value, source, target)
        : await translateHtmlLLM(item.value, source, target, aiModel);
      resultMap.set(item.key, { key: item.key, translatedValue, digest: item.digest });
    } catch (e) {
      console.warn(`[translate] html field "${item.key}" failed, using original`, e);
      resultMap.set(item.key, { key: item.key, translatedValue: item.value, digest: item.digest });
    }
  }

  // 3. Plain text fields — split long values, batch by char count
  const plainItems = items.filter((i) => classifyField(i.key) === "plain");
  if (plainItems.length > 0) {
    // Expand long items into numbered parts
    type Part = { internalKey: string; originalKey: string; value: string; digest: string; idx: number; total: number };
    const expanded: Part[] = [];
    for (const item of plainItems) {
      const parts = splitPlainText(item.value);
      parts.forEach((part, idx) =>
        expanded.push({
          internalKey: parts.length > 1 ? `${item.key}::${idx}` : item.key,
          originalKey: item.key,
          value: part,
          digest: item.digest,
          idx,
          total: parts.length,
        }),
      );
    }

    const batchItems: TranslateItem[] = expanded.map((p) => ({ key: p.internalKey, value: p.value, digest: p.digest }));
    const batches = batchByChars(batchItems, MAX_CHARS_PER_BATCH);
    const translatedParts = new Map<string, string>();

    for (const batch of batches) {
      try {
        let results: TranslateResult[];
        if (isGoogle) {
          const translated = await callGoogleTranslate(batch.map((b) => b.value), source, target, "text");
          results = batch.map((b, i) => ({ key: b.key, translatedValue: translated[i] ?? b.value, digest: b.digest }));
        } else {
          results = await callLLM(batch, source, target, aiModel);
        }
        for (const r of results) translatedParts.set(r.key, r.translatedValue);
      } catch (e) {
        console.warn("[translate] plain batch failed, using originals", e);
        for (const b of batch) translatedParts.set(b.key, b.value);
      }
    }

    // Rejoin split parts and write to resultMap
    const partsByOriginal = new Map<string, Part[]>();
    for (const p of expanded) {
      const list = partsByOriginal.get(p.originalKey) ?? [];
      list.push(p);
      partsByOriginal.set(p.originalKey, list);
    }

    for (const [originalKey, parts] of partsByOriginal) {
      const originalItem = plainItems.find((i) => i.key === originalKey)!;
      const sorted = parts.sort((a, b) => a.idx - b.idx);
      const translatedValue = sorted.map((p) => translatedParts.get(p.internalKey) ?? p.value).join("");
      resultMap.set(originalKey, { key: originalKey, translatedValue, digest: originalItem.digest });
    }
  }

  return items.map(
    (item) => resultMap.get(item.key) ?? { key: item.key, translatedValue: item.value, digest: item.digest },
  );
}
