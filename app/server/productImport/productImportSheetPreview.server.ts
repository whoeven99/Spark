/**
 * 导入表格预览：读 original buffer → 解析 → 纯算摘要。零 mutation，不打 Shopify。
 */
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { analyzeImportSheet, coerceProductImportOperations } from "../../lib/productImport";
import {
  buildProductImportSheetPreview,
  type ProductImportSheetPreview,
} from "../../lib/productImportSheetPreview";
import { parseImportSpreadsheet } from "./parseImportSpreadsheet.server";

export type ProductImportSheetPreviewOutcome =
  | { ok: true; preview: ProductImportSheetPreview }
  | { ok: false; code: "file_not_found" | "parse_failed" };

export async function previewProductImportSpreadsheet(params: {
  shop: string;
  fileId: string;
  operations?: string[];
}): Promise<ProductImportSheetPreviewOutcome> {
  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) return { ok: false, code: "file_not_found" };
  let sheet;
  try {
    sheet = await parseImportSpreadsheet(file.buffer, file.name);
  } catch {
    return { ok: false, code: "parse_failed" };
  }
  const selected = coerceProductImportOperations(params.operations);
  const analysis = analyzeImportSheet(sheet.headers, sheet.rows, selected);
  return {
    ok: true,
    preview: buildProductImportSheetPreview({
      fileName: file.name,
      analysis,
      selectedOperations: selected,
    }),
  };
}
