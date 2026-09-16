import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME = "open_inventory_import_form";

export const inventoryImportFormTool = new DynamicStructuredTool({
  name: OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME,
  description:
    "打开「导入库存」确认卡。只接受 Shopify 库存 CSV（必须有 Location 与 On hand (new)）。SKU 列不会改 SKU。没有文件也先开卡。",
  schema: z.object({
    fileId: z.string().optional(),
    fileName: z.string().optional(),
  }),
  func: async ({ fileId, fileName }) =>
    JSON.stringify({ fileId: fileId ?? "", fileName: fileName ?? "" }),
});
