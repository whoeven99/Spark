import path from "node:path";

export type ParsedFile = {
  text: string;
  charCount: number;
};

const MAX_CHARS_PER_FILE = 20_000;

const SUPPORTED_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".json",
]);

export function isSupportedFileExtension(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export const SUPPORTED_EXTENSIONS_LABEL =
  ".txt / .md / .csv / .json";

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
    case ".csv": {
      text = buffer.toString("utf-8");
      break;
    }
    default: {
      throw new Error(`不支持的文件格式：${ext}。支持：${SUPPORTED_EXTENSIONS_LABEL}`);
    }
  }

  const trimmed = text.trim().slice(0, MAX_CHARS_PER_FILE);
  return { text: trimmed, charCount: trimmed.length };
}
