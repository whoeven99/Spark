import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME = "open_inventory_import_form";

export type InventoryImportFormPayload = {
  fileId?: string;
  fileName?: string;
};

export const inventoryImportFormTool = new DynamicStructuredTool({
  name: OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME,
  description:
    "打开「导入库存」确认卡。用户要按 Shopify 官方库存 CSV 校正 On hand 时调用。没有文件也要先开卡。不会立刻写回。",
  schema: z.object({
    fileId: z.string().optional(),
    fileName: z.string().optional(),
  }),
  func: async ({ fileId, fileName }) =>
    JSON.stringify({
      ...(fileId?.trim() ? { fileId: fileId.trim() } : {}),
      ...(fileName?.trim() ? { fileName: fileName.trim() } : {}),
    } satisfies InventoryImportFormPayload),
});
