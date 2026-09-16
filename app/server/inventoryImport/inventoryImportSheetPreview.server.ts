/**
 * 库存导入确认卡预览：读 original buffer → 解析 → 纯算摘要。零 mutation，不打 Shopify。
 */
import { loadOriginalFileBuffer } from "../fileContext/fileStore.server";
import { parseImportSpreadsheet } from "../productImport/parseImportSpreadsheet.server";
import {
  buildInventoryImportSheetPreview,
  type InventoryImportSheetPreview,
} from "../../lib/inventoryImportSheetPreview";

export type InventoryImportSheetPreviewOutcome =
  | { ok: true; preview: InventoryImportSheetPreview }
  | { ok: false; code: "file_not_found" | "parse_failed" };

export async function previewInventoryImportSpreadsheet(params: {
  shop: string;
  fileId: string;
}): Promise<InventoryImportSheetPreviewOutcome> {
  const file = await loadOriginalFileBuffer(params.shop, params.fileId);
  if (!file) return { ok: false, code: "file_not_found" };
  let sheet;
  try {
    sheet = await parseImportSpreadsheet(file.buffer, file.name);
  } catch {
    return { ok: false, code: "parse_failed" };
  }
  return {
    ok: true,
    preview: buildInventoryImportSheetPreview({
      fileName: file.name,
      headers: sheet.headers,
      rows: sheet.rows,
    }),
  };
}
