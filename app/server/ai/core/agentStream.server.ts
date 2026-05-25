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
import { createLangsmithTracer, getTraceUrl } from "../utils/langsmith.server";
import { getAppEntry } from "../../../config/appEntry.server";
import {
  extractTokenUsageFromMessages,
  recordTokenUsage,
} from "../../tokenUsage/index.server";
import { globalToolRegistry, type AgentContext } from "./toolRegistry.server";
import { globalPlaybookRegistry } from "./playbookRegistry.server";
import {
  createAgentRunId,
  createRunCollector,
  extractToolSummariesFromMessages,
  getRootLangsmithRunId,
  isAgentRunLogEnabled,
  recordAgentRun,
  resolveAgentRunStatus,
  sanitizeHumanInput,
} from "../../agentRunLog/index.server";
import { buildReflectionFromRun } from "../../agentRunLog/recentReflection.server";
import "../skills/index";
import "../playbooks/index";

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
        uiPayloads?: Record<string, unknown>;
        langsmithTraceUrl?: string;
        sparkRunId?: string;
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
  sessionName?: string;
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
  const { messages: agentInputMessages, context, config, sessionName } = params;

  const activeDefs = await globalToolRegistry.getActiveToolDefinitions(context);
  const atomicTools = await globalToolRegistry.getToolsForContext(context);
  const activePlaybookDefs = await globalPlaybookRegistry.getActiveDefinitions(context);
  const playbookTools = await globalPlaybookRegistry.getPlaybookTools(context);
  const extraTools = [...atomicTools, ...playbookTools];
  const graph = await buildShopChatGraph(context, extraTools, activeDefs, activePlaybookDefs);

  const runId = createAgentRunId();
  const startedAtIso = new Date().toISOString();
  const wallStart = Date.now();
  const shop = context.shop?.trim();
  const appName = context.appName ?? getAppEntry();
  const lastUserTextInput = lastHumanUtterance(agentInputMessages);

  const tracer = createLangsmithTracer(sessionName ?? `chat-stream-${runId}`);
  const runCollector = createRunCollector();
  const mergedCallbacks = [
    ...(config?.callbacks
      ? Array.isArray(config.callbacks)
        ? config.callbacks
        : [config.callbacks]
      : []),
    tracer,
    runCollector,
  ].filter((c): c is NonNullable<typeof c> => c != null);

  const streamConfig: RunnableConfig = {
    ...config,
    callbacks: mergedCallbacks,
    runName: `spark-chat-stream-${runId}`,
    metadata: {
      ...(typeof config?.metadata === "object" && config.metadata !== null
        ? config.metadata
        : {}),
      sparkRunId: runId,
      shop,
      appName,
      feature: "chat_stream",
    },
  };

  const persistStreamRun = async (params: {
    status: "success" | "error";
    resultMessages: BaseMessage[];
    errorMessage?: string;
  }) => {
    if (!shop) {
      console.warn(
        `[AgentRunLog] skip chat_stream persist (no shop in context) runId=${runId}`,
      );
      return;
    }
    if (!isAgentRunLogEnabled()) return;
    const durationMs = Date.now() - wallStart;
    const agentUsage = extractTokenUsageFromMessages(params.resultMessages);
    const tools = extractToolSummariesFromMessages(params.resultMessages);
    const langsmithRunId = getRootLangsmithRunId(runCollector);
    await recordAgentRun({
      runId,
      shop,
      appName,
      feature: "chat_stream",
      status: resolveAgentRunStatus({
        explicitStatus: params.status,
        durationMs,
      }),
      startedAt: startedAtIso,
      durationMs,
      langsmithRunId,
      inputSummary: {
        lastHuman: sanitizeHumanInput(
          lastHumanUtterance(params.resultMessages) || lastUserTextInput,
        ),
      },
      tools,
      tokenUsage:
        agentUsage.totalTokens > 0
          ? {
              prompt: agentUsage.inputTokens,
              completion: agentUsage.outputTokens,
              total: agentUsage.totalTokens,
            }
          : undefined,
      error: params.errorMessage
        ? { message: params.errorMessage }
        : undefined,
      reflection: buildReflectionFromRun({
        status: params.status,
        replyText: params.resultMessages
          .map((message) => extractMessageText(message))
          .filter(Boolean)
          .join("\n"),
        toolNames: tools.map((tool) => tool.name),
        errorMessage: params.errorMessage,
        inputText: lastUserTextInput,
      }),
    });
  };

  return new ReadableStream<StreamChunk>({
    async start(controller) {
      const modelName = String(getShopChatModel().model ?? "unknown");
      const langsmithRunId = () => getRootLangsmithRunId(runCollector);
      const traceMeta = () => {
        const id = langsmithRunId();
        return {
          sparkRunId: runId,
          ...(id ? { langsmithTraceUrl: getTraceUrl(id) ?? undefined } : {}),
        };
      };

      try {
        const lgStream = await graph.stream(
          { messages: agentInputMessages },
          {
            ...streamConfig,
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

            for (const def of activeDefs) {
              if (def.onStreamEvent) {
                def.onStreamEvent(ev, (chunk) => controller.enqueue(chunk), streamContext);
              }
            }
            for (const def of activePlaybookDefs) {
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
          await persistStreamRun({ status: "success", resultMessages });
          const fb = await generateFallbackReplyStream(
            lastUserText,
            extractMessagesContext(resultMessages),
          );
          const reader = fb.getReader();
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.type === "done") {
              controller.enqueue({
                type: "done",
                metadata: {
                  ...value.metadata,
                  ...traceMeta(),
                },
              });
            } else {
              controller.enqueue(value);
            }
          }
          controller.close();
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const uiPayloads: Record<string, any> = {};
        for (const def of activeDefs) {
          if (def.extractUIPayload && def.uiPayloadKey) {
            const payload = def.extractUIPayload(resultMessages, lastUserText, finalReply);
            if (payload !== undefined) {
              uiPayloads[def.uiPayloadKey] = payload;

              if (
                def.name === "translationTaskForm" &&
                !streamContext.emittedFlags.has("translationTaskForm")
              ) {
                controller.enqueue({
                  type: "tool_call",
                  name: "open_translation_task_form",
                  args: payload,
                });
              }

              if (
                def.name === "generateProductDescription" &&
                !streamContext.emittedFlags.has("generateProductDescription")
              ) {
                controller.enqueue({
                  type: "tool_result",
                  name: "generate_product_description",
                  result:
                    typeof payload === "object"
                      ? JSON.stringify(payload)
                      : String(payload),
                });
              }
            }
          }
        }
        for (const def of activePlaybookDefs) {
          if (def.extractUIPayload && def.uiPayloadKey) {
            const payload = def.extractUIPayload(resultMessages, lastUserText, finalReply);
            if (payload !== undefined) {
              uiPayloads[def.uiPayloadKey] = payload;
            }
          }
        }

        const agentUsage = extractTokenUsageFromMessages(resultMessages);
        if (shop && agentUsage.totalTokens > 0) {
          await recordTokenUsage({
            shop,
            appName,
            usage: agentUsage,
          });
        }

        await persistStreamRun({ status: "success", resultMessages });

        controller.enqueue({
          type: "done",
          metadata: {
            totalTokens: agentUsage.totalTokens,
            model: modelName,
            finalReply,
            uiPayloads,
            ...traceMeta(),
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
        await persistStreamRun({
          status: "error",
          resultMessages: [],
          errorMessage: hint,
        });
        controller.enqueue({ type: "error", message: hint });
        controller.enqueue({
          type: "done",
          metadata: { totalTokens: 0, model: modelName, ...traceMeta() },
        });
        controller.close();
      }
    },
  });
}
