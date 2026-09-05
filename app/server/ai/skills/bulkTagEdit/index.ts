import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkTagEditProposal } from "../../../../lib/taskProposalPayload";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createListProductTagsTool,
  LIST_PRODUCT_TAGS_TOOL_NAME,
} from "./listProductTags.tool";
import {
  bulkTagEditFormTool,
  OPEN_BULK_TAG_EDIT_FORM_TOOL_NAME,
  type BulkTagEditFormPayload,
} from "./bulkTagEdit.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkTagEditFormPayload {
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
    ...(safeString(r.addTags) ? { addTags: safeString(r.addTags) } : {}),
    ...(safeString(r.removeTags) ? { removeTags: safeString(r.removeTags) } : {}),
    ...(safeString(r.removePrefixes) ? { removePrefixes: safeString(r.removePrefixes) } : {}),
  };
}

export const bulkTagEditSkillDefinition: ToolDefinition = {
  name: "bulkTagEdit",
  displayName: "批量打标",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按规则批量增删商品标签：先只读试算并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "商品标签相关需求按下面的分工处理，不要跳步：",
    `1) 用户只想知道现在有哪些标签、哪些商品带某个标签 → 调用 ${LIST_PRODUCT_TAGS_TOOL_NAME}（只读）。`,
    `2) 用户明确要改标签（如「这批商品打上夏季清仓」「去掉 新品 标签」「把 sale- 开头的标签清掉」）→ 调用 ${OPEN_BULK_TAG_EDIT_FORM_TOOL_NAME} 打开确认卡；从[工作台上下文]的「已选商品」逐行提取 ID / 标题 / 图片填入 products。`,
    "3) 从用户话里拆出三个参数：要加的标签填 addTags，要去掉的具体标签填 removeTags，「以 X 开头的标签都删掉」填 removePrefixes；多个标签用逗号分隔。同一个标签不要同时出现在 addTags 和 removeTags。",
    "4) 你没有修改商品标签的能力。禁止声称已改标签或已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
    "5) 用户要移除标签时，提醒一句：标签可能被智能系列（Smart Collection）或其它应用使用，移除后相关商品可能不再出现在对应系列里。",
  ].join("\n"),
  createTool: (context) => [createListProductTagsTool(context), bulkTagEditFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_TAG_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkTagEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkTagEditForm");
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
      payload: buildBulkTagEditProposal({ ...payload, products }),
    });
  },
};
