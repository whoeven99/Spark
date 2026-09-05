import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkCollectionEditProposal } from "../../../../lib/taskProposalPayload";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createListCollectionsTool,
  LIST_COLLECTIONS_TOOL_NAME,
} from "./listCollections.tool";
import {
  createBulkCollectionEditFormTool,
  OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME,
  type BulkCollectionEditFormPayload,
} from "./bulkCollectionEdit.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkCollectionEditFormPayload {
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
  const collectionOptions = Array.isArray(r.collectionOptions)
    ? r.collectionOptions
        .filter((o): o is Record<string, unknown> => o !== null && typeof o === "object")
        .map((o) => ({ value: safeString(o.value) ?? "", label: safeString(o.label) ?? "" }))
        .filter((o) => o.value !== "")
        .map((o) => ({ value: o.value, label: o.label || o.value }))
    : [];
  return {
    products: products.map((p) => ({ ...p, title: p.title || p.id })),
    ...(safeString(r.action) ? { action: safeString(r.action) } : {}),
    ...(safeString(r.collectionId) ? { collectionId: safeString(r.collectionId) } : {}),
    collectionOptions,
    ...(r.collectionsTruncated === true ? { collectionsTruncated: true } : {}),
  };
}

export const bulkCollectionEditSkillDefinition: ToolDefinition = {
  name: "bulkCollectionEdit",
  displayName: "批量调整合集",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "把一批商品加入或移出指定合集：先只读试算并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "商品合集（Collection）相关需求按下面的分工处理，不要跳步：",
    `1) 用户只想知道有哪些合集、某个合集里有多少商品 → 调用 ${LIST_COLLECTIONS_TOOL_NAME}（只读）。`,
    `2) 用户要把商品批量加入 / 移出某个合集 → 调用 ${OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME} 打开确认卡；从[工作台上下文]的「已选商品」逐行提取 ID / 标题 / 图片填入 products，用户提到的合集名称填 collectionKeyword。`,
    "3) 方向必须来自用户原话：加入传 action=add，移出传 action=remove。用户没说清就不要猜，留空让他在卡片里选。",
    "4) 你没有修改合集成员的能力。禁止声称已加入 / 已移出 / 已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
    "5) 只有手动合集能改成员。智能合集（规则 / 条件驱动）的成员由规则决定，如实告诉用户要去 Shopify 后台改合集规则，不要建议用本能力硬改。",
    "6) 一次任务只针对一个合集。用户要同时动多个合集时，逐个开卡处理。",
  ].join("\n"),
  createTool: (context) => [
    createListCollectionsTool(context),
    createBulkCollectionEditFormTool(context),
  ],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkCollectionEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkCollectionEditForm");
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
      payload: buildBulkCollectionEditProposal({ ...payload, products }),
    });
  },
};
