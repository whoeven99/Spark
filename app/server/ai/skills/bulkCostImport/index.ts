import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkCostImportProposal } from "../../../../lib/taskProposalPayload";
import { PREVIEW_IMPORT_SHEET_TOOL_NAME } from "../sheetImport";
import {
  bulkCostImportFormTool,
  OPEN_BULK_COST_IMPORT_FORM_TOOL_NAME,
  type BulkCostImportFormPayload,
} from "./bulkCostImport.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkCostImportFormPayload | null {
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
  return {
    fileId,
    ...(safeString(r.fileName) ? { fileName: safeString(r.fileName) } : {}),
    ...(safeString(r.skuColumn) ? { skuColumn: safeString(r.skuColumn) } : {}),
    ...(safeString(r.costColumn) ? { costColumn: safeString(r.costColumn) } : {}),
  };
}

export const bulkCostImportSkillDefinition: ToolDefinition = {
  name: "bulkCostImport",
  displayName: "成本价导入",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按商户上传的成本表批量更新商品单位成本：按 SKU 匹配店铺变体、试算毛利率变化并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "用户上传了成本表 / 采购价表 / 供应商进价表并希望据此更新成本时，按下面的分工处理，不要跳步：",
    `1) 先调用 ${PREVIEW_IMPORT_SHEET_TOOL_NAME} 读取真实表头与样本行。不要只凭[附加文件上下文]里的文本推断列名——那份文本被截断过且列结构已被拍平。`,
    `2) 从真实表头里挑出 SKU 列与成本列，再调用 ${OPEN_BULK_COST_IMPORT_FORM_TOOL_NAME} 打开确认卡。列名要原样填表头文字，不要翻译或改写。`,
    "3) 供应商报价表经常同时有成本价和建议零售价两列。成本列要挑「成本 / 成本价 / 采购价 / 进价 / Cost」这一类，绝不能挑成「售价 / 零售价 / 建议零售价 / Retail」——挑错会把售价当成本写进去，让全店毛利看起来接近 0。分不清时把表头列给用户看并问清楚。",
    "4) 用户要改的是卖给买家的售价时走「价目表导入」，不要走这里。这里改的是只影响利润与 ROI 报表的成本，改完买家看到的价格不变。",
    "5) 成本必须是店铺默认货币，Shopify 不接受在导入时指定币种。表格里是其它货币时要提醒用户先换算。",
    "6) 你没有修改商品成本的能力。禁止声称已改或已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
  ].join("\n"),
  createTool: () => bulkCostImportFormTool,
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_COST_IMPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkCostImportForm")
    ) {
      return;
    }
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    if (!payload) return;
    streamContext.emittedFlags.add("bulkCostImportForm");
    enqueue({
      type: "task_proposal",
      payload: buildBulkCostImportProposal(payload),
    });
  },
};
