import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildProductImportProposal } from "../../../../lib/productManageTaskProposals";
import {
  OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME,
  productImportFormTool,
  type ProductImportFormPayload,
} from "./productImport.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): ProductImportFormPayload {
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

export const productImportSkillDefinition: ToolDefinition = {
  name: "productImport",
  displayName: "导入商品",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "上传 CSV / Excel 导入商品变更。先检查是否符合 Shopify 要求并反馈怎么改，确认后才写回。一期支持价格、标签、状态、Vendor、类型、SEO、合集、复制、归档。",
  systemPromptExtension: [
    `用户要导入商品、按表格批量改价/标签/状态/字段/合集/复制/归档时，立刻调用 ${OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME}。没有文件也要开卡，不要只在对话里让对方去上传完再来。`,
    "不要再打开批量调价/打标/上下架那些独立确认卡。改字段/SEO、合集、复制、归档没有独立入口，一律走导入。",
    "Handle / 成本 / Metafield / 删除商品 / 用表格新建商品一期不做，开卡后在校验报告里说明。",
  ].join("\n"),
  createTool: () => [productImportFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("productImportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("productImportForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const fileId = payload.fileId ?? streamContext.fileIds?.[0];
    enqueue({
      type: "task_proposal",
      payload: buildProductImportProposal({
        ...payload,
        ...(fileId ? { fileId } : {}),
      }),
    });
  },
};
