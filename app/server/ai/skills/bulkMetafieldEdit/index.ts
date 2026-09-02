import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkMetafieldEditProposal } from "../../../../lib/taskProposalPayload";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createListProductMetafieldsTool,
  LIST_PRODUCT_METAFIELDS_TOOL_NAME,
} from "./listProductMetafields.tool";
import {
  createBulkMetafieldEditFormTool,
  OPEN_BULK_METAFIELD_EDIT_FORM_TOOL_NAME,
  type BulkMetafieldEditFormPayload,
} from "./bulkMetafieldEdit.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkMetafieldEditFormPayload {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const r = (parsed ?? {}) as Record<string, unknown>;
  const products = Array.isArray(r.products)
    ? r.products
        .filter((p): p is Record<string, unknown> => p !== null && typeof p === "object")
        .map((p) => ({
          id: normalizeShopifyProductId(safeString(p.id) ?? ""),
          title: safeString(p.title) ?? "",
          imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : null,
        }))
        .filter((p) => p.id !== "")
    : [];
  const fieldOptions = Array.isArray(r.fieldOptions)
    ? r.fieldOptions
        .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
        .map((o) => ({ value: safeString(o.value) ?? "", label: safeString(o.label) ?? "" }))
        .filter((o) => o.value !== "")
        .map((o) => ({ value: o.value, label: o.label || o.value }))
    : [];
  return {
    products: products.map((p) => ({ ...p, title: p.title || p.id })),
    ...(safeString(r.action) ? { action: safeString(r.action) } : {}),
    ...(safeString(r.fieldKey) ? { fieldKey: safeString(r.fieldKey) } : {}),
    ...(typeof r.value === "string" ? { value: r.value } : {}),
    ...(r.onlyFillEmpty === true ? { onlyFillEmpty: true } : {}),
    fieldOptions,
    ...(r.fieldsTruncated === true ? { fieldsTruncated: true } : {}),
  };
}

export const bulkMetafieldEditSkillDefinition: ToolDefinition = {
  name: "bulkMetafieldEdit",
  displayName: "批量改自定义字段",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "给一批商品统一填写或清空某个自定义字段（metafield）：先只读试算并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "商品自定义字段（metafield）相关需求按下面的分工处理，不要跳步：",
    `1) 用户只想知道有哪些自定义字段、字段是什么类型 → 调用 ${LIST_PRODUCT_METAFIELDS_TOOL_NAME}（只读）。`,
    `2) 用户要给一批商品统一填写或清空某个字段 → 调用 ${OPEN_BULK_METAFIELD_EDIT_FORM_TOOL_NAME} 打开确认卡；从[工作台上下文]的「已选商品」逐行提取 ID / 标题 / 图片填入 products，用户提到的字段名填 fieldKeyword，要写的值填 value。`,
    "3) 动作必须来自用户原话：写入值传 action=set，清空传 action=clear。用户没说清就不要猜，留空让他在卡片里选。",
    "4) 值里可以用 {title} / {vendor} / {productType} 按商品取值，其它占位符一律不认。用户要「每个商品填自己的品牌」这类需求时才用占位符，说死一个值时就原样填。",
    "5) 只支持单行文本、多行文本、整数、小数、是否值、网址这几种标量类型。用户要改的是 list / 引用 / 富文本类字段时，如实说明本能力不支持，让他去 Shopify 后台改，不要硬开卡。",
    "6) 你没有修改商品字段的能力。禁止声称已写入 / 已清空；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
    "7) 一次任务只针对一个字段。用户要同时动多个字段时，逐个开卡处理。",
  ].join("\n"),
  createTool: (context) => [
    createListProductMetafieldsTool(context),
    createBulkMetafieldEditFormTool(context),
  ],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_METAFIELD_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkMetafieldEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkMetafieldEditForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    // AI 没填商品时用工作台上下文兜底；仍为空则由卡片露出「选择商品」空态
    const products =
      payload.products.length > 0
        ? payload.products
        : parseWorkspaceProductsFromText(streamContext.lastUserText ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildBulkMetafieldEditProposal({ ...payload, products }),
    });
  },
};
