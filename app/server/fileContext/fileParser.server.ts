import path from "node:path";

export type ParsedFile = {
  text: string;
  charCount: number;
};

const MAX_CHARS_PER_FILE = 20_000;

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".pdf", ".docx", ".csv", ".xlsx", ".xls", ".json",
]);

export function isSupportedFileExtension(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export const SUPPORTED_EXTENSIONS_LABEL =
  ".txt / .md / .pdf / .docx / .csv / .xlsx / .json";

export async function parseFileBuffer(
  buffer: Buffer,
  filename: string,
): Promise<ParsedFile> {
  const ext = path.extname(filename).toLowerCase();
  let text: string;

  switch (ext) {
    case ".txt":
    case ".md": {
      text = buffer.toString("utf-8");
      break;
    }
    case ".json": {
      try {
        const obj = JSON.parse(buffer.toString("utf-8")) as unknown;
        text = JSON.stringify(obj, null, 2);
      } catch {
        text = buffer.toString("utf-8");
      }
      break;
    }
    case ".pdf": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const pdfModule = (await import("pdf-parse")) as any;
      const pdfParse = (pdfModule.default ?? pdfModule) as (
        data: Buffer,
        options?: object,
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer, { max: 0 });
      text = result.text;
      break;
    }
    case ".docx": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = (await import("mammoth")) as {
        extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      break;
    }
    case ".csv": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const papaModule = (await import("papaparse" as string)) as any;
      const Papa = (papaModule.default ?? papaModule) as {
        parse: <T>(input: string, config?: object) => { data: T[] };
      };
      const csvText = buffer.toString("utf-8");
      const parsed = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true });
      text = parsed.data.map((row: string[]) => row.join("\t")).join("\n");
      break;
    }
    case ".xlsx":
    case ".xls": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = (await import("xlsx")) as {
        read: (data: Buffer, opts?: object) => { SheetNames: string[]; Sheets: Record<string, unknown> };
        utils: { sheet_to_csv: (sheet: unknown) => string };
      };
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets = workbook.SheetNames.map((name) => {
        const sheet = workbook.Sheets[name];
        return `[Sheet: ${name}]\n${XLSX.utils.sheet_to_csv(sheet)}`;
      });
      text = sheets.join("\n\n");
      break;
    }
    default: {
      throw new Error(`不支持的文件格式：${ext}。支持：${SUPPORTED_EXTENSIONS_LABEL}`);
    }
  }

  const trimmed = text.trim().slice(0, MAX_CHARS_PER_FILE);
  return { text: trimmed, charCount: trimmed.length };
}
