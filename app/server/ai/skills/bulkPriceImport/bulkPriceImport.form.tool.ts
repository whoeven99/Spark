import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const OPEN_BULK_PRICE_IMPORT_FORM_TOOL_NAME = "open_bulk_price_import_form";

export type BulkPriceImportFormPayload = {
  fileId: string;
  fileName?: string;
  skuColumn?: string;
  priceColumn?: string;
  compareAtColumn?: string;
};

/**
 * 打开「按表格导入价格」确认卡。工具本身不读文件也不碰 Shopify：
 * 它只把「用户上传的表格 + 猜出来的列映射」结构化后交给确认卡，
 * 真正的解析与匹配发生在用户确认之后的 dry-run 任务里。
 */
export const bulkPriceImportFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_PRICE_IMPORT_FORM_TOOL_NAME,
  description:
    "打开「按表格批量导入价格」确认卡片。当用户上传了价目表 / 报价表 / 调价表，并希望按表格里的价格更新商品时调用（如「按这个表更新价格」「供应商发了新报价，帮我改」）。调用后不会修改任何商品。",
  schema: z.object({
    fileId: z
      .string()
      .describe("要导入的文件 ID，从[附加文件上下文]里取当前这张表对应的文件 ID"),
    fileName: z.string().optional().describe("文件名，用于在卡片上让用户确认传对了表"),
    skuColumn: z
      .string()
      .optional()
      .describe(
        "表格里存放商品货号的列名，从文件内容的表头里挑一个最像 SKU 的（如 SKU、货号、商品编码）。原样填表头文字，不要改写",
      ),
    priceColumn: z
      .string()
      .optional()
      .describe(
        "表格里存放新售价的列名（如 售价、价格、Price、新价）。原样填表头文字，不要改写",
      ),
    compareAtColumn: z
      .string()
      .optional()
      .describe(
        "表格里存放划线价 / 原价 / 吊牌价的列名。表里没有这类列，或用户没要求改划线价时不传",
      ),
  }),
  func: async ({ fileId, fileName, skuColumn, priceColumn, compareAtColumn }) => {
    const payload: BulkPriceImportFormPayload = {
      fileId: fileId.trim(),
      ...(fileName?.trim() ? { fileName: fileName.trim() } : {}),
      ...(skuColumn?.trim() ? { skuColumn: skuColumn.trim() } : {}),
      ...(priceColumn?.trim() ? { priceColumn: priceColumn.trim() } : {}),
      ...(compareAtColumn?.trim() ? { compareAtColumn: compareAtColumn.trim() } : {}),
    };
    return JSON.stringify(payload);
  },
});
