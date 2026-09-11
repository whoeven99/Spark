/**
 * 读取上传表格的原始字节，解析成表头 + 行。必须走 original buffer，不能用 parsed.txt。
 */
import path from "node:path";

export type ParsedImportSheet = {
  headers: string[];
  rows: string[][];
};

function asCells(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((cell) => (cell == null ? "" : String(cell)));
}

export async function parseImportSpreadsheet(
  buffer: Buffer,
  filename: string,
): Promise<ParsedImportSheet> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".csv" || ext === ".txt") {
    const papaModule = await import("papaparse");
    const Papa = (papaModule.default ?? papaModule) as {
      parse: (input: string, config?: object) => { data: unknown[] };
    };
    const parsed = Papa.parse(stripBom(buffer.toString("utf8")), {
      header: false,
      skipEmptyLines: "greedy",
    });
    return sheetFromRows(parsed.data.map(asCells));
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const first = workbook.SheetNames[0];
    if (!first) return { headers: [], rows: [] };
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[first], {
      header: 1,
      raw: false,
      defval: "",
    });
    return sheetFromRows(matrix.map(asCells));
  }
  throw new Error("请上传 CSV 或 Excel（.xlsx / .xls）");
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sheetFromRows(matrix: string[][]): ParsedImportSheet {
  const filled = matrix.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (filled.length === 0) return { headers: [], rows: [] };
  const headers = filled[0] ?? [];
  return { headers, rows: filled.slice(1) };
}
