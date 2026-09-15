import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildInventoryExportProposal } from "../../../../lib/inventoryTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME,
  inventoryExportFormTool,
  type InventoryExportFormPayload,
} from "./inventoryExport.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): InventoryExportFormPayload {
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
  return { products: products.map((item) => ({ ...item, title: item.title || item.id })) };
}

export const inventoryExportSkillDefinition: ToolDefinition = {
  name: "inventoryExport",
  displayName: "导出库存",
  category: "库存与 SKU",
  stage: "execute",
  visibility: "public",
  description: "导出已选商品的 Shopify 官方按地点库存 CSV。只读，不改店铺。",
  systemPromptExtension: [
    `用户要导出库存、盘点表、On hand CSV 时立刻调用 ${OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME}。没选商品也要开卡。`,
    "这不是导出商品。不要打开导出商品卡，也不要承诺改库存。",
  ].join("\n"),
  createTool: () => [inventoryExportFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventoryExportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventoryExportForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const products =
      payload.products.length > 0
        ? payload.products
        : parseWorkspaceProductsFromText(streamContext.lastUserText ?? "");
    enqueue({ type: "task_proposal", payload: buildInventoryExportProposal({ products }) });
  },
};
