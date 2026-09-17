import { useCallback, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage, ChatMessageAttachment } from "../../../lib/chatMessage";
import { coerceChatMessageAttachments } from "../../../lib/chatMessage";
import { trackFeature } from "../../../lib/featureTrack";
import { coerceProductImproveFormPayload } from "../../../lib/productImproveFormPayload";
import { coerceProductQualityFormPayload } from "../../../lib/productQualityFormPayload";
import { coerceHealthDiagnosisFormPayload } from "../../../lib/healthDiagnosisCardPayload";
import {
  coerceImageGenerationFormPayload,
  type ImageGenerationFormPayload,
} from "../../../lib/imageGenerationFormPayload";
import { coercePictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import {
  coerceBatchTasksFormPayload,
  type BatchTaskProduct,
} from "../../../lib/batchTasksFormPayload";
import {
  buildImageGenerationProposal,
  buildSinglePictureTranslateProposal,
  buildSingleProductImproveProposal,
  coerceTaskProposalPayload,
  mergeTaskProposalTargets,
  taskProposalFromBatchTasksPayload,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import { shouldKeepExistingTaskProposal } from "../../../lib/chatTaskProposalGuard";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import type { SkillStepProgress } from "./chatStreamUtils";
import {
  parseWorkspaceActionsPayload,
  type WorkspaceActionsPayload,
} from "../../../lib/workspaceSuggestedActions";
import type { ThinkingStep } from "../../../lib/thinkingSteps";
import { THINKING_PHASE } from "../../../lib/thinkingSteps";
import { numberAdviceItems } from "../../../lib/numberAdviceItems";

export type { SkillStepProgress } from "./chatStreamUtils";
export { hasStreamingVisualContent } from "./chatStreamUtils";

function upsertProgressStep(
  steps: SkillStepProgress[],
  nextStep: SkillStepProgress,
): SkillStepProgress[] {
  const index = steps.findIndex(
    (step) => step.skill === nextStep.skill && step.stepId === nextStep.stepId,
  );
  if (index < 0) return [...steps, nextStep];
  const next = [...steps];
  next[index] = nextStep;
  return next;
}

type SkillProgressEvent = {
  skill: string;
  stepId: string;
  label: string;
  status: "running" | "completed" | "skipped" | "error";
  detail?: string;
};

type StreamChunk =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "skill_progress"; event: SkillProgressEvent }
  | { type: "task_proposal"; payload: unknown }
  | { type: "status"; phase: "thinking" }
  | { type: "error"; message: string }
  | {
      type: "done";
      metadata: {
        totalTokens: number;
        model: string;
        finalReply?: string;
        uiPayloads?: {
          productImproveCardPayload?: unknown;
          productQualityCard?: unknown;
          healthDiagnosisCard?: unknown;
          pictureTranslateCard?: unknown;
          imageGenerationCard?: unknown;
          batchTasksCard?: unknown;
          taskProposal?: unknown;
          workspaceActions?: unknown;
          attachments?: unknown;
        };
      };
    };

function shouldPreferBatchOverProductImprove(workspaceProducts?: BatchTaskProduct[]): boolean {
  return (workspaceProducts?.length ?? 0) >= 2;
}

export type ChatStreamFinishPayload = {
  aborted: boolean;
  /** SSE `type:error`（如额度不足）时为 true，调用方勿再触发标题 LLM */
  streamError?: boolean;
  reply: string;
  thinkingContent?: string;
  /** 思考面板里的步骤（每次工具调用一条），随消息落库供历史回看 */
  thinkingSteps?: ThinkingStep[];
  attachments?: ChatMessageAttachment[];
  productImproveCard?: boolean;
  productImproveCardPayload?: unknown;
  imageGenerationCard?: boolean;
  imageGenerationCardPayload?: ImageGenerationFormPayload;
  productQualityCard?: boolean;
  productQualityCardPayload?: unknown;
  healthDiagnosisCard?: boolean;
  healthDiagnosisCardPayload?: unknown;
  workspaceActions?: WorkspaceActionsPayload | false;
  taskProposal?: TaskProposalPayload;
  httpStatus?: number;
};

type Snapshot = {
  reply: string;
  streamedText: string;
  thinkingContent: string;
  thinkingSteps: SkillStepProgress[];
  attachments: ChatMessageAttachment[];
  productImproveCard: boolean;
  productImproveCardPayload?: unknown;
  imageGenerationCard: boolean;
  imageGenerationCardPayload?: ImageGenerationFormPayload;
  productQualityCard: boolean;
  productQualityCardPayload?: unknown;
  healthDiagnosisCard: boolean;
  healthDiagnosisCardPayload?: unknown;
  workspaceActions: WorkspaceActionsPayload | false;
  taskProposal?: TaskProposalPayload;
  streamError?: boolean;
};

function snapshotToFinishPayload(snapshot: Snapshot, aborted: boolean): ChatStreamFinishPayload {
  return {
    aborted,
    streamError: snapshot.streamError === true,
    reply: snapshot.reply,
    thinkingContent: snapshot.thinkingContent || undefined,
    thinkingSteps: snapshot.thinkingSteps.length
      ? snapshot.thinkingSteps.map(({ label, status }) => ({ label, status }))
      : undefined,
    attachments: snapshot.attachments,
    productImproveCard: snapshot.productImproveCard,
    productImproveCardPayload: snapshot.productImproveCardPayload,
    imageGenerationCard: snapshot.imageGenerationCard,
    imageGenerationCardPayload: snapshot.imageGenerationCardPayload,
    productQualityCard: snapshot.productQualityCard,
    productQualityCardPayload: snapshot.productQualityCardPayload,
    healthDiagnosisCard: snapshot.healthDiagnosisCard,
    healthDiagnosisCardPayload: snapshot.healthDiagnosisCardPayload,
    workspaceActions: snapshot.workspaceActions || undefined,
    taskProposal: snapshot.taskProposal,
  };
}

/** @deprecated 兼容旧名，等价于 SkillStepProgress */
export type PlaybookStepProgress = SkillStepProgress;

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  // streamingText / streamingThinkingText 不走 React state：逐 token 更新在 ref 里累积，
  // 经订阅通知（rAF 合帧）只推给流式气泡，避免整个工作台壳跟着每个 token 重渲染。
  const textListenersRef = useRef(new Set<() => void>());
  const textNotifyScheduledRef = useRef(false);
  const [streamingGenerateCard, setStreamingGenerateCard] = useState(false);
  const [streamingGeneratePayload, setStreamingGeneratePayload] = useState<unknown>();
  const [streamingQualityCard, setStreamingQualityCard] = useState(false);
  const [streamingQualityPayload, setStreamingQualityPayload] = useState<unknown>();
  const [streamingHealthDiagnosisCard, setStreamingHealthDiagnosisCard] = useState(false);
  const [streamingHealthDiagnosisPayload, setStreamingHealthDiagnosisPayload] =
    useState<unknown>();
  const [streamingTaskProposal, setStreamingTaskProposal] =
    useState<TaskProposalPayload | undefined>();
  const [streamingWorkspaceActions, setStreamingWorkspaceActions] = useState<
    WorkspaceActionsPayload | false
  >(false);
  const [skillSteps, setSkillSteps] = useState<SkillStepProgress[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot>({
    reply: "",
    streamedText: "",
    thinkingContent: "",
    thinkingSteps: [],
    attachments: [],
    productImproveCard: false,
    productImproveCardPayload: undefined,
    imageGenerationCard: false,
    imageGenerationCardPayload: undefined,
    productQualityCard: false,
    productQualityCardPayload: undefined,
    healthDiagnosisCard: false,
    healthDiagnosisCardPayload: undefined,
    workspaceActions: false,
    taskProposal: undefined,
  });

  const resetSnapshot = () => {
    snapshotRef.current = {
      reply: "",
      streamedText: "",
      thinkingContent: "",
      thinkingSteps: [],
      attachments: [],
      productImproveCard: false,
      productImproveCardPayload: undefined,
      imageGenerationCard: false,
      imageGenerationCardPayload: undefined,
      productQualityCard: false,
      productQualityCardPayload: undefined,
      healthDiagnosisCard: false,
      healthDiagnosisCardPayload: undefined,
      workspaceActions: false,
      taskProposal: undefined,
    };
  };

  const notifyStreamingText = useCallback(() => {
    if (textNotifyScheduledRef.current) return;
    textNotifyScheduledRef.current = true;
    requestAnimationFrame(() => {
      textNotifyScheduledRef.current = false;
      textListenersRef.current.forEach((listener) => listener());
    });
  }, []);

  const subscribeStreamingText = useCallback((listener: () => void) => {
    textListenersRef.current.add(listener);
    return () => {
      textListenersRef.current.delete(listener);
    };
  }, []);

  const getStreamingText = useCallback(() => snapshotRef.current.streamedText, []);
  const getStreamingThinkingText = useCallback(
    () => snapshotRef.current.thinkingContent,
    [],
  );

  const streamingTextStore = useMemo(
    () => ({
      subscribe: subscribeStreamingText,
      getText: getStreamingText,
      getThinkingText: getStreamingThinkingText,
    }),
    [subscribeStreamingText, getStreamingText, getStreamingThinkingText],
  );

  const resetStreamingUi = () => {
    snapshotRef.current.streamedText = "";
    snapshotRef.current.thinkingContent = "";
    snapshotRef.current.thinkingSteps = [];
    notifyStreamingText();
    setStreamingGenerateCard(false);
    setStreamingGeneratePayload(undefined);
    setStreamingQualityCard(false);
    setStreamingQualityPayload(undefined);
    setStreamingHealthDiagnosisCard(false);
    setStreamingHealthDiagnosisPayload(undefined);
    setStreamingTaskProposal(undefined);
    setStreamingWorkspaceActions(false);
    setSkillSteps([]);
  };

  const prepareStreaming = useCallback(() => {
    flushSync(() => {
      setIsStreaming(true);
      setAwaitingFirstChunk(true);
      resetSnapshot();
      resetStreamingUi();
    });
  }, []);

  const sendMessage = useCallback(
    async (
      messages: ChatMessage[],
      options?: {
        url?: string;
        fileIds?: string[];
        skillFocus?: string | null;
        workspaceBatchProducts?: BatchTaskProduct[];
        /** 工作台按条件圈定的商品 query（TaskProposal 兜底 targets 用） */
        workspaceProductQuery?: ObjectQuerySelection | null;
        onFinish?: (payload: ChatStreamFinishPayload) => void;
      },
    ) => {
      const url = options?.url ?? "/chat-stream";
      const onFinish = options?.onFinish;
      const fileIds = options?.fileIds ?? [];
      const skillFocus = options?.skillFocus?.trim() || null;
      const workspaceBatchProducts = options?.workspaceBatchProducts ?? [];
      const workspaceProductQuery = options?.workspaceProductQuery ?? null;
      const preferBatchCard = shouldPreferBatchOverProductImprove(workspaceBatchProducts);

      /** 应用通用提案卡（合并工作台上下文，并替换单商品即时卡） */
      const applyTaskProposal = (proposal: TaskProposalPayload | null) => {
        if (!proposal) return;
        if (shouldKeepExistingTaskProposal(snapshotRef.current.taskProposal, proposal)) {
          return;
        }
        const merged = mergeTaskProposalTargets(
          proposal,
          workspaceBatchProducts,
          workspaceProductQuery,
        );
        snapshotRef.current.taskProposal = merged;
        snapshotRef.current.productImproveCard = false;
        snapshotRef.current.productImproveCardPayload = undefined;
        snapshotRef.current.imageGenerationCard = false;
        snapshotRef.current.imageGenerationCardPayload = undefined;
        setStreamingGenerateCard(false);
        setStreamingGeneratePayload(undefined);
        setStreamingTaskProposal(merged);
      };

      trackFeature("chat", "send_message", {
        fileCount: fileIds.length,
        batchProductCount: workspaceBatchProducts.length,
      });

      prepareStreaming();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let finalized = false;
      const finalizeOnce = (payload: ChatStreamFinishPayload) => {
        if (finalized) return;
        finalized = true;
        setIsStreaming(false);
        setAwaitingFirstChunk(false);
        resetStreamingUi();
        onFinish?.(payload);
      };

      /** 步骤同时进 React state（实时渲染）与快照（随消息落库）。 */
      const trackStep = (step: SkillStepProgress) => {
        snapshotRef.current.thinkingSteps = upsertProgressStep(
          snapshotRef.current.thinkingSteps,
          step,
        );
        setSkillSteps((prev) => upsertProgressStep(prev, step));
      };

      const trackPhase = (
        phase: (typeof THINKING_PHASE)[keyof typeof THINKING_PHASE],
        status: SkillStepProgress["status"],
      ) => {
        trackStep({
          skill: "thinking",
          stepId: phase,
          label: phase,
          status,
        });
      };

      const completeAnalyzeIfNeeded = () => {
        const hasAnalyze = snapshotRef.current.thinkingSteps.some(
          (step) => step.stepId === THINKING_PHASE.analyze,
        );
        if (hasAnalyze) {
          trackPhase(THINKING_PHASE.analyze, "completed");
        }
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            ...(fileIds.length ? { fileIds } : {}),
            ...(skillFocus ? { skillFocus } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let message = "";
          try {
            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
              const json = (await response.json()) as {
                error?: string;
                errorMsg?: string;
                message?: string;
              };
              message =
                json.errorMsg?.trim() ||
                json.error?.trim() ||
                json.message?.trim() ||
                "";
            }
          } catch {
            // ignore parse failures; fall back to status-based copy in onFinish
          }
          finalizeOnce({
            aborted: false,
            reply: message,
            httpStatus: response.status,
          });
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        const markFirstChunkSeen = () => {
          setAwaitingFirstChunk(false);
        };

        let reading = true;
        while (reading) {
          const { done, value } = await reader.read();
          if (done) {
            reading = false;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const chunk: StreamChunk = JSON.parse(line.slice(6));

              if (chunk.type === "thinking") {
                // 只有真正收到模型思考内容时才记「理解问题」——不要空跑占位
                if (!snapshotRef.current.thinkingContent) {
                  trackPhase(THINKING_PHASE.analyze, "running");
                }
                const prev = snapshotRef.current.thinkingContent;
                snapshotRef.current.thinkingContent = prev
                  ? `${prev}${chunk.content}`
                  : chunk.content;
                notifyStreamingText();
              } else if (chunk.type === "text") {
                markFirstChunkSeen();
                completeAnalyzeIfNeeded();
                // 正文开始后不再虚构「整理回答」步骤：步骤只反映真实工具调用
                const next = snapshotRef.current.streamedText + chunk.content;
                snapshotRef.current.streamedText = next;
                snapshotRef.current.reply = next;
                notifyStreamingText();
              } else if (chunk.type === "status") {
                if (chunk.phase === "thinking") {
                  setAwaitingFirstChunk(true);
                }
              } else if (chunk.type === "task_proposal") {
                markFirstChunkSeen();
                const proposal = coerceTaskProposalPayload(chunk.payload);
                if (proposal) {
                  applyTaskProposal(proposal);
                }
              } else if (chunk.type === "skill_progress") {
                markFirstChunkSeen();
                completeAnalyzeIfNeeded();
                trackStep(chunk.event);
              } else if (chunk.type === "tool_call") {
                markFirstChunkSeen();
                completeAnalyzeIfNeeded();
                trackStep({
                  skill: "tool",
                  stepId: chunk.name,
                  label: `tool:${chunk.name}`,
                  status: "running",
                });
                if (chunk.name === "open_product_improve_form") {
                  // 表单态统一转通用提案卡；即时生成结果（generate_product_description）保留旧卡
                  applyTaskProposal(
                    buildSingleProductImproveProposal(
                      coerceProductImproveFormPayload(chunk.args),
                    ),
                  );
                } else if (chunk.name === "open_picture_translate_form") {
                  applyTaskProposal(
                    buildSinglePictureTranslateProposal(
                      coercePictureTranslateFormPayload(chunk.args),
                    ),
                  );
                } else if (chunk.name === "open_image_generation_form") {
                  applyTaskProposal(
                    buildImageGenerationProposal(coerceImageGenerationFormPayload(chunk.args)),
                  );
                } else if (chunk.name === "open_product_quality_form") {
                  const qualityPayload = coerceProductQualityFormPayload(chunk.args);
                  snapshotRef.current.productQualityCard = true;
                  snapshotRef.current.productQualityCardPayload = qualityPayload;
                  setStreamingQualityCard(true);
                  setStreamingQualityPayload(qualityPayload);
                } else if (chunk.name === "open_health_diagnosis_form") {
                  const healthPayload = coerceHealthDiagnosisFormPayload(chunk.args);
                  snapshotRef.current.healthDiagnosisCard = true;
                  snapshotRef.current.healthDiagnosisCardPayload = healthPayload;
                  setStreamingHealthDiagnosisCard(true);
                  setStreamingHealthDiagnosisPayload(healthPayload);
                } else if (chunk.name === "open_batch_tasks_form") {
                  // 旧服务端兼容：批量卡片 chunk 统一转为通用 TaskProposal
                  applyTaskProposal(
                    taskProposalFromBatchTasksPayload(
                      coerceBatchTasksFormPayload(chunk.args),
                    ),
                  );
                }
              } else if (chunk.type === "tool_result") {
                markFirstChunkSeen();
                let toolStatus: SkillStepProgress["status"] = "completed";
                try {
                  const parsed = JSON.parse(chunk.result) as { error?: unknown };
                  if (parsed && typeof parsed === "object" && parsed.error != null) {
                    toolStatus = "error";
                  }
                } catch {
                  // 非 JSON 结果按成功收尾
                }
                trackStep({
                  skill: "tool",
                  stepId: chunk.name,
                  label: `tool:${chunk.name}`,
                  status: toolStatus,
                });
                if (chunk.name === "generate_product_description") {
                  const parsed = JSON.parse(chunk.result) as unknown;
                  snapshotRef.current.productImproveCard = true;
                  snapshotRef.current.productImproveCardPayload = parsed;
                  setStreamingGenerateCard(true);
                  setStreamingGeneratePayload(parsed);
                } else if (chunk.name === "score_product_quality") {
                  try {
                    const parsed = JSON.parse(chunk.result) as unknown;
                    const qualityPayload = coerceProductQualityFormPayload(parsed);
                    snapshotRef.current.productQualityCard = true;
                    snapshotRef.current.productQualityCardPayload = qualityPayload;
                    setStreamingQualityCard(true);
                    setStreamingQualityPayload(qualityPayload);
                  } catch {
                    snapshotRef.current.productQualityCard = true;
                    snapshotRef.current.productQualityCardPayload =
                      coerceProductQualityFormPayload({});
                    setStreamingQualityCard(true);
                    setStreamingQualityPayload(coerceProductQualityFormPayload({}));
                  }
                }
              } else if (chunk.type === "error") {
                markFirstChunkSeen();
                const msg = chunk.message;
                snapshotRef.current.streamError = true;
                setSkillSteps((prev) =>
                  prev.map((step) =>
                    step.status === "running" ? { ...step, status: "error" } : step,
                  ),
                );
                snapshotRef.current.streamedText = msg;
                snapshotRef.current.reply = msg;
                notifyStreamingText();
              } else if (chunk.type === "done") {
                markFirstChunkSeen();
                setSkillSteps((prev) =>
                  prev.map((step) =>
                    step.status === "running" ? { ...step, status: "completed" } : step,
                  ),
                );
                snapshotRef.current.thinkingSteps = snapshotRef.current.thinkingSteps.map(
                  (step) =>
                    step.status === "running" ? { ...step, status: "completed" } : step,
                );
                // 多轮工具后 finalReply 取的是最长一条；若仍是短收尾，才用流式长文兜底。
                // 不要无脑取更长的 streamed——那会把两轮正文拼成重复答。
                const metaReply = chunk.metadata.finalReply?.trim() || "";
                const streamedReply = snapshotRef.current.streamedText.trim();
                const metaLooksThin =
                  metaReply.length > 0 &&
                  metaReply.length < 120 &&
                  !/建议/.test(metaReply);
                const rawReply =
                  metaLooksThin && streamedReply.length > metaReply.length
                    ? streamedReply
                    : metaReply || streamedReply || snapshotRef.current.reply;
                // 客户端再跑一遍编号兜底：流式交接可能绕过服务端 polish
                const reply = numberAdviceItems(rawReply);
                snapshotRef.current.reply = reply;

                const ui = chunk.metadata.uiPayloads;
                if (ui?.attachments) {
                  snapshotRef.current.attachments =
                    coerceChatMessageAttachments(ui.attachments);
                }
                if (ui?.taskProposal && !snapshotRef.current.taskProposal) {
                  applyTaskProposal(coerceTaskProposalPayload(ui.taskProposal));
                }
                if (ui?.productQualityCard && !snapshotRef.current.productQualityCard) {
                  const qualityPayload = coerceProductQualityFormPayload(ui.productQualityCard);
                  snapshotRef.current.productQualityCard = true;
                  snapshotRef.current.productQualityCardPayload = qualityPayload;
                  setStreamingQualityCard(true);
                  setStreamingQualityPayload(qualityPayload);
                }
                if (ui?.healthDiagnosisCard && !snapshotRef.current.healthDiagnosisCard) {
                  const healthPayload = coerceHealthDiagnosisFormPayload(ui.healthDiagnosisCard);
                  snapshotRef.current.healthDiagnosisCard = true;
                  snapshotRef.current.healthDiagnosisCardPayload = healthPayload;
                  setStreamingHealthDiagnosisCard(true);
                  setStreamingHealthDiagnosisPayload(healthPayload);
                }
                if (ui?.workspaceActions && !snapshotRef.current.workspaceActions) {
                  const actions = parseWorkspaceActionsPayload(ui.workspaceActions);
                  if (actions) {
                    snapshotRef.current.workspaceActions = actions;
                    setStreamingWorkspaceActions(actions);
                  }
                }
                if (
                  ui?.productImproveCardPayload &&
                  !preferBatchCard &&
                  !snapshotRef.current.taskProposal
                ) {
                  // 已生成结果保留旧结果卡；表单态转通用提案卡
                  const rec = ui.productImproveCardPayload as Record<string, unknown>;
                  const isResult =
                    rec.ok === true ||
                    (typeof rec.title === "string" &&
                      rec.title.trim() !== "" &&
                      typeof rec.description === "string" &&
                      rec.description.trim() !== "");
                  if (isResult) {
                    snapshotRef.current.productImproveCard = true;
                    snapshotRef.current.productImproveCardPayload =
                      ui.productImproveCardPayload;
                    setStreamingGenerateCard(true);
                    setStreamingGeneratePayload(ui.productImproveCardPayload);
                  } else {
                    applyTaskProposal(
                      buildSingleProductImproveProposal(
                        coerceProductImproveFormPayload(rec),
                      ),
                    );
                  }
                }
                if (ui?.pictureTranslateCard && !snapshotRef.current.taskProposal) {
                  applyTaskProposal(
                    buildSinglePictureTranslateProposal(
                      coercePictureTranslateFormPayload(ui.pictureTranslateCard),
                    ),
                  );
                }
                if (ui?.imageGenerationCard && !snapshotRef.current.taskProposal) {
                  applyTaskProposal(
                    buildImageGenerationProposal(
                      coerceImageGenerationFormPayload(ui.imageGenerationCard),
                    ),
                  );
                }
                if (ui?.batchTasksCard && !snapshotRef.current.taskProposal) {
                  // 旧服务端 uiPayloads 兼容：batchTasksCard 统一转为通用 TaskProposal
                  applyTaskProposal(
                    taskProposalFromBatchTasksPayload(
                      coerceBatchTasksFormPayload(ui.batchTasksCard),
                    ),
                  );
                }

                const finishPayload = snapshotToFinishPayload(
                  snapshotRef.current,
                  false,
                );

                const streamed = snapshotRef.current.streamedText;
                if (reply && reply.length > streamed.length) {
                  snapshotRef.current.streamedText = reply;
                  notifyStreamingText();
                  requestAnimationFrame(() => finalizeOnce(finishPayload));
                } else {
                  finalizeOnce(finishPayload);
                }
              }
            } catch (e) {
              console.error("Failed to parse chunk", e);
            }
          }
        }

        if (!finalized) {
          finalizeOnce(snapshotToFinishPayload(snapshotRef.current, false));
        }
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (aborted) {
          finalizeOnce(snapshotToFinishPayload(snapshotRef.current, true));
        } else {
          console.error("Stream error", e);
          const fallback = "我这边刚刚有点忙，请稍后再试一次。";
          snapshotRef.current.reply = fallback;
          finalizeOnce(snapshotToFinishPayload(snapshotRef.current, false));
        }
      } finally {
        abortControllerRef.current = null;
        if (!finalized) {
          finalizeOnce(
            snapshotToFinishPayload(snapshotRef.current, controller.signal.aborted),
          );
        }
      }
    },
    [prepareStreaming],
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    isStreaming,
    awaitingFirstChunk,
    /** 流式正文/思考文字的订阅式读取（useSyncExternalStore），不随 token 触发调用方重渲染 */
    streamingTextStore,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingQualityCard,
    streamingQualityPayload,
    streamingHealthDiagnosisCard,
    streamingHealthDiagnosisPayload,
    streamingTaskProposal,
    streamingWorkspaceActions,
    skillSteps,
    /** @deprecated 兼容旧名 */
    playbookSteps: skillSteps,
    prepareStreaming,
    sendMessage,
    abort,
  };
}
