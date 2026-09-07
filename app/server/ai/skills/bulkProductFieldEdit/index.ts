import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkProductFieldEditProposal } from "../../../../lib/productManageTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createListProductFieldsTool,
  LIST_PRODUCT_FIELDS_TOOL_NAME,
} from "./listProductFields.tool";
import {
  bulkProductFieldEditFormTool,
  OPEN_BULK_PRODUCT_FIELD_EDIT_FORM_TOOL_NAME,
  type BulkProductFieldEditFormPayload,
} from "./bulkProductFieldEdit.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkProductFieldEditFormPayload {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  const products = Array.isArray(record.products)
    ? record.products
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => ({
          id: normalizeShopifyProductId(safeString(item.id) ?? ""),
          title: safeString(item.title) ?? "",
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
        }))
        .filter((item) => item.id !== "")
    : [];
  return {
    products: products.map((item) => ({ ...item, title: item.title || item.id })),
    ...(safeString(record.field) ? { field: safeString(record.field) } : {}),
    ...(safeString(record.mode) ? { mode: safeString(record.mode) } : {}),
    ...(safeString(record.value) ? { value: safeString(record.value) } : {}),
  };
}

export const bulkProductFieldEditSkillDefinition: ToolDefinition = {
  name: "bulkProductFieldEdit",
  displayName: "批量改商品字段",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按规则批量修改 Vendor、商品类型或 SEO 标题/描述：先只读试算并生成变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "批量改 Vendor / 商品类型 / SEO 标题或描述时按下面分工，不要跳步：",
    `1) 只想看当前值 → 调用 ${LIST_PRODUCT_FIELDS_TOOL_NAME}。`,
    `2) 用户明确要改 → 调用 ${OPEN_BULK_PRODUCT_FIELD_EDIT_FORM_TOOL_NAME}；从[工作台上下文]已选商品填 products。`,
    "3) field：vendor / productType / seoTitle / seoDescription。清空传 mode=clear。禁止改 handle。",
    "4) 你没有写回能力。必须说明「已生成变更预览，确认后还会再确认一次写回」。",
  ].join("\n"),
  createTool: (context) => [createListProductFieldsTool(context), bulkProductFieldEditFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_PRODUCT_FIELD_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkProductFieldEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkProductFieldEditForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const products =
      payload.products.length > 0
        ? payload.products
        : parseWorkspaceProductsFromText(streamContext.lastUserText ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildBulkProductFieldEditProposal({ ...payload, products }),
    });
  },
};
