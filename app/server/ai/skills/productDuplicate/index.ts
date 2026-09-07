import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildProductDuplicateProposal } from "../../../../lib/productManageTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  OPEN_PRODUCT_DUPLICATE_FORM_TOOL_NAME,
  productDuplicateFormTool,
  type ProductDuplicateFormPayload,
} from "./productDuplicate.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): ProductDuplicateFormPayload {
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
    ...(safeString(record.titleSuffix) ? { titleSuffix: safeString(record.titleSuffix) } : {}),
    ...(safeString(record.includeImages) ? { includeImages: safeString(record.includeImages) } : {}),
    ...(safeString(record.newStatus) ? { newStatus: safeString(record.newStatus) } : {}),
  };
}

export const productDuplicateSkillDefinition: ToolDefinition = {
  name: "productDuplicate",
  displayName: "复制商品",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description: "复制已有商品：先预览新标题与状态，用户确认后才在店铺创建副本",
  systemPromptExtension: [
    `用户要复制/拷贝商品时调用 ${OPEN_PRODUCT_DUPLICATE_FORM_TOOL_NAME}。`,
    "默认新商品为草稿并复制图片。你不会真正创建副本，必须等用户在卡片里确认。",
  ].join("\n"),
  createTool: () => [productDuplicateFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_PRODUCT_DUPLICATE_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("productDuplicateForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("productDuplicateForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const products =
      payload.products.length > 0
        ? payload.products
        : parseWorkspaceProductsFromText(streamContext.lastUserText ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildProductDuplicateProposal({ ...payload, products }),
    });
  },
};
