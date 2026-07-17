export type TiktokFeedCsvError = { id: string; reason: string };

export type TiktokFeedCsvAnalysis = {
  errors: TiktokFeedCsvError[];
  /** 未能按 SKU 对齐时的摘要原因（去重） */
  summaryReasons: string[];
  headers: string[];
  rowCount: number;
  delimiter: string;
};

const SKU_HEADER_HINTS = [
  "sku_id",
  "sku",
  "product_id",
  "item_id",
  "itemid",
  "id",
  "商品id",
  "商品_id",
  "产品id",
  "产品_id",
  "商品编号",
  "产品编号",
];

const REASON_HEADER_HINTS = [
  "error_message",
  "error",
  "issue",
  "reason",
  "message",
  "description",
  "error_description",
  "fail_reason",
  "failure_reason",
  "comment",
  "详情",
  "错误",
  "错误信息",
  "错误原因",
  "失败原因",
  "问题",
  "原因",
];

const STATUS_HEADER_HINTS = [
  "status",
  "result",
  "level",
  "severity",
  "状态",
  "结果",
];

function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/** 简易 CSV/TSV 行解析（支持引号）。 */
export function parseCsvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function findCol(headers: string[], hints: string[]): number {
  for (const hint of hints) {
    const exact = headers.indexOf(hint);
    if (exact >= 0) return exact;
  }
  for (const hint of hints) {
    const fuzzy = headers.findIndex(
      (h) => h.includes(hint) || hint.includes(h) || h.replace(/_/g, "").includes(hint.replace(/_/g, "")),
    );
    if (fuzzy >= 0) return fuzzy;
  }
  return -1;
}

function isSuccessStatus(rowStatus: string): boolean {
  return (
    rowStatus.includes("SUCCESS") ||
    rowStatus.includes("SUCCEED") ||
    rowStatus === "OK" ||
    rowStatus === "PASS" ||
    rowStatus === "APPROVED" ||
    rowStatus === "成功"
  );
}

function isFailedStatus(rowStatus: string): boolean {
  return (
    rowStatus.includes("FAIL") ||
    rowStatus.includes("ERROR") ||
    rowStatus === "REJECTED" ||
    rowStatus === "WARNING" ||
    rowStatus.includes("失败") ||
    rowStatus.includes("错误") ||
    rowStatus.includes("警告")
  );
}

/**
 * 解析 TikTok feed_log_data 明细表。
 * 兼容英文/中文表头、逗号/制表符/分号分隔。
 */
export function analyzeTiktokFeedLogCsv(text: string): TiktokFeedCsvAnalysis {
  const trimmed = text.trim();
  if (!trimmed) {
    return { errors: [], summaryReasons: [], headers: [], rowCount: 0, delimiter: "," };
  }
  if (/^</.test(trimmed) || /<html/i.test(trimmed)) {
    return {
      errors: [],
      summaryReasons: ["feed_log CSV returned HTML instead of CSV"],
      headers: [],
      rowCount: 0,
      delimiter: ",",
    };
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsvRows(text, delimiter);
  if (rows.length < 2) {
    return {
      errors: [],
      summaryReasons: trimmed.slice(0, 240) ? [trimmed.slice(0, 240)] : [],
      headers: rows[0]?.map(normalizeCsvHeader) ?? [],
      rowCount: Math.max(0, rows.length - 1),
      delimiter,
    };
  }

  const headers = rows[0].map(normalizeCsvHeader);
  const skuCol = findCol(headers, SKU_HEADER_HINTS);
  const reasonCol = findCol(headers, REASON_HEADER_HINTS);
  const statusCol = findCol(headers, STATUS_HEADER_HINTS);

  const errors: TiktokFeedCsvError[] = [];
  const summaryReasons: string[] = [];

  for (const cells of rows.slice(1)) {
    const id = skuCol >= 0 ? String(cells[skuCol] ?? "").trim() : "";
    const reason = reasonCol >= 0 ? String(cells[reasonCol] ?? "").trim() : "";
    const rowStatus = statusCol >= 0 ? String(cells[statusCol] ?? "").toUpperCase() : "";

    if (rowStatus && isSuccessStatus(rowStatus)) continue;

    // 无表头匹配时：把整行拼成摘要，便于排障
    if (skuCol < 0 && reasonCol < 0) {
      const joined = cells.map((c) => c.trim()).filter(Boolean).join(" | ");
      if (joined) summaryReasons.push(joined);
      continue;
    }

    const looksFailed = isFailedStatus(rowStatus) || Boolean(reason) || (!rowStatus && Boolean(id));
    if (!looksFailed) continue;

    const finalReason =
      reason ||
      (rowStatus ? `TikTok feed log status=${rowStatus}` : "") ||
      cells
        .filter((_, idx) => idx !== skuCol)
        .map((c) => c.trim())
        .filter(Boolean)
        .join(" | ");

    if (!finalReason) continue;
    if (id) {
      errors.push({ id, reason: finalReason });
    }
    summaryReasons.push(finalReason);
  }

  return {
    errors,
    summaryReasons: [...new Set(summaryReasons)].slice(0, 20),
    headers,
    rowCount: rows.length - 1,
    delimiter,
  };
}

/** 兼容旧调用：仅返回按 SKU 对齐的错误行。 */
export function parseTiktokFeedLogCsv(text: string): TiktokFeedCsvError[] {
  return analyzeTiktokFeedLogCsv(text).errors;
}
