import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkInventoryImportProposal } from "../../../../lib/taskProposalPayload";
import { PREVIEW_IMPORT_SHEET_TOOL_NAME } from "../sheetImport";
import {
  createBulkInventoryImportFormTool,
  OPEN_BULK_INVENTORY_IMPORT_FORM_TOOL_NAME,
  type BulkInventoryImportFormPayload,
} from "./bulkInventoryImport.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkInventoryImportFormPayload | null {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const r = (parsed ?? {}) as Record<string, unknown>;
  const fileId = safeString(r.fileId);
  // 没有 fileId 就没有可导入的表，卡片开出来也是死的
  if (!fileId) return null;
  const locationOptions = Array.isArray(r.locationOptions)
    ? r.locationOptions
        .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
        .map((o) => ({ value: safeString(o.value) ?? "", label: safeString(o.label) ?? "" }))
        .filter((o) => o.value !== "")
        .map((o) => ({ value: o.value, label: o.label || o.value }))
    : [];
  return {
    fileId,
    ...(safeString(r.fileName) ? { fileName: safeString(r.fileName) } : {}),
    ...(safeString(r.locationId) ? { locationId: safeString(r.locationId) } : {}),
    locationOptions,
    ...(safeString(r.skuColumn) ? { skuColumn: safeString(r.skuColumn) } : {}),
    ...(safeString(r.quantityColumn) ? { quantityColumn: safeString(r.quantityColumn) } : {}),
  };
}

export const bulkInventoryImportSkillDefinition: ToolDefinition = {
  name: "bulkInventoryImport",
  displayName: "库存导入",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按商户上传的库存表批量设置商品在某个地点的可售库存：按 SKU 匹配店铺变体、生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "用户上传了库存表 / 盘点表 / 到货表并希望据此更新库存时，按下面的分工处理，不要跳步：",
    `1) 先调用 ${PREVIEW_IMPORT_SHEET_TOOL_NAME} 读取真实表头与样本行。不要只凭[附加文件上下文]里的文本推断列名——那份文本被截断过且列结构已被拍平。`,
    `2) 从真实表头里挑出 SKU 列与库存数量列，再调用 ${OPEN_BULK_INVENTORY_IMPORT_FORM_TOOL_NAME} 打开确认卡。列名要原样填表头文字，不要翻译或改写。`,
    "3) 库存表里常同时有件数列和金额列（库存金额、成本、售价）。数量列要挑「库存 / 现有库存 / 实盘数量 / Quantity / Stock」这一类，绝不能挑成金额列——挑错会把几千块的金额当成几千件库存写进去。分不清时把表头列给用户看并问清楚。",
    "4) 这是绝对值覆盖：表里写 50 就是把该地点可售库存设成 50，不是加 50。用户想要的是增减而不是设定值时，如实说明本能力只支持设定绝对值。",
    "5) 一次任务只针对一个地点。用户提到仓库 / 门店名称时把它填进 locationKeyword；没提就不要猜，让他在卡片里选。",
    "6) 你没有修改库存的能力。禁止声称已改或已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
  ].join("\n"),
  createTool: (context) => createBulkInventoryImportFormTool(context),
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_INVENTORY_IMPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkInventoryImportForm")
    ) {
      return;
    }
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    if (!payload) return;
    streamContext.emittedFlags.add("bulkInventoryImportForm");
    enqueue({
      type: "task_proposal",
      payload: buildBulkInventoryImportProposal(payload),
    });
  },
};
