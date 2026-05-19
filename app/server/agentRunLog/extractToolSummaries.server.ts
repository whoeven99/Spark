import {
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { AgentRunToolSummary } from "./types.server";

const MAX_TOOLS = 50;

/**
 * 从 Agent 消息序列提取工具调用摘要（名称 + 是否像失败结果）。
 */
export function extractToolSummariesFromMessages(
  messages: BaseMessage[],
): AgentRunToolSummary[] {
  const byName = new Map<string, AgentRunToolSummary>();

  for (const msg of messages) {
    if (AIMessage.isInstance(msg) && msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const name = call.name?.trim() || "unknown";
        if (!byName.has(name)) {
          byName.set(name, { name, ok: true });
        }
      }
    }

    if (ToolMessage.isInstance(msg)) {
      const name = msg.name?.trim() || "unknown";
      const raw =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content ?? "");
      const lower = raw.toLowerCase();
      const ok =
        !lower.includes('"error"') &&
        !lower.startsWith("error") &&
        !lower.includes("失败");
      byName.set(name, { name, ok });
    }
  }

  return [...byName.values()].slice(0, MAX_TOOLS);
}
