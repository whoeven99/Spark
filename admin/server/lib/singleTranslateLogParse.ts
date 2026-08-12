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
  /** 完整原文/译文（来自 result payload）。 */
  original: string;
  translated: string;
  customPrompt: string | null;
  request: ParsedSingleLog | null;
  llm: ParsedSingleLog | null;
  rawMessages: string[];
};

const MERGE_WINDOW_MS = 60_000;

/** Remix/Render 常在 message 前加 request id，如 `[onj9q] [single] result`。 */
const RE_RESULT = /\[single\]\s+result\b/;
const RE_REQUEST = /\[single\]\s+request\b/;
const RE_LLM = /\[single-llm\]\s+return\b/;
const RE_SINGLE_ANY = /\[single(?:-llm)?\]/;

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
  const shop = readShop(payload);
  const timestampMs = parseLogTimestamp(entry);

  return {
    kind,
    timestampMs,
    shop,
    message,
    payload,
  };
}

function previewText(value: string | null | undefined, max = 120): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
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

function buildRecordFromResult(
  result: ParsedSingleLog,
  related: ParsedSingleLog[],
): SingleTranslateLogRecord {
  const p = result.payload;
  const request =
    related.find((r) => r.kind === "request") ??
    null;
  const llm = related.find((r) => r.kind === "llm") ?? null;

  const original =
    readString(p, "original") ??
    readString(request?.payload ?? {}, "original");
  const translated = readString(p, "translated");
  const customPrompt =
    readString(p, "prompt") ??
    readString(p, "customPrompt") ??
    readString(request?.payload ?? {}, "customPrompt");

  return {
    id: `${result.timestampMs}:${readString(p, "fieldKey") ?? "value"}`,
    timestampMs: result.timestampMs,
    shop: result.shop || readShop(p),
    source: readString(p, "source"),
    target: readString(p, "target"),
    fieldKey: readString(p, "fieldKey"),
    shopifyType: readString(p, "shopifyType"),
    aiModel: readString(p, "aiModel"),
    status: readString(p, "status"),
    usedTokens: readNumber(p, "usedTokens"),
    googleCredits: readNumber(p, "googleCredits"),
    originalPreview: previewText(original, 200),
    translatedPreview: previewText(translated, 200),
    original: original ?? "",
    translated: translated ?? "",
    customPrompt,
    request,
    llm,
    rawMessages: [result.message, request?.message, llm?.message].filter(
      (m): m is string => Boolean(m),
    ),
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

/** 以 `[single] result` 为主记录，±窗口内挂 request / llm。 */
export function aggregateSingleTranslateLogs(
  params: AggregateSingleTranslateLogsParams,
): SingleTranslateLogRecord[] {
  const shop = params.shop.trim().toLowerCase();
  const mergeWindowMs = params.mergeWindowMs ?? MERGE_WINDOW_MS;
  const typeSet = new Set(
    (params.types?.length ? params.types : (["result", "request", "llm"] as SingleLogKind[])),
  );

  const parsed = params.entries
    .map(parseSingleLogEntry)
    .filter((row): row is ParsedSingleLog => row !== null)
    .filter((row) => {
      if (!shop) return true;
      if (row.shop === shop) return true;
      if (row.message.toLowerCase().includes(shop)) return true;
      // Render text=shop 已预过滤；多行 inspect 首行可能只有 `[rid] [single] result {`
      if (row.kind === "result" || row.kind === "request" || row.kind === "llm") {
        return true;
      }
      return false;
    })
    .filter((row) => row.kind === "other" || typeSet.has(row.kind))
    .sort((a, b) => b.timestampMs - a.timestampMs);

  const results = parsed.filter((row) => row.kind === "result");
  const records: SingleTranslateLogRecord[] = [];

  for (const result of results) {
    const related = parsed.filter((row) => {
      if (row === result) return false;
      if (Math.abs(row.timestampMs - result.timestampMs) > mergeWindowMs) {
        return false;
      }
      if (shop && row.shop && row.shop !== shop) return false;
      return row.kind === "request" || row.kind === "llm";
    });

    const record = buildRecordFromResult(result, related);
    if (!recordMatchesKeyword(record, params.keyword ?? "")) continue;
    records.push(record);
  }

  const limit = params.limit ?? 100;
  return records.slice(0, limit);
}
