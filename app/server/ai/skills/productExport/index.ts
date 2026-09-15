import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildProductExportProposal } from "../../../../lib/productManageTaskProposals";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  OPEN_PRODUCT_EXPORT_FORM_TOOL_NAME,
  productExportFormTool,
  type ProductExportFormPayload,
} from "./productExport.form.tool";

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function coerceFormPayload(raw: unknown): ProductExportFormPayload {
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
    ...(safeString(record.exportFormat) ? { exportFormat: safeString(record.exportFormat) } : {}),
  };
}

export const productExportSkillDefinition: ToolDefinition = {
  name: "productExport",
  displayName: "导出商品",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "导出已选商品为 Shopify CSV、TikTok 广告目录 Feed，或 Amazon / Temu / TikTok Shop 核心字段起步表。只读，不改店铺。",
  systemPromptExtension: [
    `用户要导出商品时立刻调用 ${OPEN_PRODUCT_EXPORT_FORM_TOOL_NAME} 打开确认卡，即使还没选商品、或说「导出全部」也要开卡。`,
    "一期只导出已选商品，最多 200 个；没选时让用户在卡片里选商品，不要只在对话里让对方去工作台选完再来。",
    "TikTok 广告目录 Feed 缺图/价/品牌的行会进跳过报告。Amazon / Temu / TikTok Shop 是起步表不是官方类目模板；无标题/价格/SKU 硬跳过，缺 GTIN/重量等仍导出并进警告报告。",
    "用户说 TikTok 时：卖家上架用 tiktok_shop_csv，广告目录用 tiktok_csv。不要两者混用。",
  ].join("\n"),
  createTool: () => [productExportFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_PRODUCT_EXPORT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("productExportForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("productExportForm");
    const raw: unknown =
      typeof ev.output === "object" && ev.output !== null ? ev.output : String(ev.output ?? "");
    const payload = coerceFormPayload(raw);
    const products =
      payload.products.length > 0
        ? payload.products
        : parseWorkspaceProductsFromText(streamContext.lastUserText ?? "");
    enqueue({
      type: "task_proposal",
      payload: buildProductExportProposal({ ...payload, products }),
    });
  },
};
