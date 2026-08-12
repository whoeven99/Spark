import {
  parseLogTimestamp,
  type RenderLogEntry,
} from "./renderLogs.js";

export type SingleLogKind = "result" | "request" | "llm" | "other";

export type ParsedSingleLog = {
  kind: SingleLogKind;
  timestampMs: number;
  shop: string;
  message: string;
  payload: Record<string, unknown>;
  requestId: string | null;
};

export type SingleTranslateLogRecord = {
  id: string;
  timestampMs: number;
  shop: string;
  source: string | null;
  target: string | null;
  fieldKey: string | null;
  shopifyType: string | null;
  aiModel: string | null;
  status: string | null;
  usedTokens: number | null;
  googleCredits: number | null;
  originalPreview: string;
  translatedPreview: string;
  original: string;
  translated: string;
  customPrompt: string | null;
  request: ParsedSingleLog | null;
  llm: ParsedSingleLog | null;
  rawMessages: string[];
};

export type SingleTranslateParseStats = {
  rawLines: number;
  stitchedBlocks: number;
  parsedLines: number;
  resultLines: number;
  requestLines: number;
  llmLines: number;
  shopMatchedLines: number;
};

const MERGE_WINDOW_MS = 60_000;
const MYSHOPIFY_DOMAIN_RE = /[a-z0-9][a-z0-9-]{0,61}\.myshopify\.com/gi;

/** Remix/Render 常在 message 前加 request id，如 `[cnj9q] [single] result`。 */
const RE_RESULT = /\[single\]\s+result\b/;
const RE_REQUEST = /\[single\]\s+request\b/;
const RE_LLM = /\[single-llm\]\s+return\b/;
const RE_SINGLE_ANY = /\[single(?:-llm)?\]/;
const RE_LEADING_REQUEST_ID = /^\[([a-z0-9]{4,12})\]/i;

function readShop(payload: Record<string, unknown>): string {
  const shop = payload.shop ?? payload.shopName;
  return typeof shop === "string" ? shop.trim().toLowerCase() : "";
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

export function extractMyshopifyDomains(text: string): string[] {
  const matches = text.match(MYSHOPIFY_DOMAIN_RE) ?? [];
  return [...new Set(matches.map((d) => d.toLowerCase()))];
}

export function extractLeadingRequestId(message: string): string | null {
  const m = message.trim().match(RE_LEADING_REQUEST_ID);
  return m?.[1]?.toLowerCase() ?? null;
}

/** 行/message 是否属于目标店（支持从正文里抓 *.myshopify.com）。 */
export function messageMatchesShop(message: string, shop: string): boolean {
  const normalized = shop.trim().toLowerCase();
  if (!normalized) return true;
  const lower = message.toLowerCase();
  if (lower.includes(normalized)) return true;
  return extractMyshopifyDomains(message).includes(normalized);
}

/** 把同一 Render request id 下、同一秒附近的碎片行拼成块（Node inspect 多行）。 */
export function stitchRenderLogEntries(entries: RenderLogEntry[]): RenderLogEntry[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort(
    (a, b) => parseLogTimestamp(a) - parseLogTimestamp(b),
  );

  const blocks: RenderLogEntry[] = [];
  let current: RenderLogEntry | null = null;

  for (const entry of sorted) {
    const msg = entry.message ?? "";
    const ts = parseLogTimestamp(entry);
    const rid = extractLeadingRequestId(msg);
    const hasSingleTag = RE_SINGLE_ANY.test(msg);

    const startNew =
      !current ||
      hasSingleTag ||
      (rid &&
        current &&
        rid !== extractLeadingRequestId(current.message ?? "")) ||
      (current && Math.abs(ts - parseLogTimestamp(current)) > 3_000);

    if (startNew) {
      if (current) blocks.push(current);
      current = { ...entry, message: msg };
      continue;
    }

    if (!current) {
      current = { ...entry, message: msg };
      continue;
    }

    current = {
      ...current,
      message: `${current.message ?? ""}\n${msg}`,
      timestamp: entry.timestamp ?? current.timestamp,
    };
  }

  if (current) blocks.push(current);
  return blocks;
}

/** 从 console.log 行尾尝试解析 JSON；失败则回退浅层 key: value 提取。 */
export function extractPayloadObject(message: string): Record<string, unknown> {
  const braceIdx = message.indexOf("{");
  if (braceIdx < 0) return {};

  const slice = message.slice(braceIdx);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return parseShallowInspectObject(slice);
  }
}

function parseShallowInspectObject(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const re =
    /(\w+):\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|(-?\d+(?:\.\d+)?)|true|false|null)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const key = match[1];
    if (match[2] !== undefined) out[key] = match[2].replace(/\\'/g, "'");
    else if (match[3] !== undefined) out[key] = match[3].replace(/\\"/g, '"');
    else if (match[4] !== undefined) out[key] = Number(match[4]);
    else if (match[0].endsWith("true")) out[key] = true;
    else if (match[0].endsWith("false")) out[key] = false;
    else out[key] = null;
  }
  return out;
}

export function classifySingleLogMessage(message: string): SingleLogKind {
  const trimmed = message.trim();
  if (RE_RESULT.test(trimmed)) return "result";
  if (RE_REQUEST.test(trimmed)) return "request";
  if (RE_LLM.test(trimmed)) return "llm";
  if (RE_SINGLE_ANY.test(trimmed)) return "other";
  return "other";
}

export function parseSingleLogEntry(entry: RenderLogEntry): ParsedSingleLog | null {
  const message = entry.message?.trim();
  if (!message) return null;

  const kind = classifySingleLogMessage(message);
  if (kind === "other" && !RE_SINGLE_ANY.test(message)) return null;

  const payload = extractPayloadObject(message);
  const shopFromPayload = readShop(payload);
  const domains = extractMyshopifyDomains(message);
  const shop = shopFromPayload || domains[0] || "";
  const timestampMs = parseLogTimestamp(entry);

  return {
    kind,
    timestampMs,
    shop,
    message,
    payload,
    requestId: extractLeadingRequestId(message),
  };
}

function previewText(value: string | null | undefined, max = 120): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function rowMatchesShop(row: ParsedSingleLog, shop: string): boolean {
  if (!shop) return true;
  if (row.shop === shop) return true;
  return messageMatchesShop(row.message, shop);
}

function recordMatchesKeyword(record: SingleTranslateLogRecord, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    record.fieldKey,
    record.originalPreview,
    record.translatedPreview,
    record.customPrompt,
    record.shopifyType,
    record.aiModel,
    record.request?.message,
    record.llm?.message,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
}

function buildRecordFromAnchor(
  anchor: ParsedSingleLog,
  related: ParsedSingleLog[],
): SingleTranslateLogRecord {
  const result = anchor.kind === "result" ? anchor : related.find((r) => r.kind === "result") ?? null;
  const request =
    anchor.kind === "request" ? anchor : related.find((r) => r.kind === "request") ?? null;
  const llm = related.find((r) => r.kind === "llm") ?? null;

  const p = (result ?? request ?? anchor).payload;
  const original =
    readString(p, "original") ??
    readString(request?.payload ?? {}, "original");
  const translated = readString(result?.payload ?? {}, "translated");
  const customPrompt =
    readString(p, "prompt") ??
    readString(p, "customPrompt") ??
    readString(request?.payload ?? {}, "customPrompt");

  const shop =
    readShop(p) ||
    anchor.shop ||
    request?.shop ||
    result?.shop ||
    extractMyshopifyDomains(anchor.message)[0] ||
    "";

  return {
    id: `${anchor.timestampMs}:${readString(p, "fieldKey") ?? "value"}:${anchor.requestId ?? "x"}`,
    timestampMs: anchor.timestampMs,
    shop,
    source: readString(p, "source"),
    target: readString(p, "target"),
    fieldKey: readString(p, "fieldKey"),
    shopifyType: readString(p, "shopifyType"),
    aiModel: readString(p, "aiModel"),
    status: readString(result?.payload ?? {}, "status"),
    usedTokens:
      readNumber(result?.payload ?? {}, "usedTokens") ??
      readNumber(p, "usedTokens"),
    googleCredits: readNumber(result?.payload ?? {}, "googleCredits"),
    originalPreview: previewText(original, 200),
    translatedPreview: previewText(translated, 200),
    original: original ?? "",
    translated: translated ?? "",
    customPrompt,
    request,
    llm,
    rawMessages: [anchor.message, request?.message, result?.message, llm?.message]
      .filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i),
  };
}

export type AggregateSingleTranslateLogsParams = {
  entries: RenderLogEntry[];
  shop: string;
  types?: SingleLogKind[];
  keyword?: string;
  mergeWindowMs?: number;
  limit?: number;
};

/** 预处理：拼接多行 inspect，再按 result（无则 request）聚合。 */
export function aggregateSingleTranslateLogs(
  params: AggregateSingleTranslateLogsParams,
): { records: SingleTranslateLogRecord[]; stats: SingleTranslateParseStats } {
  const shop = params.shop.trim().toLowerCase();
  const mergeWindowMs = params.mergeWindowMs ?? MERGE_WINDOW_MS;
  const typeSet = new Set(
    (params.types?.length ? params.types : (["result", "request", "llm"] as SingleLogKind[])),
  );

  const stitched = stitchRenderLogEntries(params.entries);
  const parsedAll = stitched
    .map(parseSingleLogEntry)
    .filter((row): row is ParsedSingleLog => row !== null);

  const parsed = parsedAll
    .filter((row) => rowMatchesShop(row, shop))
    .filter((row) => row.kind === "other" || typeSet.has(row.kind))
    .sort((a, b) => b.timestampMs - a.timestampMs);

  const stats: SingleTranslateParseStats = {
    rawLines: params.entries.length,
    stitchedBlocks: stitched.length,
    parsedLines: parsedAll.length,
    resultLines: parsedAll.filter((r) => r.kind === "result").length,
    requestLines: parsedAll.filter((r) => r.kind === "request").length,
    llmLines: parsedAll.filter((r) => r.kind === "llm").length,
    shopMatchedLines: parsed.length,
  };

  let anchors = parsed.filter((row) => row.kind === "result");
  if (anchors.length === 0) {
    anchors = parsed.filter((row) => row.kind === "request");
  }

  const records: SingleTranslateLogRecord[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    const related = parsed.filter((row) => {
      if (row === anchor) return false;
      if (anchor.requestId && row.requestId && anchor.requestId === row.requestId) {
        return true;
      }
      if (Math.abs(row.timestampMs - anchor.timestampMs) > mergeWindowMs) {
        return false;
      }
      if (shop && row.shop && row.shop !== shop) return false;
      return row.kind === "request" || row.kind === "llm" || row.kind === "result";
    });

    const record = buildRecordFromAnchor(anchor, related);
    if (!recordMatchesKeyword(record, params.keyword ?? "")) continue;
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }

  const limit = params.limit ?? 100;
  return { records: records.slice(0, limit), stats };
}
