import { useCallback, useRef, useState } from "react";
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
  buildBatchProductImproveProposal,
  buildImageGenerationProposal,
  buildSinglePictureTranslateProposal,
  buildSingleProductImproveProposal,
  coerceTaskProposalPayload,
  mergeTaskProposalTargets,
  taskProposalFromBatchTasksPayload,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import type { SkillStepProgress } from "./chatStreamUtils";

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
          attachments?: unknown;
        };
      };
    };

function shouldPreferBatchOverProductImprove(workspaceProducts?: BatchTaskProduct[]): boolean {
  return (workspaceProducts?.length ?? 0) >= 2;
}

export type ChatStreamFinishPayload = {
  aborted: boolean;
  reply: string;
  thinkingContent?: string;
  attachments?: ChatMessageAttachment[];
  productImproveCard?: boolean;
  productImproveCardPayload?: unknown;
  imageGenerationCard?: boolean;
  imageGenerationCardPayload?: ImageGenerationFormPayload;
  productQualityCard?: boolean;
  productQualityCardPayload?: unknown;
  healthDiagnosisCard?: boolean;
  healthDiagnosisCardPayload?: unknown;
  taskProposal?: TaskProposalPayload;
  httpStatus?: number;
};

type Snapshot = {
  reply: string;
  streamedText: string;
  thinkingContent: string;
  thinkingNotes: string[];
  attachments: ChatMessageAttachment[];
  productImproveCard: boolean;
  productImproveCardPayload?: unknown;
  imageGenerationCard: boolean;
  imageGenerationCardPayload?: ImageGenerationFormPayload;
  productQualityCard: boolean;
  productQualityCardPayload?: unknown;
  healthDiagnosisCard: boolean;
  healthDiagnosisCardPayload?: unknown;
  taskProposal?: TaskProposalPayload;
};

function snapshotToFinishPayload(snapshot: Snapshot, aborted: boolean): ChatStreamFinishPayload {
  return {
    aborted,
    reply: snapshot.reply,
    thinkingContent: snapshot.thinkingContent || undefined,
    attachments: snapshot.attachments,
    productImproveCard: snapshot.productImproveCard,
    productImproveCardPayload: snapshot.productImproveCardPayload,
    imageGenerationCard: snapshot.imageGenerationCard,
    imageGenerationCardPayload: snapshot.imageGenerationCardPayload,
    productQualityCard: snapshot.productQualityCard,
    productQualityCardPayload: snapshot.productQualityCardPayload,
    healthDiagnosisCard: snapshot.healthDiagnosisCard,
    healthDiagnosisCardPayload: snapshot.healthDiagnosisCardPayload,
    taskProposal: snapshot.taskProposal,
  };
}

/** @deprecated 兼容旧名，等价于 SkillStepProgress */
export type PlaybookStepProgress = SkillStepProgress;

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinkingText, setStreamingThinkingText] = useState("");
  const [streamingGenerateCard, setStreamingGenerateCard] = useState(false);
  const [streamingGeneratePayload, setStreamingGeneratePayload] = useState<unknown>();
  const [streamingQualityCard, setStreamingQualityCard] = useState(false);
  const [streamingQualityPayload, setStreamingQualityPayload] = useState<unknown>();
  const [streamingHealthDiagnosisCard, setStreamingHealthDiagnosisCard] = useState(false);
  const [streamingHealthDiagnosisPayload, setStreamingHealthDiagnosisPayload] =
    useState<unknown>();
  const [streamingTaskProposal, setStreamingTaskProposal] =
    useState<TaskProposalPayload | undefined>();
  const [skillSteps, setSkillSteps] = useState<SkillStepProgress[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot>({
    reply: "",
    streamedText: "",
    thinkingContent: "",
    thinkingNotes: [],
    attachments: [],
    productImproveCard: false,
    productImproveCardPayload: undefined,
    imageGenerationCard: false,
    imageGenerationCardPayload: undefined,
    productQualityCard: false,
    productQualityCardPayload: undefined,
    healthDiagnosisCard: false,
    healthDiagnosisCardPayload: undefined,
    taskProposal: undefined,
  });

  const resetSnapshot = () => {
    snapshotRef.current = {
      reply: "",
      streamedText: "",
      thinkingContent: "",
      thinkingNotes: [],
      attachments: [],
      productImproveCard: false,
      productImproveCardPayload: undefined,
      imageGenerationCard: false,
      imageGenerationCardPayload: undefined,
      productQualityCard: false,
      productQualityCardPayload: undefined,
      healthDiagnosisCard: false,
      healthDiagnosisCardPayload: undefined,
      taskProposal: undefined,
    };
  };

  const resetStreamingUi = () => {
    setStreamingText("");
    setStreamingThinkingText("");
    setStreamingGenerateCard(false);
    setStreamingGeneratePayload(undefined);
    setStreamingQualityCard(false);
    setStreamingQualityPayload(undefined);
    setStreamingHealthDiagnosisCard(false);
    setStreamingHealthDiagnosisPayload(undefined);
    setStreamingTaskProposal(undefined);
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
        workspaceBatchProducts?: BatchTaskProduct[];
        /** 工作台按条件圈定的商品 query（TaskProposal 兜底 targets 用） */
        workspaceProductQuery?: ObjectQuerySelection | null;
        onFinish?: (payload: ChatStreamFinishPayload) => void;
      },
    ) => {
      const url = options?.url ?? "/chat-stream";
      const onFinish = options?.onFinish;
      const fileIds = options?.fileIds ?? [];
      const workspaceBatchProducts = options?.workspaceBatchProducts ?? [];
      const workspaceProductQuery = options?.workspaceProductQuery ?? null;
      const preferBatchCard = shouldPreferBatchOverProductImprove(workspaceBatchProducts);

      /** 应用通用提案卡（合并工作台上下文，并替换单商品即时卡） */
      const applyTaskProposal = (proposal: TaskProposalPayload | null) => {
        if (!proposal) return;
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

      const appendThinkingNote = (note: string) => {
        const trimmed = note.trim();
        if (!trimmed || snapshotRef.current.thinkingNotes.includes(trimmed)) return;
        snapshotRef.current.thinkingNotes.push(trimmed);
        const current = snapshotRef.current.thinkingContent.trim();
        const next = current ? `${current}\n${trimmed}` : trimmed;
        snapshotRef.current.thinkingContent = next;
        setStreamingThinkingText(next);
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, ...(fileIds.length ? { fileIds } : {}) }),
          signal: controller.signal,
        });

        if (!response.ok) {
          finalizeOnce({
            aborted: false,
            reply: "",
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
                setStreamingThinkingText((prev) => {
                  const next = prev
                    ? `${prev}${chunk.content}`
                    : chunk.content;
                  snapshotRef.current.thinkingContent = next;
                  return next;
                });
              } else if (chunk.type === "text") {
                markFirstChunkSeen();
                setStreamingText((prev) => {
                  const next = prev + chunk.content;
                  snapshotRef.current.streamedText = next;
                  snapshotRef.current.reply = next;
                  return next;
                });
              } else if (chunk.type === "status") {
                if (chunk.phase === "thinking") {
                  setAwaitingFirstChunk(true);
                  appendThinkingNote("Analyzing the request");
                }
              } else if (chunk.type === "task_proposal") {
                markFirstChunkSeen();
                const proposal = coerceTaskProposalPayload(chunk.payload);
                if (proposal) {
                  applyTaskProposal(proposal);
                  appendThinkingNote(`已生成任务确认卡片：${proposal.title}`);
                }
              } else if (chunk.type === "skill_progress") {
                markFirstChunkSeen();
                const ev = chunk.event;
                appendThinkingNote(`${ev.label}: ${ev.status}`);
                setSkillSteps((prev) => upsertProgressStep(prev, ev));
              } else if (chunk.type === "tool_call") {
                markFirstChunkSeen();
                appendThinkingNote(`Preparing ${chunk.name}`);
                setSkillSteps((prev) =>
                  upsertProgressStep(prev, {
                    skill: "tool",
                    stepId: chunk.name,
                    label: `tool:${chunk.name}`,
                    status: "running",
                  }),
                );
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
                appendThinkingNote(`${chunk.name} returned a result`);
                setSkillSteps((prev) =>
                  upsertProgressStep(prev, {
                    skill: "tool",
                    stepId: chunk.name,
                    label: `tool:${chunk.name}`,
                    status: "completed",
                  }),
                );
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
                setSkillSteps((prev) =>
                  prev.map((step) =>
                    step.status === "running" ? { ...step, status: "error" } : step,
                  ),
                );
                setStreamingText(msg);
                snapshotRef.current.reply = msg;
              } else if (chunk.type === "done") {
                markFirstChunkSeen();
                setSkillSteps((prev) =>
                  prev.map((step) =>
                    step.status === "running" ? { ...step, status: "completed" } : step,
                  ),
                );
                const reply =
                  chunk.metadata.finalReply?.trim() ||
                  snapshotRef.current.reply;
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
                } else if (
                  ((preferBatchCard && workspaceBatchProducts.length >= 2) ||
                    workspaceProductQuery != null) &&
                  !snapshotRef.current.taskProposal
                ) {
                  // 工作台已选 ≥2 个商品（或按条件圈定）但服务端未发卡片：客户端兜底合成通用提案卡
                  applyTaskProposal(
                    buildBatchProductImproveProposal({
                      products: workspaceBatchProducts,
                    }),
                  );
                }

                const finishPayload = snapshotToFinishPayload(
                  snapshotRef.current,
                  false,
                );

                const streamed = snapshotRef.current.streamedText;
                if (reply && reply.length > streamed.length) {
                  setStreamingText(reply);
                  snapshotRef.current.streamedText = reply;
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
          const fallback = "抱歉，服务暂时不可用，请稍后重试。";
          setStreamingText(fallback);
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
    streamingText,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingQualityCard,
    streamingQualityPayload,
    streamingHealthDiagnosisCard,
    streamingHealthDiagnosisPayload,
    streamingTaskProposal,
    skillSteps,
    streamingThinkingText,
    /** @deprecated 兼容旧名 */
    playbookSteps: skillSteps,
    prepareStreaming,
    sendMessage,
    abort,
  };
}
