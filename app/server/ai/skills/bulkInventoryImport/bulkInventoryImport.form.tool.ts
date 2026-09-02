import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgentContext } from "../../core/toolRegistry.server";
import { listActiveLocations } from "../../../shopify/locationReader.server";

export const OPEN_BULK_INVENTORY_IMPORT_FORM_TOOL_NAME = "open_bulk_inventory_import_form";

export type BulkInventoryImportFormPayload = {
  fileId: string;
  fileName?: string;
  locationId?: string;
  locationOptions: Array<{ value: string; label: string }>;
  skuColumn?: string;
  quantityColumn?: string;
};

function optionLabel(name: string, isPrimary: boolean): string {
  return isPrimary ? `${name} · 默认地点` : name;
}

/**
 * 打开「按表格导入库存」确认卡。
 *
 * 与成本价导入开卡工具的区别：这里必须读一次 Shopify 拿地点列表。库存量是
 * 「库存项 × 地点」的交叉数据，卡片上的地点下拉需要真实选项，而卡片渲染发生在
 * SSE 同步回调里、没法再发异步请求。读的是只读列表，不做任何写入。
 *
 * 表格本身不在这里解析——真正的读表与 SKU 匹配发生在用户确认之后的 dry-run 任务里。
 */
export function createBulkInventoryImportFormTool(
  context: AgentContext,
): DynamicStructuredTool {
  const { admin } = context;
  return new DynamicStructuredTool({
    name: OPEN_BULK_INVENTORY_IMPORT_FORM_TOOL_NAME,
    description:
      "打开「按表格批量导入库存」确认卡片。当用户上传了库存表 / 盘点表 / 到货表，并希望按表格把商品库存设成表里的数量时调用（如「按这个表更新库存」「盘点完了帮我改库存」）。改的是指定地点的可售库存，绝对值覆盖。调用后不会修改任何库存。",
    schema: z.object({
      fileId: z
        .string()
        .describe("要导入的文件 ID，从[附加文件上下文]里取当前这张表对应的文件 ID"),
      fileName: z.string().optional().describe("文件名，用于在卡片上让用户确认传对了表"),
      locationKeyword: z
        .string()
        .optional()
        .describe("用户提到的地点名称关键词（如「主仓」「广州仓」）；没提就不要传"),
      skuColumn: z
        .string()
        .optional()
        .describe(
          "表格里存放商品货号的列名，从文件内容的表头里挑一个最像 SKU 的（如 SKU、货号、商品编码）。原样填表头文字，不要改写",
        ),
      quantityColumn: z
        .string()
        .optional()
        .describe(
          "表格里存放库存件数的列名（如 库存、现有库存、实盘数量、Quantity、Stock）。注意不要选成金额、成本或售价列。原样填表头文字，不要改写",
        ),
    }),
    func: async ({ fileId, fileName, locationKeyword, skuColumn, quantityColumn }) => {
      const locations = await listActiveLocations(admin);
      const locationOptions = locations.map((location) => ({
        value: location.id,
        label: optionLabel(location.name, location.isPrimary),
      }));

      // 关键词只是帮忙预选，匹配不上也不缩减下拉——地点数量少，全列出来更安全
      const keyword = locationKeyword?.trim().toLowerCase() ?? "";
      const matched = keyword
        ? locations.filter((location) => location.name.toLowerCase().includes(keyword))
        : [];
      const preselected = matched.length === 1 ? matched[0].id : "";

      const payload: BulkInventoryImportFormPayload = {
        fileId: fileId.trim(),
        ...(fileName?.trim() ? { fileName: fileName.trim() } : {}),
        ...(preselected ? { locationId: preselected } : {}),
        locationOptions,
        ...(skuColumn?.trim() ? { skuColumn: skuColumn.trim() } : {}),
        ...(quantityColumn?.trim() ? { quantityColumn: quantityColumn.trim() } : {}),
      };
      return JSON.stringify({
        ...payload,
        // 给模型的额外说明，不进卡片
        locationCount: locations.length,
      });
    },
  });
}
