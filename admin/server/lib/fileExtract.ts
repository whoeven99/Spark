/**
 * Extract plain text from common document formats.
 * Used by the glossary file-parse endpoint.
 */

const MAX_CHARS = 14_000;

export type ExtractResult = {
  text: string;
  truncated: boolean;
};

export async function extractFileText(
  buffer: Buffer,
  originalName: string,
): Promise<ExtractResult> {
  const ext = originalName.toLowerCase().split(".").pop() ?? "";

  let text: string;

  if (ext === "docx" || ext === "doc") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      parts.push(XLSX.utils.sheet_to_csv(sheet));
    }
    text = parts.join("\n\n");
  } else if (ext === "pdf") {
    // @ts-expect-error — pdf-parse lacks complete type declarations
    const pdfParse = (await import("pdf-parse")).default;
    const result = (await pdfParse(buffer)) as { text: string };
    text = result.text;
  } else {
    // .txt, .csv, .json, anything else — treat as UTF-8 text
    text = buffer.toString("utf8");
  }

  const truncated = text.length > MAX_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_CHARS) : text,
    truncated,
  };
}
