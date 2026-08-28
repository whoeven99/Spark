import { ToolMessage } from "@langchain/core/messages";
import {
  coerceProductQualityFormPayload,
  defaultProductQualityFormPayload,
  isProductQualityFormToolPayload,
  productQualityFormHasScore,
  type ProductQualityFormPayload,
} from "../../../../lib/productQualityFormPayload";
import { extractMessageText } from "../../utils/langchainMessageText";
import { OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME } from "./productQuality.form.tool";
import { SCORE_PRODUCT_QUALITY_TOOL_NAME } from "./scoreProduct";

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

/** 从最近一次 score_product_quality 成功结果提取带分数的卡片载荷。 */
export function extractProductQualityScoreFromMessages(
  messages: unknown[],
): ProductQualityFormPayload | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== SCORE_PRODUCT_QUALITY_TOOL_NAME) continue;

    const raw = toolMessageJsonPayloadString(msg);
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const rec = parsed as Record<string, unknown>;
    if (rec.ok !== true) continue;

    const payload = coerceProductQualityFormPayload(parsed);
    if (productQualityFormHasScore(payload)) return payload;
  }
  return undefined;
}

export function extractProductQualityFormFromMessages(
  messages: unknown[],
): ProductQualityFormPayload | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME) continue;

    const raw = toolMessageJsonPayloadString(msg);
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isProductQualityFormToolPayload(parsed)) continue;
    return coerceProductQualityFormPayload(parsed);
  }
  return undefined;
}

export function hasProductQualityFormToolCall(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg) && msg.name === OPEN_PRODUCT_QUALITY_FORM_TOOL_NAME) {
      return true;
    }
  }
  return false;
}

export function hasProductQualityScoreToolCall(messages: unknown[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (ToolMessage.isInstance(msg) && msg.name === SCORE_PRODUCT_QUALITY_TOOL_NAME) {
      return true;
    }
  }
  return false;
}

export function resolveProductQualityCardPayload(messages: unknown[]): unknown | undefined {
  const scored = extractProductQualityScoreFromMessages(messages);
  if (scored) return scored;

  const form = extractProductQualityFormFromMessages(messages);
  if (form) return form;

  if (hasProductQualityFormToolCall(messages) || hasProductQualityScoreToolCall(messages)) {
    return defaultProductQualityFormPayload();
  }
  return undefined;
}
