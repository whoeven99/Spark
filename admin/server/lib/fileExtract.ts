/**
 * Text extraction helpers for glossary file parsing.
 * Supports: .txt .csv .json  •  .xlsx  •  .docx  •  .pdf
 *
 * Each extractor returns the raw text content that the LLM will receive.
 * Throws on unrecognised / unreadable files.
 */

import path from "node:path";

/** Maximum characters sent to the LLM (keeps cost & latency bounded). */
const LLM_TEXT_LIMIT = 14_000;

export type ExtractedFile = {
  text: string;
  /** Trimmed to LLM_TEXT_LIMIT — true when truncation occurred. */
  truncated: boolean;
};

export async function extractFileText(
  buffer: Buffer,
  originalName: string,
): Promise<ExtractedFile> {
  const ext = path.extname(originalName).toLowerCase();

  let text: string;
  switch (ext) {
    case ".txt":
    case ".csv":
    case ".json":
      text = buffer.toString("utf8");
      break;

    case ".xlsx":
    case ".xls":
      text = extractExcel(buffer);
      break;

    case ".docx":
      text = await extractDocx(buffer);
      break;

    case ".pdf":
      text = await extractPdf(buffer);
      break;

    default:
      throw new Error(`不支持的文件格式 "${ext}"。支持：.txt .csv .json .xlsx .docx .pdf`);
  }

  const trimmed = text.trim();
  if (!trimmed) throw new Error("文件内容为空或无法提取文字");

  if (trimmed.length <= LLM_TEXT_LIMIT) {
    return { text: trimmed, truncated: false };
  }
  return { text: trimmed.slice(0, LLM_TEXT_LIMIT), truncated: true };
}

// ── Excel ─────────────────────────────────────────────────────────────────────

function extractExcel(buffer: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const lines: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim()) lines.push(`=== ${sheetName} ===\n${csv}`);
  }
  return lines.join("\n\n");
}

// ── Word (.docx) ──────────────────────────────────────────────────────────────

async function extractDocx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth") as typeof import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ── PDF ───────────────────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse has no named exports — use require
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text;
}
