import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildInventoryImportProposal } from "../../../../lib/inventoryTaskProposals";
import {
  OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME,
  inventoryImportFormTool,
} from "./inventoryImport.form.tool";

export const inventoryImportSkillDefinition: ToolDefinition = {
  name: "inventoryImport",
  displayName: "导入库存",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description: "导入 Shopify 官方库存 CSV，按仓改在库数量。确认后才写回。",
  systemPromptExtension: [
    `用户要导入库存、上传库存表、按 CSV 改库存时立刻调用 ${OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME}。`,
    "不要走导入商品。库存 CSV 的 SKU 列不会改 SKU。改 SKU 用导入商品并勾选 SKU。",
  ].join("\n"),
  createTool: () => [inventoryImportFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventoryImportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventoryImportForm");
    let parsed: unknown = ev.output;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }
    const record = (parsed ?? {}) as Record<string, unknown>;
    enqueue({
      type: "task_proposal",
      payload: buildInventoryImportProposal({
        fileId: typeof record.fileId === "string" ? record.fileId : streamContext.fileIds?.[0],
        fileName: typeof record.fileName === "string" ? record.fileName : undefined,
      }),
    });
  },
};
