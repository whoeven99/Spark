import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME = "open_product_import_form";

export type ProductImportFormPayload = {
  fileId?: string;
  fileName?: string;
};

export const productImportFormTool = new DynamicStructuredTool({
  name: OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME,
  description:
    "打开「导入商品」确认卡片。用户要导入/批量改价格、标签、状态、Vendor、类型、SEO、合集、复制或归档时调用。即使还没上传文件也要先开卡。不会立即写回店铺。",
  schema: z.object({
    fileId: z.string().optional(),
    fileName: z.string().optional(),
  }),
  func: async ({ fileId, fileName }) =>
    JSON.stringify({
      ...(fileId?.trim() ? { fileId: fileId.trim() } : {}),
      ...(fileName?.trim() ? { fileName: fileName.trim() } : {}),
    } satisfies ProductImportFormPayload),
});
