/**
 * 商户上传的表格 → 结构化行对象（价目表导入的读侧第一步）。
 *
 * 和 `fileContext/fileParser.server.ts` 的区别：那边把表格拍成纯文本喂给 AI，
 * 这边要保留列结构。两者不能互换。
 *
 * 只解析，不校验业务语义；金额规范化与列映射校验在 `app/lib/sheetImport.ts`，
 * 各导入能力自己的业务规则在对应的 `app/lib/bulk*Import.ts`。
 */
import path from "node:path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { SheetRow } from "../../lib/sheetImport";

export type ParsedSheet = {
  headers: string[];
  rows: SheetRow[];
  /** 因为撞到 maxRows 而截断 */
  truncated: boolean;
};

export class SheetParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SheetParseError";
    this.code = code;
  }
}

const CSV_EXTENSIONS = new Set([".csv", ".txt"]);
const EXCEL_EXTENSIONS = new Set([".xlsx", ".xls"]);

/** UTF-8 解码后替换字符占比超过这个比例，就认为不是 UTF-8。 */
const REPLACEMENT_CHAR_RATIO = 0.01;

/**
 * 中文 CSV 从 Excel 导出时经常是 GBK 而不是 UTF-8，直接按 UTF-8 读会整片乱码。
 * 先看 BOM，再用替换字符比例判断，最后退回 GBK。
 */
export function decodeSheetBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf-8");
  }

  const asUtf8 = buffer.toString("utf-8");
  const replacements = (asUtf8.match(/\uFFFD/g) ?? []).length;
  if (replacements === 0 || replacements / Math.max(asUtf8.length, 1) < REPLACEMENT_CHAR_RATIO) {
    return asUtf8;
  }

  try {
    // Node 自带 full-icu 时支持 gbk；不支持则退回 UTF-8 结果，由用户从预览里发现乱码
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    return asUtf8;
  }
}

/** 表头去空白；重复列名保留第一个，后面的加序号后缀以免互相覆盖。 */
function normalizeHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, index) => {
    const name = String(cell ?? "").trim() || `列${index + 1}`;
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}

function toCellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") {
    // Excel 常把价格存成浮点数，toString 可能给出 178.99999999999997
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  }
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** 二维数组 → 表头 + 行；整行为空的跳过，但行号继续按原文件计。 */
function buildSheet(matrix: unknown[][], maxRows: number): ParsedSheet {
  const headerRow = matrix.find((row) => row.some((cell) => toCellText(cell) !== ""));
  if (!headerRow) {
    throw new SheetParseError("empty_sheet", "表格是空的，没有读到任何内容");
  }
  const headerIndex = matrix.indexOf(headerRow);
  const headers = normalizeHeaders(headerRow);

  const rows: SheetRow[] = [];
  let truncated = false;
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const raw = matrix[i];
    const cells: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, col) => {
      const text = toCellText(raw?.[col]);
      cells[header] = text;
      if (text !== "") hasValue = true;
    });
    if (!hasValue) continue;
    if (rows.length >= maxRows) {
      truncated = true;
      break;
    }
    // sourceRow 用 1 基行号，和用户在 Excel 里看到的一致
    rows.push({ sourceRow: i + 1, cells });
  }

  return { headers, rows, truncated };
}

function parseCsv(buffer: Buffer, maxRows: number): ParsedSheet {
  const text = decodeSheetBuffer(buffer);
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
  });
  if (!Array.isArray(result.data) || result.data.length === 0) {
    throw new SheetParseError("empty_sheet", "表格是空的，没有读到任何内容");
  }
  return buildSheet(result.data, maxRows);
}

function parseExcel(buffer: Buffer, maxRows: number): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new SheetParseError("empty_sheet", "表格是空的，没有读到任何工作表");
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
  if (matrix.length === 0) {
    throw new SheetParseError("empty_sheet", "表格是空的，没有读到任何内容");
  }
  return buildSheet(matrix, maxRows);
}

/**
 * 按扩展名解析表格。多 sheet 的 Excel 只取第一个 sheet。
 * 解析失败抛 SheetParseError，由调用方转成用户可读的任务失败原因。
 */
export function parseSheetBuffer(
  buffer: Buffer,
  filename: string,
  options: { maxRows: number },
): ParsedSheet {
  const ext = path.extname(filename).toLowerCase();
  if (CSV_EXTENSIONS.has(ext)) return parseCsv(buffer, options.maxRows);
  if (EXCEL_EXTENSIONS.has(ext)) return parseExcel(buffer, options.maxRows);
  throw new SheetParseError(
    "unsupported_type",
    `不支持的文件类型 ${ext || "(无扩展名)"}，请上传 CSV 或 Excel`,
  );
}
