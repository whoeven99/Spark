import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildProductImportProposal } from "../../../../lib/productManageTaskProposals";
import { coerceProductImportOperations } from "../../../../lib/productImport";
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
  const operations = coerceProductImportOperations(record.operations);
  return {
    ...(safeString(record.fileId) ? { fileId: safeString(record.fileId) } : {}),
    ...(safeString(record.fileName) ? { fileName: safeString(record.fileName) } : {}),
    ...(operations.length > 0 ? { operations } : {}),
  };
}

export const productImportSkillDefinition: ToolDefinition = {
  name: "productImport",
  displayName: "导入商品",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "在确认卡上勾选要写入的子功能并上传 CSV / Excel。勾选哪项，试算和写回就只走对应模块。先校验再确认写回。",
  systemPromptExtension: [
    `用户要导入商品、按表格批量改价/标签/状态/字段/合集/复制/归档/删除时，立刻调用 ${OPEN_PRODUCT_IMPORT_FORM_TOOL_NAME}。没有文件也要开卡，不要只在对话里让对方去上传完再来。`,
    "若用户明确只要改某一类（例如只改价格或只改 SEO），把 operations 预填成对应 key；否则留空，让商户在卡片上自己勾选。不要在对话里复述支持/不支持字段清单。",
    "不要再打开批量调价/打标/上下架那些独立确认卡。改字段/SEO、合集、复制、归档、成本、Handle、Metafield、删除没有独立入口，一律走导入卡上的对应子功能。",
    "用表格新建商品、改库存数量、改销售渠道一期仍不做，开卡后在校验报告里说明。",
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
