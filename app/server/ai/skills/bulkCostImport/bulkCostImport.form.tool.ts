import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const OPEN_BULK_COST_IMPORT_FORM_TOOL_NAME = "open_bulk_cost_import_form";

export type BulkCostImportFormPayload = {
  fileId: string;
  fileName?: string;
  skuColumn?: string;
  costColumn?: string;
};

/**
 * 打开「按表格导入成本价」确认卡。工具本身不读文件也不碰 Shopify：
 * 它只把「用户上传的表格 + 猜出来的列映射」结构化后交给确认卡，
 * 真正的解析与匹配发生在用户确认之后的 dry-run 任务里。
 */
export const bulkCostImportFormTool = new DynamicStructuredTool({
  name: OPEN_BULK_COST_IMPORT_FORM_TOOL_NAME,
  description:
    "打开「按表格批量导入成本价」确认卡片。当用户上传了成本表 / 采购价表 / 供应商进价表，并希望按表格更新商品成本时调用（如「按这个表更新成本」「供应商进价变了，帮我改成本」）。成本只影响利润与 ROI 报表，不改买家看到的售价。调用后不会修改任何商品。",
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
    costColumn: z
      .string()
      .optional()
      .describe(
        "表格里存放单位成本的列名（如 成本、成本价、采购价、进价、Cost、Unit Cost）。注意不要选成售价 / 零售价 / 建议零售价。原样填表头文字，不要改写",
      ),
  }),
  func: async ({ fileId, fileName, skuColumn, costColumn }) => {
    const payload: BulkCostImportFormPayload = {
      fileId: fileId.trim(),
      ...(fileName?.trim() ? { fileName: fileName.trim() } : {}),
      ...(skuColumn?.trim() ? { skuColumn: skuColumn.trim() } : {}),
      ...(costColumn?.trim() ? { costColumn: costColumn.trim() } : {}),
    };
    return JSON.stringify(payload);
  },
});
