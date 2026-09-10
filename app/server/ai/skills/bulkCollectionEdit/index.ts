import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkCollectionEditProposal } from "../../../../lib/productManageTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createBulkCollectionEditFormTool,
  OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME,
  type BulkCollectionEditFormPayload,
} from "./bulkCollectionEdit.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  const collections = Array.isArray(record.collections)
    ? record.collections
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => ({
          value: safeString(item.value) ?? "",
          label: safeString(item.label) ?? safeString(item.value) ?? "",
        }))
        .filter((item) => item.value !== "")
    : [];
  return {
    products: products.map((item) => ({ ...item, title: item.title || item.id })),
    collections,
    ...(safeString(record.collectionAction)
      ? { collectionAction: safeString(record.collectionAction) }
      : {}),
    ...(safeString(record.collectionId) ? { collectionId: safeString(record.collectionId) } : {}),
  };
}

export const bulkCollectionEditSkillDefinition: ToolDefinition = {
  name: "bulkCollectionEdit",
  displayName: "批量调整合集",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "把商品批量加入或移出合集：先只读试算并生成变更清单，用户验收后才写回。",
  systemPromptExtension: [
    "批量改合集成员时：",
    `1) 用户要加入/移出/调整合集 → 立刻调用 ${OPEN_BULK_COLLECTION_EDIT_FORM_TOOL_NAME} 打开确认卡。方向和目标合集在卡片里选，不要先问合集 GID，也不要只在对话里追问。`,
    "2) 若用户已说加入或移出，可预填 collectionAction=add 或 remove；没说就留空。collectionId 仅在用户已给出合集 GID 时填写。",
    "3) 你没有写回能力，必须说明还要在卡片里确认两次。",
  ].join("\n"),
  createTool: (context) => [createBulkCollectionEditFormTool(context)],
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
