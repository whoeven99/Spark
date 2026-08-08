import { TRANSLATIONS_REGISTER_BATCH_SIZE } from "./shopifyTranslationOps.js";

export const QUERY_CSV_MAX_CONCURRENCY = 10;
export const QUERY_CSV_DEFAULT_CONCURRENCY = 1;

export const QUERY_CSV_REQUIRED_COLUMNS = [
  "resource_id",
  "node_key",
  "target_value",
  "digest",
] as const;

/** 标准写回 CSV（与查询导出格式一致） */
export const STANDARD_CSV_REQUIRED_COLUMNS = [
  "resourceId",
  "target_code",
  "key",
  "target_text",
  "digest",
] as const;

/** 批量删除 CSV */
export const DELETE_CSV_REQUIRED_COLUMNS = [
  "resourceId",
  "target_code",
  "key",
] as const;

export function assertCsvColumns(
  headers: string[],
  required: readonly string[],
): string[] {
  return required.filter((c) => !headers.includes(c));
}

export function parseQueryCsvConcurrency(value: unknown): number {
  if (value == null || String(value).trim() === "") {
    return QUERY_CSV_DEFAULT_CONCURRENCY;
  }
  const n = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, QUERY_CSV_MAX_CONCURRENCY);
}

function isTruthy(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "t";
}

export function isQueryCsvRowValid(row: Record<string, string>): boolean {
  const resourceId = (row.resource_id ?? "").trim();
  const key = (row.node_key ?? "").trim();
  const digest = (row.digest ?? "").trim();
  if (!resourceId || !key || !digest) return false;
  if (isTruthy(row.is_deleted)) return false;
  return true;
}

function dedupeBatchKeepLast(
  items: { key: string; value: string; translatableContentDigest: string }[],
) {
  const order: string[] = [];
  const byKey = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    if (!byKey.has(item.key)) order.push(item.key);
    byKey.set(item.key, item);
  }
  return order.map((k) => byKey.get(k)!);
}

function chunkList<T>(list: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

export type ResourceBatch = {
  items: { key: string; value: string; translatableContentDigest: string }[];
  sourceRowCount: number;
};

export function groupBatchesByResourceId(
  rows: Record<string, string>[],
  batchSize = TRANSLATIONS_REGISTER_BATCH_SIZE,
): Map<string, ResourceBatch[]> {
  const grouped = new Map<string, { key: string; value: string; translatableContentDigest: string }[]>();

  for (const row of rows) {
    if (!isQueryCsvRowValid(row)) continue;
    const resourceId = (row.resource_id ?? "").trim();
    const list = grouped.get(resourceId) ?? [];
    list.push({
      key: (row.node_key ?? "").trim(),
      value: String(row.target_value ?? ""),
      translatableContentDigest: (row.digest ?? "").trim(),
    });
    grouped.set(resourceId, list);
  }

  const result = new Map<string, ResourceBatch[]>();
  for (const [resourceId, rawItems] of grouped) {
    const batches: ResourceBatch[] = [];
    for (const chunk of chunkList(rawItems, batchSize)) {
      batches.push({
        items: dedupeBatchKeepLast(chunk),
        sourceRowCount: chunk.length,
      });
    }
    result.set(resourceId, batches);
  }
  return result;
}

/** 简易 CSV 解析（支持引号字段） */
export function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  };

  const headers = parseLine(lines[0]!).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export function decodeCsvBuffer(buffer: Buffer): string {
  const encodings = ["utf-8", "utf-8-sig", "gbk", "gb2312", "latin1"] as const;
  for (const enc of encodings) {
    try {
      const text = new TextDecoder(enc === "utf-8-sig" ? "utf-8" : enc, { fatal: true }).decode(
        buffer,
      );
      if (text.includes(",") || text.includes("\n")) return text;
    } catch {
      // try next
    }
  }
  return buffer.toString("utf-8");
}

export type BatchImportEvent = {
  ok: boolean;
  resourceId: string;
  sourceRowCount: number;
  writeCount: number;
  dedupNote: string;
  error?: string;
  isException?: boolean;
};

export function formatBatchSseLine(
  event: BatchImportEvent,
  processed: number,
  validCount: number,
): string {
  const { resourceId, sourceRowCount, writeCount, dedupNote } = event;
  let body: string;
  if (event.ok) {
    body = `✅ batch：${resourceId} | ${writeCount} 条写入${dedupNote} | 累计行 ${processed}/${validCount}`;
  } else if (event.isException) {
    body = `❌ batch：${resourceId} | ${sourceRowCount} 条${dedupNote} | 异常：${event.error} | 累计行 ${processed}/${validCount}`;
  } else {
    body = `❌ batch：${resourceId} | ${sourceRowCount} 条${dedupNote} | 失败：${event.error} | 累计行 ${processed}/${validCount}`;
  }
  return `data: ${body}\n\n`;
}
