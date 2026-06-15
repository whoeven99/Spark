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

export function resolveProductImproveCardPayload(messages: unknown[]): unknown | undefined {
  const form = extractProductImproveFormFromMessages(messages);
  if (form) return form;

  const result = extractProductImproveCardPayload(messages);
  if (result) return result;

  if (hasProductImproveFormToolCall(messages)) {
    return defaultProductImproveFormPayload();
  }

  if (hasProductImproveToolCall(messages)) {
    return { _fallback: true };
  }
  return undefined;
}
