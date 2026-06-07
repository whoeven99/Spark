import OpenAI, { AzureOpenAI } from "openai";
import { tmGet, tmGetByValue, tmSet, tmSetByValue } from "./translationMemory.js";
import { loadGlossaryLines } from "./glossary.js";

let _openai: OpenAI | null = null;

type Provider = "google" | "deepseek" | "azure" | "openai";

/**
 * Resolves the translation engine. `TRANSLATION_AI_MODEL` is an explicit selector:
 *   - "google-translate" → Google Translate (machine translation, not LLM)
 *   - "deepseek"         → DeepSeek
 *   - "azure"            → Azure OpenAI
 *   - "" (unset)         → auto-detect by env presence: DeepSeek → Azure → OpenAI
 *   - any other value    → OpenAI, using that string as the model id
 */
function resolveProvider(aiModel?: string): Provider {
  const envSel = process.env.TRANSLATION_AI_MODEL?.trim().toLowerCase();
  // Env override wins; otherwise the job's own aiModel can name an engine.
  const sel = envSel || aiModel?.trim().toLowerCase() || "";
  if (sel === "google-translate") return "google";
  if (sel === "deepseek") return "deepseek";
  if (sel === "azure") return "azure";
  // No explicit engine selected → auto-detect by configured credentials.
  if (!envSel) {
    if (process.env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
    if (process.env.AZURE_OPENAI_ENDPOINT?.trim()) return "azure";
  }
  return "openai";
}

/** Returns an OpenAI-compatible client for the active LLM provider. */
function getOpenAI(): OpenAI {
  if (_openai) return _openai;

  const provider = resolveProvider();

  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for DeepSeek translation");
    const baseURL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com/v1";
    _openai = new OpenAI({ apiKey, baseURL });
    return _openai;
  }

  if (provider === "azure") {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
    const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() || "2024-08-01-preview";
    if (!endpoint) throw new Error("AZURE_OPENAI_ENDPOINT is required for Azure OpenAI translation");
    if (!apiKey) throw new Error("AZURE_OPENAI_API_KEY is required for Azure OpenAI translation");
    if (!deployment) throw new Error("AZURE_OPENAI_DEPLOYMENT is required for Azure OpenAI translation");
    _openai = new AzureOpenAI({ endpoint, apiKey, deployment, apiVersion });
    return _openai;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for LLM translation");
  _openai = new OpenAI({ apiKey });
  return _openai;
}

/**
 * The model id to send, matching the active provider:
 * DeepSeek → DEEPSEEK_MODEL, Azure → deployment name, OpenAI → job's aiModel.
 */
function resolveModel(aiModel: string): string {
  switch (resolveProvider()) {
    case "deepseek":
      return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
    case "azure":
      return process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || aiModel || "gpt-4o-mini";
    default:
      return aiModel || "gpt-4o-mini";
  }
}

// ─── Engine router ──────────────────────────────────────────────────────────────
//
// Two engine *families*: "llm" (DeepSeek/Azure/OpenAI, chosen by resolveProvider)
// and "google" (Google Translate). When TRANSLATION_AI_MODEL forces one, that one
// is used for everything. Otherwise cost-tiered routing applies: cheap/short
// fields prefer Google, rich content prefers the LLM, with cross-engine fallback.

type Engine = "llm" | "google";

function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_TRANSLATE_API_KEY?.trim());
}

function llmConfigured(): boolean {
  return Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() ||
      process.env.AZURE_OPENAI_ENDPOINT?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  );
}

/** A single forced engine family, or null when auto-routing should apply. */
function forcedEngine(aiModel?: string): Engine | null {
  const env = process.env.TRANSLATION_AI_MODEL?.trim().toLowerCase();
  if (env) return env === "google-translate" ? "google" : "llm";
  // Env unset → route, except a legacy job-level google-translate request.
  if (aiModel?.trim().toLowerCase() === "google-translate") return "google";
  return null;
}

// Plain fields at or above this length are treated as "rich" content.
const SHORT_PLAIN_THRESHOLD = 80;

function fieldTier(key: string, value: string, klass: "skip" | "html" | "plain"): "trivial" | "rich" {
  if (klass === "html") return "rich";
  if (key === "meta_description") return "rich";
  return value.length >= SHORT_PLAIN_THRESHOLD ? "rich" : "trivial";
}

/** Ordered engine candidates for a tier (primary first, then fallback). */
function engineOrderFor(tier: "trivial" | "rich", aiModel?: string): Engine[] {
  const forced = forcedEngine(aiModel);
  if (forced) return [forced];

  const g = googleConfigured();
  const l = llmConfigured();
  const order: Engine[] = [];
  if (tier === "trivial") {
    if (g) order.push("google");
    if (l) order.push("llm");
  } else {
    if (l) order.push("llm");
    if (g) order.push("google");
  }
  // Always have at least one candidate.
  if (order.length === 0) order.push(l ? "llm" : "google");
  return order;
}

/** The model/label recorded for a chosen engine (used for TM cache + Cosmos). */
function engineModel(engine: Engine, aiModel: string): string {
  return engine === "google" ? "google-translate" : resolveModel(aiModel);
}

/**
 * The engine actually used for a job — real data for Cosmos. With routing on, it
 * reports "auto" plus the configured engines; when forced, the single engine.
 */
export function resolveEngine(aiModel: string): { provider: string; model: string } {
  const forced = forcedEngine(aiModel);
  if (forced === "google") return { provider: "google", model: "google-translate" };
  if (forced === "llm") return { provider: resolveProvider(), model: resolveModel(aiModel) };
  const parts: string[] = [];
  if (googleConfigured()) parts.push("google");
  if (llmConfigured()) parts.push(resolveModel(aiModel));
  return { provider: "auto", model: parts.length ? `auto(${parts.join("+")})` : "none" };
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
  /** "translated" = produced by the engine; "fallback" = engine failed, original text returned. */
  status: "translated" | "fallback";
};

// ─── Field classification ──────────────────────────────────────────────────────

// These fields must not be translated (Shopify uses them as URL segments)
const SKIP_KEYS = new Set(["handle"]);

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

function isHtml(value: string): boolean {
  return HTML_TAG_RE.test(value);
}

export function classifyField(key: string, value?: string): "skip" | "html" | "plain" {
  if (SKIP_KEYS.has(key)) return "skip";
  if (value !== undefined && isHtml(value)) return "html";
  return "plain";
}

/**
 * Number of translation units (nodes) a field expands into: HTML → text-node
 * count, plain → split-part count, skip → 0. Used for node-level progress so the
 * total computed at init matches what translate processes.
 */
export function countFieldUnits(key: string, value: string): number {
  const klass = classifyField(key, value);
  if (klass === "skip") return 0;
  if (klass === "html") return extractHtmlTextNodes(value).texts.length;
  return splitPlainText(value).length;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Max total chars sent to the translation API in one request.
// Override via TRANSLATE_MAX_CHARS_PER_BATCH env var (default 12000).
const MAX_CHARS_PER_BATCH = Math.max(
  500,
  Number(process.env.TRANSLATE_MAX_CHARS_PER_BATCH) || 12_000,
);
// How many batches within a pool may run concurrently.
// Override via TRANSLATE_BATCH_CONCURRENCY env var (default 3).
const BATCH_CONCURRENCY = Math.max(1, Number(process.env.TRANSLATE_BATCH_CONCURRENCY) || 3);

// Plain text items longer than this get split before translation
const LONG_TEXT_THRESHOLD = 4000;
const LONG_TEXT_CHUNK_CHARS = 3500;

// ─── Concurrency helper ───────────────────────────────────────────────────────

/**
 * Run `fn` over `items` with at most `concurrency` tasks in-flight at a time.
 * Preserves ordering in the returned array. Exported so translateWorker can
 * reuse it for chunk-level parallelism.
 */
export async function pAll<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  if (concurrency <= 1) return Promise.all(items.map((item, i) => fn(item, i)));
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ─── HTML text-node extraction ────────────────────────────────────────────────

// Tags whose content we never translate
const SKIP_BLOCK_RE = /<(script|style|pre|code)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;

// Attributes that carry user-visible text and should be translated.
// Handles both double-quoted (common) and single-quoted attribute values.
const TRANSLATABLE_ATTR_RE = /\b(alt|title|aria-label|placeholder)=("([^"]*)"|(\'([^\']*)\'))/g;

// Attr values we must NOT translate
const ATTR_URL_RE = /^https?:\/\//;
// Hash-based filenames like "7910ff297e4-Max-Origin" or bare image filenames
const ATTR_HASH_FILENAME_RE =
  /^[a-fA-F0-9]{8,}(-[a-zA-Z0-9]+)*$|^\S+\.(jpg|jpeg|png|gif|bmp|webp|svg|mp4|pdf)$/i;

function isTranslatableAttrValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (ATTR_URL_RE.test(v)) return false;
  if (ATTR_HASH_FILENAME_RE.test(v)) return false;
  return true;
}

/**
 * Replaces every visible text node AND translatable attribute values (alt, title,
 * aria-label, placeholder) in an HTML string with numeric placeholders.
 * Returns the rewritten template and the ordered array of extracted texts.
 * Whitespace-only gaps between tags are left in place.
 */
function extractHtmlTextNodes(html: string): { template: string; texts: string[] } {
  const texts: string[] = [];
  const skipped = new Map<string, string>();
  let sIdx = 0;

  // Protect non-translatable blocks (script/style/pre/code)
  const withSkips = html.replace(SKIP_BLOCK_RE, (match) => {
    const key = `\x00S${sIdx++}\x00`;
    skipped.set(key, match);
    return key;
  });

  // Extract translatable attribute values before touching text nodes so the
  // two passes don't interfere (attributes live inside tags, text nodes outside).
  const withAttrs = withSkips.replace(
    TRANSLATABLE_ATTR_RE,
    (_match, attrName: string, _quotedFull: string, dqVal: string, _sqFull: string, sqVal: string) => {
      const attrValue = dqVal ?? sqVal ?? "";
      const quote = dqVal !== undefined ? '"' : "'";
      if (!isTranslatableAttrValue(attrValue)) return _match;
      const idx = texts.length;
      texts.push(attrValue.trim());
      return `${attrName}=${quote}\x00T${idx}\x00${quote}`;
    },
  );

  // Replace each text node between tags with an indexed marker
  const template = withAttrs.replace(/>([^<]+)</g, (_match, raw: string) => {
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
      // Omit `source` so Google auto-detects — the catalog is multilingual.
      body: JSON.stringify({ q: texts, target, format }),
    },
  );

  if (!resp.ok) throw new Error(`Google Translate HTTP ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as {
    data: { translations: Array<{ translatedText: string }> };
  };
  return data.data.translations.map((t) => t.translatedText);
}

// ─── Routed translation (engine-agnostic) ──────────────────────────────────────

/**
 * Translate a set of items trying each engine in `order` until resolved.
 * Placeholders are masked once up front and restored/verified at the end, so the
 * protection applies to every engine (LLM and Google alike). Returns a map of
 * key → { value, status }; items unresolved by all engines get status "fallback".
 */
type RoutedResult = { value: string; status: "translated" | "fallback"; engine: Engine | null; tokens: number };

async function translateItemsRouted(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
  shopName: string,
  order: Engine[],
): Promise<{ results: Map<string, RoutedResult>; llmTokens: number }> {
  // placeholdersByKey: variable tokens (string[]) extracted from each item's value.
  const placeholdersByKey = new Map<string, string[]>();
  const masked = items.map((it) => {
    const { masked: m, tokens } = maskPlaceholders(it.value);
    placeholdersByKey.set(it.key, tokens);
    return { key: it.key, value: m, digest: it.digest };
  });

  const collected = new Map<string, string>(); // masked translations
  const engineByKey = new Map<string, Engine>(); // which engine resolved each key
  const llmTokensByKey = new Map<string, number>(); // LLM API tokens charged per key
  let systemPrompt: string | null = null;
  const tokenAccum = { value: 0 }; // accumulates LLM token usage across all retries

  for (const engine of order) {
    const missing = masked.filter((i) => !collected.has(i.key));
    if (missing.length === 0) break;

    if (engine === "llm") {
      if (!llmConfigured()) continue;
      if (systemPrompt === null) {
        const glossary = await loadGlossaryLines(shopName, target);
        systemPrompt = buildSystemPrompt(target, glossary);
      }
      try {
        await gatherTranslations(missing, aiModel, systemPrompt, collected, tokenAccum);
      } catch (e) {
        console.warn(`[route] llm engine error`, e);
      }
      // Attribute newly-resolved keys to the LLM; distribute tokens evenly across keys.
      const newlyResolved = missing.filter((i) => collected.has(i.key) && !engineByKey.has(i.key));
      const tokensEach = newlyResolved.length > 0 ? Math.ceil(tokenAccum.value / newlyResolved.length) : 0;
      for (const i of newlyResolved) {
        engineByKey.set(i.key, "llm");
        llmTokensByKey.set(i.key, tokensEach);
      }
    } else {
      if (!googleConfigured()) continue;
      for (const batch of batchByChars(missing, MAX_CHARS_PER_BATCH)) {
        try {
          const out = await callGoogleTranslate(batch.map((b) => b.value), target, "text");
          batch.forEach((b, i) => {
            if (out[i] != null && !collected.has(b.key)) {
              collected.set(b.key, out[i]);
              engineByKey.set(b.key, "google");
            }
          });
        } catch (e) {
          console.warn(`[route] google engine error`, e);
          break; // stop this engine; remaining items cascade to the next
        }
      }
    }
  }

  const result = new Map<string, RoutedResult>();
  for (const it of items) {
    const raw = collected.get(it.key);
    const placeholders = placeholdersByKey.get(it.key) ?? [];
    if (raw === undefined) {
      result.set(it.key, { value: it.value, status: "fallback", engine: null, tokens: 0 });
      continue;
    }
    const decoded = decodeQuoteEntities(raw);
    if (placeholders.length > 0 && !placeholdersIntact(decoded, placeholders)) {
      console.warn(`[route] placeholder corrupted for key=${it.key}, using original`);
      result.set(it.key, { value: it.value, status: "fallback", engine: null, tokens: 0 });
      continue;
    }
    result.set(it.key, {
      value: restorePlaceholders(decoded, placeholders),
      status: "translated",
      engine: engineByKey.get(it.key) ?? null,
      tokens: llmTokensByKey.get(it.key) ?? 0,
    });
  }
  return { results: result, llmTokens: tokenAccum.value };
}

// Retries for a single (un-splittable) item that fails transiently.
const LEAF_RETRIES = 2;

/**
 * Pull the JSON object out of a model response that may be wrapped in markdown
 * fences or surrounded by prose. Still throws downstream if the inner text is
 * genuinely malformed.
 */
function extractJsonObject(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

/**
 * LLMs sometimes HTML-escape quotes/apostrophes in their output (`won't` →
 * `won&#39;t`). In HTML text nodes and plain fields these characters are valid
 * literals, so the escaping is pure noise (and can double-escape on re-runs).
 * Decode ONLY quotes/apostrophes — never &amp;/&lt;/&gt;, which must stay escaped
 * to keep HTML well-formed.
 */
function decodeQuoteEntities(text: string): string {
  return text
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#0*34;|&quot;/g, '"');
}

// ─── Placeholder masking ───────────────────────────────────────────────────────

/**
 * Variables that must survive translation verbatim. LLMs otherwise translate the
 * word inside them (e.g. {{quantity}} → {{quantité}}, [qty] → [qté]), which
 * breaks Shopify's variable substitution. We mask them before sending and restore
 * after, instead of trusting the model to leave them alone.
 *
 * Covered: Liquid/handlebars `{{ x }}`, Ruby i18n `%{x}`, template `${x}`,
 * printf `%s/%d/%1$s`, numbered `{0}`, and bracket vars `[name]` (but NOT
 * markdown links `[text](url)`).
 */
const PLACEHOLDER_RE =
  /\{\{[^{}]*\}\}|%\{[^}]+\}|\$\{[^}]+\}|%\d*\$?[sd]|\{\d+\}|\[[A-Za-z_][\w-]*\](?!\()/g;

// Rare bracket pair the model treats as an opaque token and won't translate.
const SENT_OPEN = "⟦"; // ⟦
const SENT_CLOSE = "⟧"; // ⟧
const SENT_RE = /⟦(\d+)⟧/g;

function maskPlaceholders(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const masked = text.replace(PLACEHOLDER_RE, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `${SENT_OPEN}${i}${SENT_CLOSE}`;
  });
  return { masked, tokens };
}

function restorePlaceholders(text: string, tokens: string[]): string {
  return text.replace(SENT_RE, (_m, d: string) => tokens[Number(d)] ?? "");
}

/** True if every masked token's sentinel survived intact in the model output. */
function placeholdersIntact(text: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (!text.includes(`${SENT_OPEN}${i}${SENT_CLOSE}`)) return false;
  }
  return true;
}

/**
 * Build the static system prompt. Everything here is stable for a given
 * (source, target, glossary) → it forms a byte-identical prefix across batches
 * so OpenAI automatic prompt caching applies. The variable payload goes in the
 * user message instead.
 */
function buildSystemPrompt(target: string, glossaryLines: string[]): string {
  const glossaryBlock = glossaryLines.length
    ? `\nGlossary (apply consistently):\n${glossaryLines.join("\n")}\n`
    : "";
  return `You are a professional e-commerce translator.
Detect the input language automatically and translate the content into "${target}".
Rules:
- Be accurate and natural for e-commerce
- Translate ALL content into "${target}", no matter what language the input is in (English, Chinese, Spanish, etc.)
- If a value is already entirely in "${target}", return it unchanged
- Keep any ⟦number⟧ tokens exactly as they appear; never translate, modify, reorder, or drop them
- Output literal characters; do NOT HTML-escape. Use ' and " directly — never &#39; or &quot;
- Do NOT add or remove leading or trailing whitespace
- If the value is empty, return it unchanged
- You MUST return an entry for every key in the input
${glossaryBlock}
The user message is a JSON array of {"key","value"} objects to translate.
Return ONLY a JSON object {"translations":[{"key":"<key>","translatedValue":"<text>"}]}, no markdown.`;
}

/**
 * One LLM round-trip. Uses opaque numeric IDs (f0, f1, …) in the payload so the
 * model cannot accidentally swap values based on semantic key names (P1 fix).
 * Returns a map from original keys → translated values, plus the token count.
 * Throws on unparseable JSON so the caller can retry.
 */
async function callLLMOnce(
  items: TranslateItem[],
  aiModel: string,
  systemPrompt: string,
): Promise<{ map: Map<string, string>; tokens: number }> {
  // Use opaque IDs (f0, f1, f2…) instead of semantic field names so the model
  // cannot confuse "title" as a content hint and swap values between keys.
  const idToKey = new Map(items.map((it, idx) => [`f${idx}`, it.key]));
  const payload = items.map((it, idx) => ({ key: `f${idx}`, value: it.value }));

  const model = resolveModel(aiModel);
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  }, {
    timeout: 120_000, // 120s per batch — prevents hanging on unresponsive APIs
  });

  const tokens = completion.usage?.total_tokens ?? 0;
  const raw = completion.choices[0]?.message?.content ?? "{}";
  // JSON.parse throws on malformed output → propagated to caller for retry/splitting.
  const obj = JSON.parse(extractJsonObject(raw)) as { translations?: unknown };
  const parsed = Array.isArray(obj.translations)
    ? (obj.translations as Array<{ key?: unknown; translatedValue?: unknown }>)
    : [];

  const map = new Map<string, string>();
  for (const r of parsed) {
    if (typeof r?.key === "string" && typeof r?.translatedValue === "string") {
      const origKey = idToKey.get(r.key);
      if (origKey !== undefined) map.set(origKey, r.translatedValue);
    }
  }
  return { map, tokens };
}

/**
 * Translate a set of (already masked) items, writing results into `collected`.
 * On an unparseable/failed response the batch is split in half and retried, so a
 * single item that makes the model emit invalid JSON cannot poison the whole
 * batch. A lone failing item is retried a few times, then left for fallback.
 */
async function gatherTranslations(
  items: TranslateItem[],
  aiModel: string,
  systemPrompt: string,
  collected: Map<string, string>,
  tokenAccum: { value: number },
): Promise<void> {
  const pend = items.filter((i) => !collected.has(i.key));
  if (pend.length === 0) return;

  try {
    const { map, tokens } = await callLLMOnce(pend, aiModel, systemPrompt);
    tokenAccum.value += tokens;
    let progressed = false;
    for (const [k, v] of map) {
      if (!collected.has(k)) {
        collected.set(k, v);
        progressed = true;
      }
    }
    const missing = pend.filter((i) => !collected.has(i.key));
    // Model parsed OK but dropped some keys → retry just those, but only while
    // making progress (avoids looping on a key the model refuses to return).
    if (missing.length > 0 && progressed && missing.length < pend.length) {
      await gatherTranslations(missing, aiModel, systemPrompt, collected, tokenAccum);
    }
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (pend.length > 1) {
      const mid = Math.ceil(pend.length / 2);
      console.warn(`[llm] batch of ${pend.length} unparseable (${msg}); splitting`);
      await gatherTranslations(pend.slice(0, mid), aiModel, systemPrompt, collected, tokenAccum);
      await gatherTranslations(pend.slice(mid), aiModel, systemPrompt, collected, tokenAccum);
      return;
    }
    // Single item: retry for transient failures, then give up (→ fallback).
    for (let r = 0; r < LEAF_RETRIES; r++) {
      try {
        const { map, tokens } = await callLLMOnce(pend, aiModel, systemPrompt);
        tokenAccum.value += tokens;
        for (const [k, v] of map) if (!collected.has(k)) collected.set(k, v);
        if (collected.has(pend[0].key)) return;
      } catch {
        // keep retrying up to the cap
      }
    }
    console.warn(`[llm] item ${pend[0].key} failed after retries (${msg}); using original`);
  }
}

// ─── Main exported functions ────────────────────────────────────────────────────

export type ResourceInput = { resourceId: string; fields: TranslateItem[] };
export type ResourceResult = { resourceId: string; results: TranslateResult[] };
/** Per-engine-model tally of how much content each engine translated. */
export type EngineUsage = Record<string, { units: number; chars: number; tokens: number }>;
export type TranslateChunkResult = { resources: ResourceResult[]; usage: EngineUsage };

export function mergeEngineUsage(into: EngineUsage, from: EngineUsage): void {
  for (const [model, u] of Object.entries(from)) {
    const acc = (into[model] ??= { units: 0, chars: 0, tokens: 0 });
    acc.units += u.units;
    acc.chars += u.chars;
    acc.tokens += u.tokens;
  }
}

// Reconstruction plan for a field whose translation spans one or more text units.
type FieldPlan = {
  resourceId: string;
  key: string;
  digest: string;
  order: Engine[];
  cacheModel: string;
} & (
  | { kind: "plain"; parts: string[] }
  | { kind: "html"; template: string; nodeTexts: string[] }
);

/**
 * Translate every field across a whole chunk of resources in one pass.
 *
 * Key optimizations over per-resource translation:
 *  - Cross-resource batching: identical-engine text units from all resources are
 *    translated together (fewer round-trips, better prompt-cache amortization).
 *  - Dedup: each unique (engine-order, text) is translated once and reused
 *    everywhere it occurs in the chunk.
 *
 * Engine selection: TRANSLATION_AI_MODEL forces one engine; otherwise cost-tiered
 * routing (Google for short/simple, LLM for rich) with cross-engine fallback.
 * Placeholders are masked across all engines; TM cache keyed by tier model.
 */
export async function translateResources(
  resources: ResourceInput[],
  source: string,
  target: string,
  aiModel: string,
  testMode: boolean,
  shopName: string,
  onProgress?: (doneUnitsDelta: number, tokensDelta: number) => Promise<void>,
): Promise<TranslateChunkResult> {
  if (testMode) {
    return {
      resources: resources.map((res) => ({
        resourceId: res.resourceId,
        results: res.fields.map((f) => ({
          key: f.key,
          translatedValue: `${f.value} - test`,
          digest: f.digest,
          status: "translated" as const,
        })),
      })),
      usage: {},
    };
  }

  const resultMaps = new Map<string, Map<string, TranslateResult>>();
  const plans: FieldPlan[] = [];
  // orderSig → (unique text → occurrence count across the chunk).
  const pools = new Map<string, Map<string, number>>();
  const addUnit = (order: Engine[], text: string) => {
    const sig = order.join(",");
    const occ = pools.get(sig) ?? pools.set(sig, new Map()).get(sig)!;
    occ.set(text, (occ.get(text) ?? 0) + 1);
  };

  // Units resolved without hitting an engine (cache hits) — credited immediately.
  let cacheUnits = 0;

  // 1. Plan every field: resolve skip/cache directly; collect units to translate.
  //    TM lookups are fired in parallel across all fields to minimise Redis RTTs.
  for (const res of resources) {
    resultMaps.set(res.resourceId, new Map<string, TranslateResult>());
  }

  // 1a. Separate skip fields (no TM needed) from fields that need a cache check.
  type FieldWork = {
    resourceId: string;
    f: TranslateItem;
    klass: "html" | "plain";
    order: Engine[];
    cacheModel: string;
  };
  const fieldWorks: FieldWork[] = [];

  for (const res of resources) {
    const rm = resultMaps.get(res.resourceId)!;
    for (const f of res.fields) {
      const klass = classifyField(f.key, f.value);
      if (klass === "skip") {
        rm.set(f.key, { key: f.key, translatedValue: f.value, digest: f.digest, status: "translated" });
        continue;
      }
      const order = engineOrderFor(fieldTier(f.key, f.value, klass), aiModel);
      const cacheModel = engineModel(order[0], aiModel);
      fieldWorks.push({ resourceId: res.resourceId, f, klass, order, cacheModel });
    }
  }

  const tmWrites: Promise<void>[] = [];

  // 1b. Fire all TM digest lookups in parallel.
  const cacheHits = await Promise.all(
    fieldWorks.map(({ f, cacheModel }) => tmGet(shopName, target, cacheModel, f.digest)),
  );

  // 1c. Process results: hit → credit immediately; miss → value cache or add to plan.
  for (let wi = 0; wi < fieldWorks.length; wi++) {
    const { resourceId, f, klass, order, cacheModel } = fieldWorks[wi];
    const rm = resultMaps.get(resourceId)!;
    const cached = cacheHits[wi];
    if (cached !== null) {
      rm.set(f.key, { key: f.key, translatedValue: cached, digest: f.digest, status: "translated" });
      cacheUnits += countFieldUnits(f.key, f.value);
      continue;
    }

    // Secondary: value-based cache for short plain-text fields.
    if (klass === "plain") {
      const cachedByValue = await tmGetByValue(f.value, source, target, cacheModel);
      if (cachedByValue !== null) {
        rm.set(f.key, { key: f.key, translatedValue: cachedByValue, digest: f.digest, status: "translated" });
        tmWrites.push(tmSet(shopName, target, cacheModel, f.digest, cachedByValue));
        cacheUnits += countFieldUnits(f.key, f.value);
        continue;
      }
    }

    if (klass === "html") {
      const { template, texts } = extractHtmlTextNodes(f.value);
      if (texts.length === 0) {
        rm.set(f.key, { key: f.key, translatedValue: f.value, digest: f.digest, status: "translated" });
        continue;
      }
      texts.forEach((t) => addUnit(order, t));
      plans.push({ kind: "html", resourceId, key: f.key, digest: f.digest, order, cacheModel, template, nodeTexts: texts });
    } else {
      const parts = splitPlainText(f.value);
      parts.forEach((p) => addUnit(order, p));
      plans.push({ kind: "plain", resourceId, key: f.key, digest: f.digest, order, cacheModel, parts });
    }
  }

  // Credit cache hits immediately so the bar reflects them (0 LLM tokens for TM hits).
  if (cacheUnits > 0 && onProgress) await onProgress(cacheUnits, 0);

  // 2. Translate unique texts per engine order, in char-bounded batches.
  //    Up to BATCH_CONCURRENCY batches per pool run in parallel.
  //    Progress (units + raw LLM tokens) is reported after each batch.
  const usage: EngineUsage = {};
  const translated = new Map<string, Map<string, RoutedResult>>();
  for (const [sig, occ] of pools) {
    const order = sig.split(",") as Engine[];
    const texts = [...occ.keys()];
    const tmap = new Map<string, RoutedResult>();
    const items: TranslateItem[] = texts.map((t, i) => ({ key: String(i), value: t, digest: "" }));
    const batches = batchByChars(items, MAX_CHARS_PER_BATCH);
    await pAll(batches, BATCH_CONCURRENCY, async (batch) => {
      const { results: m, llmTokens } = await translateItemsRouted(batch, source, target, aiModel, shopName, order);
      let batchUnits = 0;
      for (const [k, v] of m) {
        const text = texts[Number(k)];
        tmap.set(text, v);
        batchUnits += occ.get(text) ?? 1;
        if (v.status === "translated" && v.engine) {
          const model = engineModel(v.engine, aiModel);
          const acc = (usage[model] ??= { units: 0, chars: 0, tokens: 0 });
          acc.units += 1;
          acc.chars += text.length;
          acc.tokens += v.tokens;
        }
      }
      // Report progress (units + raw LLM tokens) after each batch.
      if (onProgress) await onProgress(batchUnits, llmTokens);
    });
    translated.set(sig, tmap);
  }

  const lookup = (order: Engine[], text: string) => translated.get(order.join(","))?.get(text);

  // 3. Reconstruct each planned field and cache new translations in parallel.
  for (const plan of plans) {
    const rm = resultMaps.get(plan.resourceId)!;
    if (plan.kind === "plain") {
      const pieces = plan.parts.map((p) => lookup(plan.order, p) ?? { value: p, status: "fallback" as const });
      const value = pieces.map((p) => p.value).join("");
      const status = pieces.some((p) => p.status === "fallback") ? "fallback" : "translated";
      const originalValue = plan.parts.join("");
      rm.set(plan.key, { key: plan.key, translatedValue: value, digest: plan.digest, status });
      if (status === "translated") {
        tmWrites.push(tmSet(shopName, target, plan.cacheModel, plan.digest, value));
        tmWrites.push(tmSetByValue(originalValue, source, target, plan.cacheModel, value));
      }
    } else {
      let anyFallback = false;
      const out = plan.nodeTexts.map((t) => {
        const r = lookup(plan.order, t);
        if (!r || r.status === "fallback") {
          anyFallback = true;
          return t;
        }
        return r.value.trim(); // template already preserves surrounding whitespace
      });
      const value = restoreHtmlTextNodes(plan.template, out);
      const status = anyFallback ? "fallback" : "translated";
      rm.set(plan.key, { key: plan.key, translatedValue: value, digest: plan.digest, status });
      if (status === "translated") tmWrites.push(tmSet(shopName, target, plan.cacheModel, plan.digest, value));
    }
  }
  if (tmWrites.length > 0) await Promise.all(tmWrites);

  // 4. Assemble per-resource results aligned to input field order.
  const out = resources.map((res) => {
    const rm = resultMaps.get(res.resourceId)!;
    return {
      resourceId: res.resourceId,
      results: res.fields.map(
        (f) =>
          rm.get(f.key) ?? { key: f.key, translatedValue: f.value, digest: f.digest, status: "fallback" as const },
      ),
    };
  });
  return { resources: out, usage };
}

/**
 * Translate all fields for a single resource. Thin wrapper over translateResources.
 */
export async function translateBatch(
  items: TranslateItem[],
  source: string,
  target: string,
  aiModel: string,
  testMode: boolean,
  shopName: string,
): Promise<TranslateResult[]> {
  const { resources } = await translateResources(
    [{ resourceId: "__single__", fields: items }],
    source,
    target,
    aiModel,
    testMode,
    shopName,
  );
  return resources[0].results;
}
