import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildInventoryImportProposal } from "../../../../lib/inventoryTaskProposals";
import {
  OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME,
  inventoryImportFormTool,
  type InventoryImportFormPayload,
} from "./inventoryImport.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): InventoryImportFormPayload {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  return {
    ...(safeString(record.fileId) ? { fileId: safeString(record.fileId) } : {}),
    ...(safeString(record.fileName) ? { fileName: safeString(record.fileName) } : {}),
  };
}

export const inventoryImportSkillDefinition: ToolDefinition = {
  name: "inventoryImport",
  displayName: "导入库存",
  category: "库存与 SKU",
  stage: "execute",
  visibility: "public",
  description: "按 Shopify 官方 All states 库存 CSV 校正 On hand。先校验再确认写回。",
  systemPromptExtension: [
    `用户要导入库存、上传盘点表、按 CSV 改 On hand 时立刻调用 ${OPEN_INVENTORY_IMPORT_FORM_TOOL_NAME}。没有文件也要开卡。`,
    "不要打开导入商品卡。商品导入不写库存数量。",
    "只接受带 Location 与 On hand (new) 的官方库存表；地点当列头的 Available 宽表要让商户改用导出库存得到的表。",
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
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const fileId = payload.fileId ?? streamContext.fileIds?.[0];
    enqueue({
      type: "task_proposal",
      payload: buildInventoryImportProposal({
        ...payload,
        ...(fileId ? { fileId } : {}),
      }),
    });
  },
};
