import type { ToolDefinition } from "../../core/toolRegistry.server";
import {
  buildInventoryAdjustProposal,
  buildInventorySetProposal,
  buildInventoryZeroProposal,
  type InventoryLocationOption,
} from "../../../../lib/inventoryTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  OPEN_INVENTORY_ADJUST_FORM_TOOL_NAME,
  OPEN_INVENTORY_SET_FORM_TOOL_NAME,
  OPEN_INVENTORY_ZERO_FORM_TOOL_NAME,
  createInventoryAdjustFormTool,
  createInventorySetFormTool,
  createInventoryZeroFormTool,
  type InventoryQtyFormPayload,
} from "./inventoryQty.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): InventoryQtyFormPayload {
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
  const locations: InventoryLocationOption[] = Array.isArray(record.locations)
    ? record.locations
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
        .map((item) => ({
          value: safeString(item.value) ?? "",
          label: safeString(item.label) ?? "",
        }))
        .filter((item) => item.value && item.label)
    : [];
  return {
    products: products.map((item) => ({ ...item, title: item.title || item.id })),
    locations,
    ...(safeString(record.locationId) ? { locationId: safeString(record.locationId) } : {}),
    ...(safeString(record.quantity) ? { quantity: safeString(record.quantity) } : {}),
    ...(safeString(record.direction) ? { direction: safeString(record.direction) } : {}),
    ...(safeString(record.amount) ? { amount: safeString(record.amount) } : {}),
  };
}

function withWorkspaceProducts(payload: InventoryQtyFormPayload, lastUserText: string | undefined) {
  const products =
    payload.products.length > 0 ? payload.products : parseWorkspaceProductsFromText(lastUserText ?? "");
  return { ...payload, products };
}

export const inventorySetSkillDefinition: ToolDefinition = {
  name: "inventorySet",
  displayName: "设置库存",
  category: "库存与 SKU",
  stage: "execute",
  visibility: "public",
  description: "按地点把可售库存设为指定整数。先试算再审核写回。",
  systemPromptExtension: [
    `用户要把库存设为某个数时调用 ${OPEN_INVENTORY_SET_FORM_TOOL_NAME}。必须选地点。`,
    "写的是 available（可售），不是 on_hand。你不能直接改店铺。",
  ].join("\n"),
  createTool: (context) => [createInventorySetFormTool(context.admin)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_SET_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventorySetForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventorySetForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildInventorySetProposal(withWorkspaceProducts(coerceFormPayload(raw), streamContext.lastUserText)),
    });
  },
};

export const inventoryAdjustSkillDefinition: ToolDefinition = {
  name: "inventoryAdjust",
  displayName: "增加 / 减少库存",
  category: "库存与 SKU",
  stage: "execute",
  visibility: "public",
  description: "按地点给可售库存加或减正整数。先试算再审核写回。",
  systemPromptExtension: [
    `用户要增加或减少库存时调用 ${OPEN_INVENTORY_ADJUST_FORM_TOOL_NAME}。必须选地点和正整数。`,
    "「各加 10」→ direction=up amount=10；「减 5」→ direction=down amount=5。",
  ].join("\n"),
  createTool: (context) => [createInventoryAdjustFormTool(context.admin)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_ADJUST_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventoryAdjustForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventoryAdjustForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildInventoryAdjustProposal(
        withWorkspaceProducts(coerceFormPayload(raw), streamContext.lastUserText),
      ),
    });
  },
};

export const inventoryZeroSkillDefinition: ToolDefinition = {
  name: "inventoryZero",
  displayName: "清零库存",
  category: "库存与 SKU",
  stage: "execute",
  visibility: "public",
  description: "按地点把可售库存清零。已占用数量不会被抹掉。",
  systemPromptExtension: [
    `用户要清零库存、把可售库存设为 0 时调用 ${OPEN_INVENTORY_ZERO_FORM_TOOL_NAME}。必须选地点。`,
    "清零的是 available。有未发货占用时 on_hand 不会变成 0。",
  ].join("\n"),
  createTool: (context) => [createInventoryZeroFormTool(context.admin)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_ZERO_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventoryZeroForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventoryZeroForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildInventoryZeroProposal(withWorkspaceProducts(coerceFormPayload(raw), streamContext.lastUserText)),
    });
  },
};
