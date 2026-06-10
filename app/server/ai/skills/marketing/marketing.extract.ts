import { ToolMessage } from "@langchain/core/messages";
import {
  coerceProductImproveFormPayload,
  isProductImproveFormToolPayload,
  defaultProductImproveFormPayload,
} from "../../../../lib/productImproveFormPayload";
import { extractMessageText } from "../../utils/langchainMessageText";
import { OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME } from "./marketing.form.tool";
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

function toolMessageJsonPayloadString(m: ToolMessage): string | null {
  const fromText = extractMessageText(m).trim();
  if (fromText.startsWith("{")) return fromText;
  const c = m.content as unknown;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const s = JSON.stringify(c);
    return s.startsWith("{") ? s : null;
  }
  return null;
}

/** 从 Agent 消息序列中取出最近一次「商品描述表单」工具输出。 */
export function extractProductImproveFormFromMessages(
  messages: unknown[],
): ReturnType<typeof coerceProductImproveFormPayload> | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME) continue;

    const raw = toolMessageJsonPayloadString(msg);
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isProductImproveFormToolPayload(parsed)) continue;

    return coerceProductImproveFormPayload(parsed);
  }
  return undefined;
}

export function hasProductImproveFormToolCall(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (
      ToolMessage.isInstance(msg) &&
      msg.name === OPEN_PRODUCT_IMPROVE_FORM_TOOL_NAME
    ) {
      return true;
    }
  }
  return false;
}

export function shouldInjectProductImproveFormFallback(
  lastUserText: string,
  assistantReplyText: string,
): boolean {
  const u = lastUserText.trim();
  const a = assistantReplyText.trim();
  if (!u) return false;

  const userWantsCard =
    /商品描述|营销描述|写描述|优化描述|生成描述|商品文案|product description|描述卡片|文案卡片/i.test(
      u,
    );

  if (!userWantsCard) return false;
  if (/描述卡片|文案卡片|打开卡片/i.test(u)) return true;
  if (!a) return false;

  const assistantSignals =
    /卡片|表单|已为你打开|已经为你打开|请确认|请选择商品|在卡片/i.test(a);
  return assistantSignals;
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

export function resolveProductImproveCardPayload(
  messages: unknown[],
  lastUserText: string,
  assistantReplyRaw: string,
): unknown | undefined {
  const form = extractProductImproveFormFromMessages(messages);
  if (form) return form;

  const result = extractProductImproveCardPayload(messages);
  if (result) return result;

  if (
    hasProductImproveFormToolCall(messages) ||
    shouldInjectProductImproveFormFallback(lastUserText, assistantReplyRaw)
  ) {
    return defaultProductImproveFormPayload();
  }

  const isGenerateFallback =
    hasProductImproveToolCall(messages) ||
    shouldInjectProductImproveFallback(lastUserText, assistantReplyRaw);

  if (isGenerateFallback) return { _fallback: true };
  return undefined;
}
