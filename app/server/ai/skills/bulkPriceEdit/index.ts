import type { ToolDefinition } from "../../core/toolRegistry.server";
import { buildBulkPriceEditProposal } from "../../../../lib/taskProposalPayload";
import {
  normalizeShopifyProductId,
  parseWorkspaceProductsFromText,
} from "../../../../lib/workspaceContextProducts";
import {
  createListVariantPricesTool,
  LIST_VARIANT_PRICES_TOOL_NAME,
} from "./listVariantPrices.tool";
import {
  bulkPriceEditFormTool,
  OPEN_BULK_PRICE_EDIT_FORM_TOOL_NAME,
  type BulkPriceEditFormPayload,
} from "./bulkPriceEdit.form.tool";

function safeString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function coerceFormPayload(raw: unknown): BulkPriceEditFormPayload {
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
    ...(safeString(r.priceMode) ? { priceMode: safeString(r.priceMode) } : {}),
    ...(r.priceValue != null ? { priceValue: String(r.priceValue) } : {}),
    ...(safeString(r.rounding) ? { rounding: safeString(r.rounding) } : {}),
    ...(safeString(r.compareAtMode) ? { compareAtMode: safeString(r.compareAtMode) } : {}),
    ...(r.minPrice != null ? { minPrice: String(r.minPrice) } : {}),
  };
}

export const bulkPriceEditSkillDefinition: ToolDefinition = {
  name: "bulkPriceEdit",
  displayName: "批量调价",
  category: "商品目录",
  stage: "execute",
  visibility: "public",
  description:
    "按规则批量调整变体价格与划线价：先只读试算并生成可导出的变更清单，用户验收后才写回店铺",
  systemPromptExtension: [
    "商品价格相关需求按下面的分工处理，不要跳步：",
    `1) 用户只想知道现在的价格、或想先看看「改完是多少」→ 调用 ${LIST_VARIANT_PRICES_TOOL_NAME}（只读，可带 priceMode/priceValue 做试算）。`,
    `2) 用户明确要改价（如「这批商品降价 10%」「统一涨 5 元」「把原价写成划线价做折扣」）→ 调用 ${OPEN_BULK_PRICE_EDIT_FORM_TOOL_NAME} 打开确认卡；从[工作台上下文]的「已选商品」逐行提取 ID / 标题 / 图片填入 products。`,
    "3) 从用户话里推断 priceMode 与 priceValue：「降价/打折 X%」→ percent_down + X；「涨价 X%」→ percent_up + X；「降 X 元」→ amount_down + X；「统一卖 X」→ set_fixed + X；只改划线价 → unchanged。「取整到 .99」→ rounding=end99。",
    "4) 你没有修改商品价格的能力。禁止声称已改价或已写回；必须说明「已生成变更预览，请在卡片中确认，确认后还会有一次写回确认」。",
    "5) 用户问「会不会直接改到店里」→ 明确回答：确认卡只生成变更清单（可下载 CSV），写回店铺需要在任务审核里再点一次确认。",
  ].join("\n"),
  createTool: (context) => [createListVariantPricesTool(context), bulkPriceEditFormTool],
  onStreamEvent: (ev, enqueue, streamContext) => {
    if (
      ev.event !== "on_tool_end" ||
      ev.name !== OPEN_BULK_PRICE_EDIT_FORM_TOOL_NAME ||
      streamContext.emittedFlags.has("bulkPriceEditForm")
    ) {
      return;
    }
    streamContext.emittedFlags.add("bulkPriceEditForm");
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
      payload: buildBulkPriceEditProposal({ ...payload, products }),
    });
  },
};
