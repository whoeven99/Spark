import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME = "open_product_import_form";

export type ProductImportFormPayload = {
  fileId?: string;
  fileName?: string;
  operations?: string[];
};

export const productImportFormTool = new DynamicStructuredTool({
  name: OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME,
  description:
    "打开「导入商品」确认卡片。用户要按表格改标题、正文、价格、成本、标签、状态、Vendor、类型、SEO、Handle、合集、Metafield、复制、归档或删除时调用。没有文件也要先开卡。可预填 operations（子功能 key 列表）和已上传文件；不要在对话里复述支持字段。不会立即写回店铺。",
  schema: z.object({
    fileId: z.string().optional(),
    fileName: z.string().optional(),
    operations: z
      .array(z.string())
      .optional()
      .describe("要预勾的子功能 key。不确定就留空，让商户在卡片上自己选。"),
  }),
  func: async ({ fileId, fileName, operations }) =>
    JSON.stringify({
      ...(fileId?.trim() ? { fileId: fileId.trim() } : {}),
      ...(fileName?.trim() ? { fileName: fileName.trim() } : {}),
      ...(operations?.length ? { operations } : {}),
    } satisfies ProductImportFormPayload),
});
