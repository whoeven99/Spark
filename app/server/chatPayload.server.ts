import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { extractMessageText } from "./ai/utils/langchainMessageText";
import { getShopChatModel } from "./ai/core/shopChatGraph.server";

/** 单次请求最多带入的上屏消息条数（含欢迎语与当前输入）。 */
export const MAX_CHAT_HISTORY_MESSAGES = 36;

/** 单条消息最大字符数，防止异常大包。 */
export const MAX_CHAT_MESSAGE_CHARS = 12000;

/** 滑动窗口保留的最近消息条数（原文保留，不压缩）。 */
const RECENT_WINDOW_SIZE = 10;

/** 触发摘要压缩的最小消息总数。低于此值直接返回，不做摘要。 */
const SUMMARY_THRESHOLD = RECENT_WINDOW_SIZE + 4;

/** 摘要 prompt 的最大输入字符数（防止 older 部分过大）。 */
const SUMMARY_INPUT_MAX_CHARS = 6000;

function isContextSummaryEnabled(): boolean {
  return process.env.CHAT_CONTEXT_SUMMARY_ENABLED === "true";
}

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

function messagesToPlainText(messages: BaseMessage[]): string {
  return messages
    .map((m) => {
      const role = HumanMessage.isInstance(m) ? "用户" : "助手";
      return `${role}: ${extractMessageText(m)}`;
    })
    .join("\n");
}

/**
 * 调用 LLM 为旧消息生成摘要（带超时保护，失败时静默回退）。
 * 返回 null 时调用方应 fallback 到硬截断。
 */
async function summarizeOlderMessages(
  olderMessages: BaseMessage[],
): Promise<string | null> {
  try {
    const plainText = messagesToPlainText(olderMessages).slice(
      0,
      SUMMARY_INPUT_MAX_CHARS,
    );
    if (!plainText.trim()) return null;

    const model = getShopChatModel();
    // 使用较小的 maxTokens 来加速摘要生成
    const summaryModel = model.bind({ maxTokens: 512 });
    const result = await Promise.race([
      summaryModel.invoke([
        new SystemMessage(
          "你是一个对话摘要助手。请将以下历史对话压缩为一段简洁的中文摘要（不超过 300 字），保留关键事实、用户意图和已完成的操作。不要添加任何分析或建议。",
        ),
        new HumanMessage(plainText),
      ]),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 8000),
      ),
    ]);
    if (!result) return null;
    const summary = extractMessageText(result).trim();
    return summary || null;
  } catch (e) {
    console.warn("[ContextWindow] summarize failed, fallback to truncation", e);
    return null;
  }
}

export type ContextWindowOptions = {
  recentCount?: number;
};

/**
 * 对消息序列应用滑动窗口 + 摘要压缩策略。
 *
 * - 消息总数 <= SUMMARY_THRESHOLD 时直接返回原序列
 * - 否则保留最近 recentCount 条原文，对之前的消息生成 LLM 摘要
 * - 摘要失败时 fallback 到硬截断（仅保留最近 recentCount 条）
 */
export async function buildContextWindow(
  messages: BaseMessage[],
  options?: ContextWindowOptions,
): Promise<BaseMessage[]> {
  const recentCount = options?.recentCount ?? RECENT_WINDOW_SIZE;

  if (messages.length <= SUMMARY_THRESHOLD) {
    return messages;
  }

  const splitAt = messages.length - recentCount;
  const older = messages.slice(0, splitAt);
  const recent = messages.slice(splitAt);

  if (!isContextSummaryEnabled()) {
    return recent;
  }

  const summary = await summarizeOlderMessages(older);

  if (summary) {
    return [
      new SystemMessage(`[历史对话摘要]\n${summary}`),
      ...recent,
    ];
  }

  return recent;
}
