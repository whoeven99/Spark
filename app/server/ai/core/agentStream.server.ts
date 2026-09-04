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
  extractMessageThinking,
  extractMessagesContext,
} from "../utils/langchainMessageText";
import { buildShopChatGraph, getShopChatModel } from "./shopChatGraph.server";
import { buildFallbackAssistantSystemPrompt } from "./shopAssistantPrompt";
import { polishFinalReply } from "../utils/polishFinalReply";
import { DEFAULT_LOCALE, type SupportedLocale } from "../../../i18n/config";
import { createLangsmithTracer, getTraceUrl } from "../utils/langsmith.server";
import {
  estimateChatTokenUsage,
  extractTokenUsageFromMessages,
  isChatTokenEstimateFallbackEnabled,
  recordChatTokenUsage,
} from "../../tokenUsage/index.server";
import { globalToolRegistry, type AgentContext } from "./toolRegistry.server";
import {
  isChatToolTrimEnabled,
  selectActiveGatedSkills,
  shouldBindSkillForTurn,
} from "../../../lib/chatToolSelection";
import { globalPlaybookRegistry } from "./playbookRegistry.server";
import type { SkillProgressEvent } from "./skillTypes.server";
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
import { buildReflectionFromRun, fetchRecentReflectionSummary } from "../../agentRunLog/recentReflection.server";
import { recordPlaybookCasesFromMessages } from "../../playbookCase/recordPlaybookCase.server";
import {
  shouldSuppressProductImproveForBatch,
} from "../skills/batchTasks/batchTasks.extract";
import {
  hasAnyChatCardInUiPayloads,
  reconcileReplyWithChatCards,
  resolveMissingChatCardsWithLlm,
} from "./resolveChatCardIntent.server";
import {
  taskProposalFromBatchTasksPayload,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import { coerceBatchTasksFormPayload } from "../../../lib/batchTasksFormPayload";
import {
  coerceProductQualityFormPayload,
  productQualityFormHasScore,
} from "../../../lib/productQualityFormPayload";
import "../skills/index";
import "../playbooks/index";

// ──────────────────────────────────────────────
// 轻量内存缓存
// ──────────────────────────────────────────────

/** 反思摘要缓存：key=shop, value={text, expiresAt} */
const reflectionCache = new Map<string, { text: string; expiresAt: number }>();
const REFLECTION_CACHE_TTL_MS = 30_000; // 30 秒

function getCachedReflection(shop: string): string | undefined {
  const entry = reflectionCache.get(shop);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    reflectionCache.delete(shop);
    return undefined;
  }
  return entry.text;
}

function setCachedReflection(shop: string, text: string): void {
  reflectionCache.set(shop, { text, expiresAt: Date.now() + REFLECTION_CACHE_TTL_MS });
}

/**
 * 带超时和缓存保护的反思摘要获取。
 * 超时或失败时静默回退到 undefined，不阻塞聊天流。
 */
async function fetchReflectionWithTimeout(shop: string, timeoutMs = 3000): Promise<string | undefined> {
  const cached = getCachedReflection(shop);
  if (cached !== undefined) return cached || undefined;

  try {
    const result = await Promise.race([
      fetchRecentReflectionSummary(shop),
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
    const text = result || "";
    setCachedReflection(shop, text);
    return text || undefined;
  } catch {
    setCachedReflection(shop, "");
    return undefined;
  }
}

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "skill_progress"; event: SkillProgressEvent }
  | { type: "task_proposal"; payload: TaskProposalPayload }
  | { type: "status"; phase: "thinking" }
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

/**
 * 汇聚最近几轮用户话术，用于按需绑定工具子集。
 * 跑在上下文窗口（而非仅最后一条）上，避免多轮追问时把上一轮激活的能力裁掉。
 */
function recentHumanText(messages: BaseMessage[], maxTurns = 5): string {
  const texts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && texts.length < maxTurns; i -= 1) {
    const msg = messages[i];
    if (HumanMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) texts.push(text);
    }
  }
  return texts.join("\n");
}

async function generateFallbackReplyStream(
  input: string,
  contextText: string,
  shop?: string,
  locale: SupportedLocale = DEFAULT_LOCALE,
  signal?: AbortSignal,
): Promise<ReadableStream<StreamChunk>> {
  const model = getShopChatModel();

  const stream = await model.stream(
    [
      new SystemMessage(buildFallbackAssistantSystemPrompt(locale)),
      new HumanMessage(
        `用户问题：${input}\n\n已知上下文（可能包含工具执行结果）：\n${contextText || "（无）"}`,
      ),
    ],
    signal ? { signal } : undefined,
  );

  return new ReadableStream({
    async start(controller) {
      let usageMeta: unknown;
      for await (const chunk of stream) {
        if (
          chunk &&
          typeof chunk === "object" &&
          "usage_metadata" in chunk &&
          (chunk as { usage_metadata?: unknown }).usage_metadata
        ) {
          usageMeta = (chunk as { usage_metadata?: unknown }).usage_metadata;
        }
        const content = extractMessageText(chunk);
        if (content) {
          controller.enqueue({ type: "text", content });
        }
      }
      if (shop && usageMeta) {
        await recordChatTokenUsage({ shop, usage: usageMeta });
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
  /** 推荐操作 key 或 Skill 名，用于按需注入 systemPromptExtension */
  skillFocus?: string | null;
  /** 客户端请求的 AbortSignal（HTTP 断开时透传，用于取消图执行与模型调用） */
  signal?: AbortSignal;
};

const DEFAULT_CHAT_STREAM_TIMEOUT_MS = 120_000;

/** 整轮聊天的 wall-clock 超时（含图执行与工具调用）；可用 CHAT_STREAM_TIMEOUT_MS 覆盖。 */
function resolveChatStreamTimeoutMs(): number {
  const raw = Number(process.env.CHAT_STREAM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHAT_STREAM_TIMEOUT_MS;
}

/**
 * 使用 LangGraph `CompiledStateGraph.stream`，组合 streamMode：
 * - `messages`：模型 token / 消息块增量
 * - `tools`：工具生命周期事件（映射为 SSE tool_call / tool_result）
 * - `values`：每步完整状态，用于结束时抽取 messages 做表单解析与润色
 *
 * ⚡ 性能优化：立即返回 ReadableStream，所有异步 setup 在 stream start 内并行执行，
 *    首字节发送 "thinking" 状态事件，客户端可立刻展示思考动画。
 */
export function invokeChatAgentStream(
  params: InvokeChatAgentStreamParams,
): ReadableStream<StreamChunk> {
  const {
    messages: agentInputMessages,
    context,
    config,
    sessionName,
    skillFocus,
    signal: externalSignal,
  } = params;

  // ── 同步预计算（不阻塞响应） ──
  const runId = createAgentRunId();
  const startedAtIso = new Date().toISOString();
  const shop = context.shop?.trim();
  const appName = "spark";
  const lastUserTextInput = lastHumanUtterance(agentInputMessages);

  // ── 取消 / 超时装配 ──
  // 内部 AbortController 汇聚两类中断：整轮 wall-clock 超时，以及客户端断开（externalSignal / 流被 cancel）。
  // 该 signal 透传给 graph.stream → 节点 → 模型 HTTP 调用，使 LLM 请求随之取消。
  const abortController = new AbortController();
  let abortReason: "timeout" | "client" | null = null;
  const triggerAbort = (reason: "timeout" | "client") => {
    if (abortController.signal.aborted) return;
    abortReason = reason;
    abortController.abort();
  };
  const timeoutTimer = setTimeout(
    () => triggerAbort("timeout"),
    resolveChatStreamTimeoutMs(),
  );
  const onExternalAbort = () => triggerAbort("client");
  if (externalSignal) {
    if (externalSignal.aborted) {
      triggerAbort("client");
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }
  const cleanupAbortWiring = () => {
    clearTimeout(timeoutTimer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  };

  return new ReadableStream<StreamChunk>({
    async start(controller) {
      const wallStart = Date.now();
      const safeEnqueue = (chunk: StreamChunk) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // 流已被下游取消/关闭，忽略。
        }
      };
      const safeClose = () => {
        try {
          controller.close();
        } catch {
          // 已关闭，忽略。
        }
      };

      // ── 立即发送思考状态（首字节延迟最小化） ──
      controller.enqueue({ type: "status", phase: "thinking" });

      const modelName = String(getShopChatModel().model ?? "unknown");

      // ── 并行异步 setup：工具、Playbook、反思摘要 ──
      const activeDefs = await globalToolRegistry.getActiveToolDefinitions(context);
      // 按 skillFocus / 最近几轮话术裁剪本轮真正 bind 给模型的重型工具（能力清单 prompt 仍用全量）。
      const activeGated = isChatToolTrimEnabled()
        ? selectActiveGatedSkills({
            skillFocus,
            recentUserText: recentHumanText(agentInputMessages),
          })
        : "all";
      const boundDefs = activeDefs.filter((def) =>
        shouldBindSkillForTurn(def.name, activeGated),
      );
      const [
        atomicTools,
        activePlaybookDefs,
        playbookTools,
        reflectionSummary,
      ] = await Promise.all([
        globalToolRegistry.getToolsForContext(context, boundDefs),
        globalPlaybookRegistry.getActiveDefinitions(context),
        globalPlaybookRegistry.getPlaybookTools(context),
        shop ? fetchReflectionWithTimeout(shop) : Promise.resolve(undefined),
      ]);

      const extraTools = [...atomicTools, ...playbookTools];
      const graph = await buildShopChatGraph(
        context,
        extraTools,
        activeDefs,
        activePlaybookDefs,
        reflectionSummary,
        { skillFocus, userText: lastUserTextInput },
      );

      // ── tracer / run collector ──
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
        signal: abortController.signal,
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

      const langsmithRunId = () => getRootLangsmithRunId(runCollector);
      const traceMeta = () => {
        const id = langsmithRunId();
        return {
          sparkRunId: runId,
          ...(id ? { langsmithTraceUrl: getTraceUrl(id) ?? undefined } : {}),
        };
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

      try {
        context.emitProgress = (event) => {
          controller.enqueue({ type: "skill_progress", event });
        };
        // 兼容：旧的 emitPlaybookStep 转发到统一进度通道
        context.emitPlaybookStep = (playbookName, step, status) => {
          context.emitProgress?.({
            skill: playbookName,
            stepId: step,
            label: step,
            status,
          });
        };

        const lgStream = await graph.stream(
          { messages: agentInputMessages },
          {
            ...streamConfig,
            streamMode: ["messages", "tools", "values"],
          },
        );

        let lastMessages: BaseMessage[] | undefined;
        const streamContext = {
          emittedFlags: new Set<string>(),
          lastUserText: lastUserTextInput,
        };
        let streamedTextAccum = "";

        for await (const item of lgStream) {
          if (!Array.isArray(item) || item.length < 2) continue;

          const mode = item[0] as string;
          const payload = item[1];

          if (mode === "messages") {
            const tuple = payload as [BaseMessage, Record<string, unknown>];
            const [message] = tuple;
            if (AIMessageChunk.isInstance(message)) {
              const thinkingDelta = extractMessageThinking(message);
              if (thinkingDelta) {
                controller.enqueue({ type: "thinking", content: thinkingDelta });
              }
              const delta = extractMessageText(message);
              if (delta) {
                streamedTextAccum += delta;
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
          void persistStreamRun({ status: "success", resultMessages }).catch((err) => {
            console.error("[AgentRunLog] async persist failed:", err);
          });
          void recordPlaybookCasesFromMessages({
            messages: resultMessages,
            shop,
            appName,
            agentRunId: runId,
          }).catch((err) => {
            console.error("[PlaybookCase] async persist failed:", err);
          });
          const fb = await generateFallbackReplyStream(
            lastUserText,
            extractMessagesContext(resultMessages),
            shop,
            context.locale ?? DEFAULT_LOCALE,
            abortController.signal,
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
              const skipProductImprovePayload =
                def.name === "productImprove" &&
                shouldSuppressProductImproveForBatch(lastUserText);
              if (!skipProductImprovePayload) {
                uiPayloads[def.uiPayloadKey] = payload;
              }

              if (def.name === "batchTasksForm") {
                // 两种批量任务（product_improve / picture_translate）均走通用 TaskProposal 协议。
                // uiPayloads 键转换始终执行；流式 chunk 仅在 skill 未发过时补发。
                const batchPayload = coerceBatchTasksFormPayload(payload);
                const proposal = taskProposalFromBatchTasksPayload(batchPayload);
                if (proposal) {
                  delete uiPayloads.batchTasksCard;
                  uiPayloads.taskProposal = proposal;
                  if (!streamContext.emittedFlags.has("batchTasksForm")) {
                    controller.enqueue({ type: "task_proposal", payload: proposal });
                  }
                }
              }

              if (
                def.name === "productImprove" &&
                !shouldSuppressProductImproveForBatch(lastUserText) &&
                !streamContext.emittedFlags.has("productImproveForm") &&
                !streamContext.emittedFlags.has("generateProductDescription") &&
                !streamContext.emittedFlags.has("batchTasksForm")
              ) {
                const rec =
                  payload && typeof payload === "object"
                    ? (payload as Record<string, unknown>)
                    : {};
                const title = typeof rec.title === "string" ? rec.title.trim() : "";
                const description =
                  typeof rec.description === "string" ? rec.description.trim() : "";
                const isGenerateResult =
                  rec.ok === true || (Boolean(title) && Boolean(description));

                if (isGenerateResult) {
                  controller.enqueue({
                    type: "tool_result",
                    name: "generate_product_description",
                    result: JSON.stringify(payload),
                  });
                } else {
                  controller.enqueue({
                    type: "tool_call",
                    name: "open_product_improve_form",
                    args: payload,
                  });
                }
              }

              if (
                def.name === "pictureTranslateForm" &&
                !streamContext.emittedFlags.has("pictureTranslateForm")
              ) {
                controller.enqueue({
                  type: "tool_call",
                  name: "open_picture_translate_form",
                  args: payload,
                });
              }

              if (
                def.name === "imageGenerationForm" &&
                !streamContext.emittedFlags.has("imageGenerationForm")
              ) {
                controller.enqueue({
                  type: "tool_call",
                  name: "open_image_generation_form",
                  args: payload,
                });
              }

              if (
                def.name === "productQualityScore" &&
                !streamContext.emittedFlags.has("productQualityForm") &&
                !streamContext.emittedFlags.has("scoreProductQuality")
              ) {
                const rec =
                  payload && typeof payload === "object"
                    ? (payload as Record<string, unknown>)
                    : {};
                const coerced = coerceProductQualityFormPayload(rec);
                if (productQualityFormHasScore(coerced)) {
                  controller.enqueue({
                    type: "tool_result",
                    name: "score_product_quality",
                    result: JSON.stringify(payload),
                  });
                } else {
                  controller.enqueue({
                    type: "tool_call",
                    name: "open_product_quality_form",
                    args: coerced,
                  });
                }
              }

              if (
                def.name === "healthDiagnosisForm" &&
                !streamContext.emittedFlags.has("healthDiagnosisForm")
              ) {
                controller.enqueue({
                  type: "tool_call",
                  name: "open_health_diagnosis_form",
                  args: payload,
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

        if (!hasAnyChatCardInUiPayloads(uiPayloads)) {
          try {
            const llmResolution = await resolveMissingChatCardsWithLlm({
              messages: resultMessages,
              lastUserText,
              assistantReply: finalReply,
              existingUiPayloads: uiPayloads,
              emittedFlags: streamContext.emittedFlags,
              shop,
              signal: abortController.signal,
            });
            Object.assign(uiPayloads, llmResolution.uiPayloads);
            for (const chunk of llmResolution.streamChunks) {
              controller.enqueue(chunk);
            }
            if (llmResolution.adjustedReply) {
              finalReply = llmResolution.adjustedReply;
            }
          } catch (err) {
            console.error("[ChatStream] LLM chat card resolution failed:", err);
            finalReply = reconcileReplyWithChatCards(finalReply, uiPayloads);
          }
        }

        let agentUsage = extractTokenUsageFromMessages(resultMessages);
        // provider 未返回 usage_metadata 但确有输出：记为漏计告警；仅在显式开启时按估算兜底计费。
        if (agentUsage.totalTokens <= 0 && (finalReply || streamedTextAccum)) {
          const estimated = estimateChatTokenUsage(
            lastUserText,
            finalReply || streamedTextAccum,
          );
          const fallbackOn = isChatTokenEstimateFallbackEnabled();
          console.warn(
            `[TokenUsage][missing] chat_stream had output but usage_metadata=0 shop=${shop ?? "-"} estInput=${estimated.inputTokens} estOutput=${estimated.outputTokens} fallback=${fallbackOn}`,
          );
          if (fallbackOn) {
            agentUsage = estimated;
          }
        }
        const backgroundWrites: Promise<unknown>[] = [];
        if (shop && agentUsage.totalTokens > 0) {
          backgroundWrites.push(recordChatTokenUsage({ shop, usage: agentUsage }));
        }
        backgroundWrites.push(persistStreamRun({ status: "success", resultMessages }));
        backgroundWrites.push(
          recordPlaybookCasesFromMessages({
            messages: resultMessages,
            shop,
            appName,
            agentRunId: runId,
          }),
        );

        if (finalReply.length > streamedTextAccum.length) {
          const remainder = finalReply.slice(streamedTextAccum.length);
          if (remainder) {
            controller.enqueue({ type: "text", content: remainder });
          }
        } else if (finalReply && !streamedTextAccum) {
          controller.enqueue({ type: "text", content: finalReply });
        }

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
        void Promise.allSettled(backgroundWrites).then((results) => {
          for (const result of results) {
            if (result.status === "rejected") {
              console.error("[ChatStream] background write failed:", result.reason);
            }
          }
        });
      } catch (error) {
        // ── 取消 / 超时：图执行被 abort ──
        if (abortController.signal.aborted) {
          const timedOut = abortReason === "timeout";
          void persistStreamRun({
            status: "error",
            resultMessages: [],
            errorMessage: timedOut
              ? "chat_stream timeout"
              : "chat_stream aborted by client",
          }).catch((err) => {
            console.error("[AgentRunLog] async abort persist failed:", err);
          });
          if (timedOut) {
            // 超时是服务端主动中断，客户端仍在监听，需给出可读提示并收尾。
            safeEnqueue({
              type: "error",
              message: "本次回答处理超时，请稍后重试，或把问题拆得更聚焦一些。",
            });
            safeEnqueue({
              type: "done",
              metadata: { totalTokens: 0, model: modelName, ...traceMeta() },
            });
          }
          // 客户端断开时下游已不再读取，直接静默收尾，不再 enqueue。
          safeClose();
          return;
        }

        console.error("invokeChatAgentStream:", error);
        const hint =
          error instanceof Error && error.message.includes("DEEPSEEK_API_KEY")
            ? "未配置 DEEPSEEK_API_KEY，请在环境变量中设置后再试。"
            : error instanceof Error
              ? error.message
              : "AI 服务暂时不可用，请稍后重试。";
        void persistStreamRun({
          status: "error",
          resultMessages: [],
          errorMessage: hint,
        }).catch((err) => {
          console.error("[AgentRunLog] async error persist failed:", err);
        });
        safeEnqueue({ type: "error", message: hint });
        safeEnqueue({
          type: "done",
          metadata: { totalTokens: 0, model: modelName, ...traceMeta() },
        });
        safeClose();
      } finally {
        cleanupAbortWiring();
      }
    },
    cancel() {
      // 下游（客户端）取消读取：中断图执行与模型调用，避免空跑计费。
      triggerAbort("client");
      cleanupAbortWiring();
    },
  });
}
