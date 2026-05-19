import type { RunnableConfig } from "@langchain/core/runnables";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  extractMessageText,
  extractMessagesContext,
} from "../utils/langchainMessageText";
import { buildShopChatGraph, getShopChatModel } from "./shopChatGraph.server";
import { polishFinalReply } from "../utils/polishFinalReply";
import { getAppEntry } from "../../../config/appEntry.server";
import {
  extractTokenUsageFromMessages,
  recordTokenUsage,
} from "../../tokenUsage/index.server";
import { globalToolRegistry, type AgentContext } from "./toolRegistry.server";
import "../skills/index";

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      metadata: {
        totalTokens: number;
        model: string;
        finalReply?: string;
        uiPayloads?: {
          translationTaskForm?: unknown;
          generateDescriptionCardPayload?: unknown;
          attachments?: unknown;
        };
      };
    };

type ToolLifecycleEvent =
  | {
      event: "on_tool_start";
      toolCallId?: string;
      name: string;
      input: unknown;
    }
  | {
      event: "on_tool_end";
      toolCallId?: string;
      name: string;
      output: unknown;
    }
  | {
      event: "on_tool_error";
      toolCallId?: string;
      name: string;
      error: unknown;
    }
  | { event: string; name?: string; toolCallId?: string };

function isToolLifecycleEvent(x: unknown): x is ToolLifecycleEvent {
  return typeof x === "object" && x !== null && "event" in x;
}

function lastHumanUtterance(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (HumanMessage.isInstance(msg)) {
      return extractMessageText(msg).trim();
    }
  }
  return "";
}

async function generateFallbackReplyStream(
  input: string,
  contextText: string,
): Promise<ReadableStream<StreamChunk>> {
  const model = getShopChatModel();

  const stream = await model.stream([
    new SystemMessage(
      "你是一个店铺 AI 助手。请基于用户问题和已知上下文直接给出有帮助的回答。若信息不足，请明确不确定点并给出下一步可执行建议。必须使用简体中文，不要输出 Markdown 表格。",
    ),
    new HumanMessage(
      `用户问题：${input}\n\n已知上下文（可能包含工具执行结果）：\n${contextText || "（无）"}`,
    ),
  ]);

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const content = extractMessageText(chunk);
        if (content) {
          controller.enqueue({ type: "text", content });
        }
      }
      controller.enqueue({
        type: "done",
        metadata: {
          totalTokens: 0,
          model: String(model.model ?? "unknown"),
        },
      });
      controller.close();
    },
  });
}

export type InvokeChatAgentStreamParams = {
  messages: BaseMessage[];
  context: AgentContext;
  config?: RunnableConfig;
};

/**
 * 使用 LangGraph `CompiledStateGraph.stream`，组合 streamMode：
 * - `messages`：模型 token / 消息块增量
 * - `tools`：工具生命周期事件（映射为 SSE tool_call / tool_result）
 * - `values`：每步完整状态，用于结束时抽取 messages 做表单解析与润色
 */
export async function invokeChatAgentStream(
  params: InvokeChatAgentStreamParams,
): Promise<ReadableStream<StreamChunk>> {
  const { messages: agentInputMessages, context, config } = params;
  
  const activeDefs = await globalToolRegistry.getActiveToolDefinitions(context);
  const extraTools = await globalToolRegistry.getToolsForContext(context);
  const graph = await buildShopChatGraph(context, extraTools, activeDefs);

  return new ReadableStream<StreamChunk>({
    async start(controller) {
      const modelName = String(getShopChatModel().model ?? "unknown");

      try {
        const lgStream = await graph.stream(
          { messages: agentInputMessages },
          {
            ...config,
            streamMode: ["messages", "tools", "values"],
          },
        );

        let lastMessages: BaseMessage[] | undefined;
        const streamContext = { emittedFlags: new Set<string>() };

        for await (const item of lgStream) {
          if (!Array.isArray(item) || item.length < 2) continue;

          const mode = item[0] as string;
          const payload = item[1];

          if (mode === "messages") {
            const tuple = payload as [BaseMessage, Record<string, unknown>];
            const [message] = tuple;
            if (AIMessageChunk.isInstance(message)) {
              const delta = extractMessageText(message);
              if (delta) {
                controller.enqueue({ type: "text", content: delta });
              }
            }
          } else if (mode === "tools") {
            if (!isToolLifecycleEvent(payload)) continue;
            const ev = payload;
            
            // 委托给注册好的 tool def 处理流式事件
            for (const def of activeDefs) {
              if (def.onStreamEvent) {
                def.onStreamEvent(ev, (chunk) => controller.enqueue(chunk), streamContext);
              }
            }
          } else if (mode === "values") {
            const state = payload as { messages?: BaseMessage[] };
            if (state.messages?.length) {
              lastMessages = state.messages;
            }
          }
        }

        const resultMessages = lastMessages ?? [];
        const lastUserText =
          lastHumanUtterance(agentInputMessages) ||
          lastHumanUtterance(resultMessages) ||
          "";

        let finalReply = "";
        for (let i = resultMessages.length - 1; i >= 0; i -= 1) {
          const msg = resultMessages[i];
          if (AIMessage.isInstance(msg)) {
            const text = extractMessageText(msg).trim();
            if (text) {
              finalReply = polishFinalReply(text);
              break;
            }
          }
        }

        if (!finalReply.trim()) {
          const fb = await generateFallbackReplyStream(
            lastUserText,
            extractMessagesContext(resultMessages),
          );
          const reader = fb.getReader();
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
          return;
        }

        // 调用 Tool Definition 提取兜底的卡片数据并通过 controller enqueue
        // 旧逻辑中会主动将遗漏的卡片通过特定的 tool_call/tool_result 发出去，
        // 既然我们重构了，就让它们作为 uiPayloads 放在 final metadata 中。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uiPayloads: Record<string, any> = {};
        for (const def of activeDefs) {
          if (def.extractUIPayload && def.uiPayloadKey) {
            const payload = def.extractUIPayload(resultMessages, lastUserText, finalReply);
            if (payload !== undefined) {
              uiPayloads[def.uiPayloadKey] = payload;
              
              // 兼容性保留旧的 SSE 事件
              if (def.name === "translationTaskForm" && !streamContext.emittedFlags.has("translationTaskForm")) {
                controller.enqueue({
                  type: "tool_call",
                  name: "open_translation_task_form",
                  args: payload,
                });
              }
              if (def.name === "generateProductDescription" && !streamContext.emittedFlags.has("generateProductDescription")) {
                 controller.enqueue({
                  type: "tool_result",
                  name: "generate_product_description",
                  result: typeof payload === 'object' ? JSON.stringify(payload) : String(payload),
                });
              }
            }
          }
        }

        const agentUsage = extractTokenUsageFromMessages(resultMessages);
        const shop = context.shop?.trim();
        if (shop && agentUsage.totalTokens > 0) {
          await recordTokenUsage({
            shop,
            appName: context.appName ?? getAppEntry(),
            usage: agentUsage,
          });
        }

        controller.enqueue({
          type: "done",
          metadata: {
            totalTokens: agentUsage.totalTokens,
            model: modelName,
            finalReply,
            uiPayloads,
          },
        });
        controller.close();
      } catch (error) {
        console.error("invokeChatAgentStream:", error);
        const hint =
          error instanceof Error && error.message.includes("DEEPSEEK_API_KEY")
            ? "未配置 DEEPSEEK_API_KEY，请在环境变量中设置后再试。"
            : error instanceof Error
              ? error.message
              : "AI 服务暂时不可用，请稍后重试。";
        controller.enqueue({ type: "error", message: hint });
        controller.enqueue({
          type: "done",
          metadata: { totalTokens: 0, model: modelName },
        });
        controller.close();
      }
    },
  });
}
