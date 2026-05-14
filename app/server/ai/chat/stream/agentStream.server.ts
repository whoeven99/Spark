import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  extractMessageText,
  extractMessagesContext,
} from "../../postprocess/langchainMessageText";
import { buildShopChatGraph, getShopChatModel } from "../../graph/shopChatGraph.server";
import type { GenerateDescriptionCardPayload } from "../../../../lib/chatMessage";
import { polishFinalReply } from "../../postprocess/polishFinalReply";
import {
  defaultTranslationTaskFormPayload,
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "../../postprocess/translationTaskFormExtract";
import { GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "../../tools/implementations/generateDescriptionTool";

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
        /** 润色后的完整助手正文，供前端写入最终气泡（可与流式增量略有差异） */
        finalReply?: string;
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

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
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

function extractGenerateDescriptionCardPayload(
  messages: BaseMessage[],
): GenerateDescriptionCardPayload | undefined {
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

    const rec = parsed as Record<string, unknown>;
    if (rec.ok !== true) continue;

    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const description =
      typeof rec.description === "string" ? rec.description : "";
    if (!title || !description) continue;

    const productId =
      typeof rec.productId === "string" ? rec.productId.trim() : "";
    const targetLanguage =
      typeof rec.targetLanguage === "string"
        ? rec.targetLanguage.trim()
        : undefined;

    return {
      productId,
      title,
      description,
      ...(targetLanguage ? { targetLanguage } : {}),
    };
  }
  return undefined;
}

export type InvokeChatAgentStreamParams = {
  messages: BaseMessage[];
  extraTools?: DynamicStructuredTool[];
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
  const { messages: agentInputMessages, extraTools, config } = params;
  const graph = buildShopChatGraph(extraTools ?? []);

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
        let emittedTranslationTool = false;
        let emittedGenerateToolResult = false;

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
            if (ev.event === "on_tool_start" && ev.name === "open_translation_task_form") {
              emittedTranslationTool = true;
              controller.enqueue({
                type: "tool_call",
                name: ev.name,
                args: ev.input,
              });
            } else if (
              ev.event === "on_tool_end" &&
              ev.name === GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME
            ) {
              emittedGenerateToolResult = true;
              controller.enqueue({
                type: "tool_result",
                name: ev.name,
                result: stringifyToolOutput(
                  "output" in ev ? ev.output : undefined,
                ),
              });
            }
          } else if (mode === "values") {
            const state = payload as { messages?: BaseMessage[] };
            if (state.messages?.length) {
              lastMessages = state.messages;
            }
          }
        }

        const resultMessages = lastMessages ?? [];
        const extractedForm =
          extractTranslationTaskFormFromMessages(resultMessages);
        const extractedGeneratePayload =
          extractGenerateDescriptionCardPayload(resultMessages);
        const lastUserText =
          lastHumanUtterance(agentInputMessages) ||
          lastHumanUtterance(resultMessages) ||
          "";
        const resolveTranslationTaskForm = (assistantReplyRaw: string) => {
          if (extractedForm) return extractedForm;
          if (
            shouldInjectTranslationTaskFormFallback(lastUserText, assistantReplyRaw)
          ) {
            return defaultTranslationTaskFormPayload();
          }
          return undefined;
        };

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
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
          return;
        }

        const translationTaskForm = resolveTranslationTaskForm(finalReply);
        if (translationTaskForm && !emittedTranslationTool) {
          controller.enqueue({
            type: "tool_call",
            name: "open_translation_task_form",
            args: translationTaskForm,
          });
        }

        if (extractedGeneratePayload && !emittedGenerateToolResult) {
          controller.enqueue({
            type: "tool_result",
            name: GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME,
            result: JSON.stringify(extractedGeneratePayload),
          });
        }

        controller.enqueue({
          type: "done",
          metadata: {
            totalTokens: 0,
            model: modelName,
            finalReply,
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
