import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { CHAT_INPUT_TOKEN_BUDGET } from "../lib/chatContextLimits";
import { estimateMessagesTokens } from "../lib/tokenEstimate";
import { extractMessageText } from "./ai/utils/langchainMessageText";
import { getShopSummaryModel } from "./ai/core/shopChatGraph.server";
import { recordChatTokenUsage } from "./tokenUsage/index.server";

/** 兼容旧调用方：条数不再截断，真正上限是 token 预算。 */
export const MAX_CHAT_HISTORY_MESSAGES = Number.MAX_SAFE_INTEGER;

/** 单条消息最大字符数，防止异常大包。 */
export const MAX_CHAT_MESSAGE_CHARS = 12000;

/** 滑动窗口保留的最近消息条数（仅在开启摘要且超出预算时使用）。 */
const RECENT_WINDOW_SIZE = 10;

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

  const out: BaseMessage[] = [];

  for (const item of raw) {
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
  shop?: string,
): Promise<string | null> {
  try {
    const plainText = messagesToPlainText(olderMessages).slice(
      0,
      SUMMARY_INPUT_MAX_CHARS,
    );
    if (!plainText.trim()) return null;

    const summaryModel = getShopSummaryModel();
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

    if (shop?.trim()) {
      const usageMeta =
        result && typeof result === "object" && "usage_metadata" in result
          ? (result as { usage_metadata?: unknown }).usage_metadata
          : undefined;
      await recordChatTokenUsage({ shop, usage: usageMeta });
    }

    const summary = extractMessageText(result).trim();
    return summary || null;
  } catch (e) {
    console.warn("[ContextWindow] summarize failed, fallback to truncation", e);
    return null;
  }
}

export type ContextWindowOptions = {
  recentCount?: number;
  /** 有 shop 时将摘要 LLM 用量记入账户 */
  shop?: string;
  tokenBudget?: number;
};

/**
 * 按 DeepSeek 1M 上下文做预算裁剪：未超预算则原样送出。
 * 仅当开启摘要且仍超预算时，才压缩最旧的一段。
 */
export function trimMessagesToTokenBudget(
  messages: BaseMessage[],
  tokenBudget = CHAT_INPUT_TOKEN_BUDGET,
): BaseMessage[] {
  if (messages.length <= 1) return messages;
  if (estimateLangChainTokens(messages) <= tokenBudget) return messages;

  const last = messages[messages.length - 1];
  const kept: BaseMessage[] = [last];
  let used = estimateLangChainTokens(kept);

  for (let i = messages.length - 2; i >= 0; i -= 1) {
    const nextUsed = estimateLangChainTokens([messages[i]]) + used;
    if (nextUsed > tokenBudget) break;
    kept.unshift(messages[i]);
    used = nextUsed;
  }

  return kept;
}

function estimateLangChainTokens(messages: BaseMessage[]): number {
  return estimateMessagesTokens(
    messages.map((message) => ({ text: extractMessageText(message) })),
  );
}

/**
 * 对消息序列应用 1M token 预算；默认保留原文。
 * 开启 CHAT_CONTEXT_SUMMARY_ENABLED 且仍超预算时，才对最旧一段做摘要。
 */
export async function buildContextWindow(
  messages: BaseMessage[],
  options?: ContextWindowOptions,
): Promise<BaseMessage[]> {
  const tokenBudget = options?.tokenBudget ?? CHAT_INPUT_TOKEN_BUDGET;
  if (estimateLangChainTokens(messages) <= tokenBudget) {
    return messages;
  }

  const trimmed = trimMessagesToTokenBudget(messages, tokenBudget);
  if (!isContextSummaryEnabled()) {
    return trimmed;
  }

  const recentCount = options?.recentCount ?? RECENT_WINDOW_SIZE;
  const splitAt = Math.max(0, messages.length - recentCount);
  const older = messages.slice(0, splitAt);
  const recent = messages.slice(splitAt);
  const summary = await summarizeOlderMessages(older, options?.shop);
  if (!summary) {
    return trimmed;
  }

  const withSummary = [
    new SystemMessage(`[历史对话摘要]\n${summary}`),
    ...recent,
  ];
  return trimMessagesToTokenBudget(withSummary, tokenBudget);
}
