import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildSkuExportProposal } from "../../../../lib/inventoryTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import { OPEN_SKU_EXPORT_FORM_TOOL_NAME, skuExportFormTool } from "./skuExport.form.tool";

function coerceProducts(raw: unknown): Array<{ id: string; title: string; imageUrl?: string | null }> {
  let parsed: unknown = raw;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const record = (parsed ?? {}) as Record<string, unknown>;
  if (!Array.isArray(record.products)) return [];
  return record.products
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      id: normalizeShopifyProductId(typeof item.id === "string" ? item.id : ""),
      title: typeof item.title === "string" ? item.title : "",
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
    }))
    .filter((item) => item.id !== "")
    .map((item) => ({ ...item, title: item.title || item.id }));
}

export const skuExportSkillDefinition: ToolDefinition = {
  name: "skuExport",
  displayName: "导出 SKU",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description: "导出变体 SKU / 条码 / 重量对照表。只读。",
  systemPromptExtension: [
    `用户要导出 SKU、条码或变体身份表时立刻调用 ${OPEN_SKU_EXPORT_FORM_TOOL_NAME}。`,
    "一期只导出已选商品，最多 200 个。不要和库存数量导出混用。",
  ].join("\n"),
  createTool: () => [skuExportFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_SKU_EXPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("skuExportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("skuExportForm");
    const products = coerceProducts(ev.output);
    enqueue({
      type: "task_proposal",
      payload: buildSkuExportProposal({
        products: products.length > 0 ? products : parseWorkspaceProductsFromText(streamContext.lastUserText ?? ""),
      }),
    });
  },
};
