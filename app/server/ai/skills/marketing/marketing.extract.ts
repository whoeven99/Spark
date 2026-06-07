import { ToolMessage } from "@langchain/core/messages";
import { extractMessageText } from "../../utils/langchainMessageText";
import { GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "./marketing.tool";

export function extractProductImproveCardPayload(messages: unknown[]): unknown {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME) continue;

    const raw = extractMessageText(msg).trim();
    if (!raw.startsWith("{")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const p = parsed as Record<string, unknown>;
    if (p.ok !== true) continue;

    const title = typeof p.title === "string" ? p.title.trim() : "";
    const description = typeof p.description === "string" ? p.description : "";
    if (!title || !description) continue;

    const productId = typeof p.productId === "string" ? p.productId.trim() : "";
    const targetLanguage =
      typeof p.targetLanguage === "string" ? p.targetLanguage.trim() : undefined;

    return {
      productId,
      title,
      description,
      ...(targetLanguage ? { targetLanguage } : {}),
    };
  }
  return undefined;
}

export function hasProductImproveToolCall(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (
      ToolMessage.isInstance(msg) &&
      msg.name === GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME
    ) {
      return true;
    }
  }
  return false;
}

export function shouldInjectProductImproveFallback(
  lastUserText: string,
  assistantReplyText: string,
): boolean {
  const u = lastUserText.trim();
  const a = assistantReplyText.trim();
  if (!u || !a) return false;
  const userSignals =
    /(商品描述|营销描述|文案|写描述|优化描述|product description)/i.test(u) &&
    /(gid:\/\/shopify\/Product\/\d+|\b\d{6,}\b)/i.test(u);
  const assistantSignals =
    /(已生成|生成结果|核心要点|一句话概括|如需调整|商品描述)/i.test(a);
  return userSignals && assistantSignals;
}
