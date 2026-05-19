import type { BaseMessage } from "@langchain/core/messages";
import {
  parseUsageMetadata,
  sumParsedTokenUsage,
  type ParsedTokenUsage,
} from "./parseUsageMetadata.server";

/**
 * 从 LangChain 消息序列中汇总 `usage_metadata`（Agent 多轮对话）。
 */
export function extractTokenUsageFromMessages(
  messages: BaseMessage[],
): ParsedTokenUsage {
  const parts: ParsedTokenUsage[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const usage =
      "usage_metadata" in msg
        ? (msg as { usage_metadata?: unknown }).usage_metadata
        : undefined;
    if (usage !== undefined) {
      parts.push(parseUsageMetadata(usage));
    }
  }
  return sumParsedTokenUsage(parts);
}
