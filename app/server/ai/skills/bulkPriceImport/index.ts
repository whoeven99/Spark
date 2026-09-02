import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkPriceImportProposal } from "../../../../lib/taskProposalPayload";
import { PREVIEW_IMPORT_SHEET_TOOL_NAME } from "../sheetImport";
import {
  bulkPriceImportFormTool,
  OPEN_BULK_PRICE_IMPORT_FORM_TOOL_NAME,
  type BulkPriceImportFormPayload,
} from "./bulkPriceImport.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkPriceImportFormPayload | null {
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
    ...(safeString(r.priceColumn) ? { priceColumn: safeString(r.priceColumn) } : {}),
    ...(safeString(r.compareAtColumn)
      ? { compareAtColumn: safeString(r.compareAtColumn) }
      : {}),
  };
}

export const bulkPriceImportSkillDefinition: ToolDefinition = {
  name: "bulkPriceImport",
  displayName: "价目表导入",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按商户上传的价目表批量更新商品价格：按 SKU 匹配店铺变体并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "用户上传了价目表 / 报价表 / 调价表并希望据此改价时，按下面的分工处理，不要跳步：",
    `1) 先调用 ${PREVIEW_IMPORT_SHEET_TOOL_NAME} 读取真实表头与样本行。不要只凭[附加文件上下文]里的文本推断列名——那份文本被截断过且列结构已被拍平。`,
    `2) 从真实表头里挑出 SKU 列与价格列，再调用 ${OPEN_BULK_PRICE_IMPORT_FORM_TOOL_NAME} 打开确认卡。列名要原样填表头文字，不要翻译或改写。`,
    "3) 表里没有划线价 / 原价 / 吊牌价这类列，或用户没提到划线价时，不要传 compareAtColumn。",
    "4) 表头看不出哪列是 SKU 或价格时，把表头列给用户看并问清楚，不要瞎猜——猜错会导致大面积匹配失败。",
    "5) 这个能力按表格里的具体数值改价，和「批量调价」按百分比 / 固定金额算价是两件事。用户能用一句话说清规则时走批量调价，价格来自外部表格时才走这里。",
    "6) 表格给的是采购价 / 进价 / 成本，而不是卖给买家的售价时，走「成本价导入」，不要走这里。",
    "7) 你没有修改商品价格的能力。禁止声称已改或已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
  ].join("\n"),
  createTool: () => bulkPriceImportFormTool,
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_PRICE_IMPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkPriceImportForm")
    ) {
      return;
    }
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    if (!payload) return;
    streamContext.emittedFlags.add("bulkPriceImportForm");
    enqueue({
      type: "task_proposal",
      payload: buildBulkPriceImportProposal(payload),
    });
  },
};
