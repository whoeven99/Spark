import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildInventoryExportProposal } from "../../../../lib/inventoryTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME,
  createInventoryExportFormTool,
} from "./inventoryExport.form.tool";

function coercePayload(raw: unknown): {
  products: Array<{ id: string; title: string; imageUrl?: string | null }>;
  locationId?: string;
  locations: Array<{ value: string; label: string }>;
} {
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
          id: normalizeShopifyProductId(typeof item.id === "string" ? item.id : ""),
          title: typeof item.title === "string" ? item.title : "",
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
        }))
        .filter((item) => item.id)
        .map((item) => ({ ...item, title: item.title || item.id }))
    : [];
  const locations = Array.isArray(record.locations)
    ? record.locations
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => ({
          value: String(item.value ?? ""),
          label: String(item.label ?? item.value ?? ""),
        }))
        .filter((item) => item.value)
    : [];
  return {
    products,
    locationId: typeof record.locationId === "string" ? record.locationId : undefined,
    locations,
  };
}

export const inventoryExportSkillDefinition: ToolDefinition = {
  name: "inventoryExport",
  displayName: "导出库存",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description: "按仓库导出 Shopify 官方库存 CSV。只读。",
  systemPromptExtension: [
    `用户要导出库存数量、按仓库存表时立刻调用 ${OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME}。`,
    "不要用导出商品来代替。SKU 身份表走导出 SKU。",
  ].join("\n"),
  createTool: (context) => [createInventoryExportFormTool(context.admin)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_EXPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventoryExportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventoryExportForm");
    const payload = coercePayload(ev.output);
    enqueue({
      type: "task_proposal",
      payload: buildInventoryExportProposal({
        ...payload,
        products:
          payload.products.length > 0
            ? payload.products
            : parseWorkspaceProductsFromText(streamContext.lastUserText ?? ""),
      }),
    });
  },
};
