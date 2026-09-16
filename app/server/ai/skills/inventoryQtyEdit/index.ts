import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildInventoryQtyEditProposal } from "../../../../lib/inventoryTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  OPEN_INVENTORY_QTY_EDIT_FORM_TOOL_NAME,
  createInventoryQtyEditFormTool,
} from "./inventoryQtyEdit.form.tool";

function coercePayload(raw: unknown) {
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
          writable: item.writable !== false,
        }))
        .filter((item) => item.value)
    : [];
  return {
    products,
    mode: typeof record.mode === "string" ? record.mode : undefined,
    qtyValue: typeof record.qtyValue === "string" ? record.qtyValue : undefined,
    locationId: typeof record.locationId === "string" ? record.locationId : undefined,
    locations,
  };
}

export const inventoryQtyEditSkillDefinition: ToolDefinition = {
  name: "inventoryQtyEdit",
  displayName: "设置库存",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description: "按仓库设置、增减或清零可售库存。确认卡试算后才写回。",
  systemPromptExtension: [
    `用户要设置库存、加减库存、清零库存时立刻调用 ${OPEN_INVENTORY_QTY_EDIT_FORM_TOOL_NAME}。`,
    "mode：改成某个数字 → set；增加/减少 → adjust；清零 → clear。",
    "这是可售 Available，不是 CSV 的 On hand。按表格改库存走导入库存。",
    "禁止声称已经改了库存。",
  ].join("\n"),
  createTool: (context) => [createInventoryQtyEditFormTool(context.admin)],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_INVENTORY_QTY_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("inventoryQtyEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("inventoryQtyEditForm");
    const payload = coercePayload(ev.output);
    enqueue({
      type: "task_proposal",
      payload: buildInventoryQtyEditProposal({
        ...payload,
        products:
          payload.products.length > 0
            ? payload.products
            : parseWorkspaceProductsFromText(streamContext.lastUserText ?? ""),
      }),
    });
  },
};
