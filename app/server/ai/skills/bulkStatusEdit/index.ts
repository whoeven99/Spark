import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkStatusEditProposal } from "../../../../lib/taskProposalPayload";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createListProductStatusTool,
  LIST_PRODUCT_STATUS_TOOL_NAME,
} from "./listProductStatus.tool";
import {
  bulkStatusEditFormTool,
  OPEN_BULK_STATUS_EDIT_FORM_TOOL_NAME,
  type BulkStatusEditFormPayload,
} from "./bulkStatusEdit.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkStatusEditFormPayload {
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
    ...(safeString(r.targetStatus) ? { targetStatus: safeString(r.targetStatus) } : {}),
    ...(safeString(r.inventoryCondition)
      ? { inventoryCondition: safeString(r.inventoryCondition) }
      : {}),
  };
}

export const bulkStatusEditSkillDefinition: ToolDefinition = {
  name: "bulkStatusEdit",
  displayName: "批量上下架",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按规则批量上架或下架商品：先只读试算并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "商品上下架相关需求按下面的分工处理，不要跳步：",
    `1) 用户只想知道哪些商品是草稿、有没有上架 → 调用 ${LIST_PRODUCT_STATUS_TOOL_NAME}（只读）。`,
    `2) 用户明确要改上下架状态（如「把这批断货的下架」「补货的重新上架」）→ 调用 ${OPEN_BULK_STATUS_EDIT_FORM_TOOL_NAME} 打开确认卡；从[工作台上下文]的「已选商品」逐行提取 ID / 标题 / 图片填入 products。`,
    "3) 方向必须来自用户原话：上架传 targetStatus=active，下架为草稿传 draft。用户没说清就不要猜，留空让他在卡片里选。",
    "4) 你没有修改商品上下架状态的能力。禁止声称已上架 / 已下架 / 已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
    "5) 本能力只改商品状态，不改销售渠道发布关系。改成 Active 后如果商品从未发布到 Online Store，店面仍可能看不到，需要商户在 Shopify 后台确认销售渠道。",
    "6) 归档（Archived）商品不在本能力范围内，会被跳过；用户要恢复归档商品时如实说明需要在 Shopify 后台处理。",
  ].join("\n"),
  createTool: (context) => [createListProductStatusTool(context), bulkStatusEditFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_STATUS_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkStatusEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkStatusEditForm");
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
      payload: buildBulkStatusEditProposal({ ...payload, products }),
    });
  },
};
