import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

/** 单次请求最多带入的上屏消息条数（含欢迎语与当前输入）。 */
export const MAX_CHAT_HISTORY_MESSAGES = 36;

/** 单条消息最大字符数，防止异常大包。 */
export const MAX_CHAT_MESSAGE_CHARS = 12000;

type RawItem = { role?: unknown; content?: unknown };

/**
 * 将前端传来的 { role, content }[] 转为 LangChain 消息序列。
 * 必须至少一条，且最后一条须为非空的 user 消息。
 */
export function parseClientChatMessages(raw: unknown): BaseMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const capped = raw.slice(-MAX_CHAT_HISTORY_MESSAGES);
  const out: BaseMessage[] = [];

  for (const item of capped) {
    if (!item || typeof item !== "object") continue;
    const { role, content } = item as RawItem;
    const text = String(content ?? "").slice(0, MAX_CHAT_MESSAGE_CHARS).trim();
    if (!text) continue;

    if (role === "user") {
      out.push(new HumanMessage(text));
    } else if (role === "assistant") {
      out.push(new AIMessage(text));
    }
  }

  if (out.length === 0) {
    return null;
  }

  const last = out[out.length - 1];
  if (!HumanMessage.isInstance(last)) {
    return null;
  }

  return out;
}
