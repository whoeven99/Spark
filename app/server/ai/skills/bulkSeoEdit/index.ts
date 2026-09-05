import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkSeoEditProposal } from "../../../../lib/taskProposalPayload";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import { createListProductSeoTool, LIST_PRODUCT_SEO_TOOL_NAME } from "./listProductSeo.tool";
import {
  bulkSeoEditFormTool,
  OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME,
  type BulkSeoEditFormPayload,
} from "./bulkSeoEdit.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkSeoEditFormPayload {
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
  return {
    products: products.map((p) => ({ ...p, title: p.title || p.id })),
    ...(safeString(r.titleTemplate) ? { titleTemplate: safeString(r.titleTemplate) } : {}),
    ...(safeString(r.descriptionTemplate)
      ? { descriptionTemplate: safeString(r.descriptionTemplate) }
      : {}),
    ...(typeof r.onlyFillEmpty === "boolean" ? { onlyFillEmpty: r.onlyFillEmpty } : {}),
    ...(safeString(r.overflow) ? { overflow: safeString(r.overflow) } : {}),
  };
}

export const bulkSeoEditSkillDefinition: ToolDefinition = {
  name: "bulkSeoEdit",
  displayName: "批量改 SEO",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按模板批量改写商品 SEO 标题与描述：先只读渲染并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "商品 SEO（搜索引擎标题 / 描述）相关需求按下面的分工处理，不要跳步：",
    `1) 用户想知道现在的 SEO 写了什么、哪些商品缺 SEO、或想先看看模板渲染出来长什么样 → 调用 ${LIST_PRODUCT_SEO_TOOL_NAME}（只读，可带模板做试算）。`,
    `2) 用户明确要批量改 SEO（如「统一加上品牌后缀」「把没写 SEO 描述的补上」）→ 调用 ${OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME} 打开确认卡；从[工作台上下文]的「已选商品」逐行提取 ID / 标题 / 图片填入 products。`,
    "3) 模板占位符只有 {title}、{vendor}、{productType} 三个，不要发明别的占位符。用户说「只补空的、别覆盖已有的」时传 onlyFillEmpty=true。",
    "4) SEO 标题建议不超过 60 字符、描述不超过 160 字符；模板写得过长时提醒用户结果会被截断。",
    "5) 这个能力改的是搜索引擎元数据，不是商品正文描述。用户要改商品详情正文时走商品文案优化，不要用这个工具。",
    "6) 你没有修改商品 SEO 的能力。禁止声称已改或已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
  ].join("\n"),
  createTool: (context) => [createListProductSeoTool(context), bulkSeoEditFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_SEO_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkSeoEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkSeoEditForm");
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
      payload: buildBulkSeoEditProposal({ ...payload, products }),
    });
  },
};
