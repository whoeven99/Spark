import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage, ChatMessageAttachment } from "../../../lib/chatMessage";
import { coerceChatMessageAttachments } from "../../../lib/chatMessage";
import { trackFeature } from "../../../lib/featureTrack";
import { coerceProductImproveFormPayload } from "../../../lib/productImproveFormPayload";
import { coerceImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import { coercePictureTranslateFormPayload } from "../../../lib/pictureTranslateFormPayload";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import {
  coerceBatchTasksFormPayload,
  mergeBatchTasksPayloadWithContext,
  type BatchTaskProduct,
  type BatchTasksFormPayload,
} from "../../../lib/batchTasksFormPayload";
import {
  buildBatchProductImproveProposal,
  coerceTaskProposalPayload,
  mergeTaskProposalTargets,
  type TaskProposalPayload,
} from "../../../lib/taskProposalPayload";
import {
  hasStreamingVisualContent,
  type SkillStepProgress,
} from "./chatStreamUtils";

export type { SkillStepProgress } from "./chatStreamUtils";
export { hasStreamingVisualContent } from "./chatStreamUtils";

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
          translationTaskForm?: unknown;
          productImproveCardPayload?: unknown;
          pictureTranslateCard?: unknown;
          imageGenerationCard?: unknown;
          batchTasksCard?: unknown;
          taskProposal?: unknown;
          attachments?: unknown;
        };
      };
    };

function enrichBatchPayload(
  payload: BatchTasksFormPayload,
  workspaceProducts?: BatchTaskProduct[],
): BatchTasksFormPayload {
  return mergeBatchTasksPayloadWithContext(payload, workspaceProducts ?? []);
}

function shouldPreferBatchOverProductImprove(workspaceProducts?: BatchTaskProduct[]): boolean {
  return (workspaceProducts?.length ?? 0) >= 2;
}

export type ChatStreamFinishPayload = {
  aborted: boolean;
  reply: string;
  thinkingContent?: string;
  translationTaskForm?: unknown;
  attachments?: ChatMessageAttachment[];
  productImproveCard?: boolean;
  productImproveCardPayload?: unknown;
  pictureTranslateCard?: boolean;
  pictureTranslateFormPayload?: unknown;
  imageGenerationCard?: boolean;
  imageGenerationFormPayload?: unknown;
  batchTasksCard?: boolean;
  batchTasksFormPayload?: BatchTasksFormPayload;
  taskProposal?: TaskProposalPayload;
  httpStatus?: number;
};

type Snapshot = {
  reply: string;
  streamedText: string;
  thinkingContent: string;
  thinkingNotes: string[];
  translationTaskForm?: unknown;
  attachments: ChatMessageAttachment[];
  productImproveCard: boolean;
  productImproveCardPayload?: unknown;
  pictureTranslateCard: boolean;
  pictureTranslateFormPayload?: unknown;
  imageGenerationCard: boolean;
  imageGenerationFormPayload?: unknown;
  batchTasksCard: boolean;
  batchTasksFormPayload?: BatchTasksFormPayload;
  taskProposal?: TaskProposalPayload;
};

function snapshotToFinishPayload(snapshot: Snapshot, aborted: boolean): ChatStreamFinishPayload {
  return {
    aborted,
    reply: snapshot.reply,
    thinkingContent: snapshot.thinkingContent || undefined,
    translationTaskForm: snapshot.translationTaskForm,
    attachments: snapshot.attachments,
    productImproveCard: snapshot.productImproveCard,
    productImproveCardPayload: snapshot.productImproveCardPayload,
    pictureTranslateCard: snapshot.pictureTranslateCard,
    pictureTranslateFormPayload: snapshot.pictureTranslateFormPayload,
    imageGenerationCard: snapshot.imageGenerationCard,
    imageGenerationFormPayload: snapshot.imageGenerationFormPayload,
    batchTasksCard: snapshot.batchTasksCard,
    batchTasksFormPayload: snapshot.batchTasksFormPayload,
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
  const [streamingTranslationForm, setStreamingTranslationForm] = useState<unknown>();
  const [streamingGenerateCard, setStreamingGenerateCard] = useState(false);
  const [streamingGeneratePayload, setStreamingGeneratePayload] = useState<unknown>();
  const [streamingPictureTranslateCard, setStreamingPictureTranslateCard] = useState(false);
  const [streamingPictureTranslatePayload, setStreamingPictureTranslatePayload] =
    useState<unknown>();
  const [streamingImageGenerationCard, setStreamingImageGenerationCard] = useState(false);
  const [streamingImageGenerationPayload, setStreamingImageGenerationPayload] =
    useState<unknown>();
  const [streamingBatchTasksCard, setStreamingBatchTasksCard] = useState(false);
  const [streamingBatchTasksPayload, setStreamingBatchTasksPayload] =
    useState<BatchTasksFormPayload | undefined>();
  const [streamingTaskProposal, setStreamingTaskProposal] =
    useState<TaskProposalPayload | undefined>();
  const [skillSteps, setSkillSteps] = useState<SkillStepProgress[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot>({
    reply: "",
    streamedText: "",
    thinkingContent: "",
    thinkingNotes: [],
    translationTaskForm: undefined,
    attachments: [],
    productImproveCard: false,
    productImproveCardPayload: undefined,
    pictureTranslateCard: false,
    pictureTranslateFormPayload: undefined,
    imageGenerationCard: false,
    imageGenerationFormPayload: undefined,
    batchTasksCard: false,
    batchTasksFormPayload: undefined,
    taskProposal: undefined,
  });

  const resetSnapshot = () => {
    snapshotRef.current = {
      reply: "",
      streamedText: "",
      thinkingContent: "",
      thinkingNotes: [],
      translationTaskForm: undefined,
      attachments: [],
      productImproveCard: false,
      productImproveCardPayload: undefined,
      pictureTranslateCard: false,
      pictureTranslateFormPayload: undefined,
      imageGenerationCard: false,
      imageGenerationFormPayload: undefined,
      batchTasksCard: false,
      batchTasksFormPayload: undefined,
      taskProposal: undefined,
    };
  };

  const resetStreamingUi = () => {
    setStreamingText("");
    setStreamingThinkingText("");
    setStreamingTranslationForm(undefined);
    setStreamingGenerateCard(false);
    setStreamingGeneratePayload(undefined);
    setStreamingPictureTranslateCard(false);
    setStreamingPictureTranslatePayload(undefined);
    setStreamingImageGenerationCard(false);
    setStreamingImageGenerationPayload(undefined);
    setStreamingBatchTasksCard(false);
    setStreamingBatchTasksPayload(undefined);
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
        onFinish?: (payload: ChatStreamFinishPayload) => void;
      },
    ) => {
      const url = options?.url ?? "/chat-stream";
      const onFinish = options?.onFinish;
      const fileIds = options?.fileIds ?? [];
      const workspaceBatchProducts = options?.workspaceBatchProducts ?? [];
      const preferBatchCard = shouldPreferBatchOverProductImprove(workspaceBatchProducts);

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
                  const merged = mergeTaskProposalTargets(proposal, workspaceBatchProducts);
                  snapshotRef.current.taskProposal = merged;
                  // 通用提案卡替代单商品/旧批量卡片
                  snapshotRef.current.productImproveCard = false;
                  snapshotRef.current.productImproveCardPayload = undefined;
                  snapshotRef.current.batchTasksCard = false;
                  snapshotRef.current.batchTasksFormPayload = undefined;
                  setStreamingGenerateCard(false);
                  setStreamingGeneratePayload(undefined);
                  setStreamingBatchTasksCard(false);
                  setStreamingBatchTasksPayload(undefined);
                  setStreamingTaskProposal(merged);
                  appendThinkingNote(`已生成任务确认卡片：${merged.title}`);
                }
              } else if (chunk.type === "skill_progress") {
                markFirstChunkSeen();
                const ev = chunk.event;
                appendThinkingNote(`${ev.label}: ${ev.status}`);
                setSkillSteps((prev) => {
                  const idx = prev.findIndex(
                    (s) => s.skill === ev.skill && s.stepId === ev.stepId,
                  );
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { ...ev };
                    return next;
                  }
                  return [...prev, { ...ev }];
                });
              } else if (chunk.type === "tool_call") {
                markFirstChunkSeen();
                appendThinkingNote(`Preparing ${chunk.name}`);
                if (chunk.name === "open_translation_task_form") {
                  const normalized = coerceTranslationTaskFormPayload(chunk.args);
                  snapshotRef.current.translationTaskForm = normalized;
                  setStreamingTranslationForm(normalized);
                } else if (chunk.name === "open_product_improve_form") {
                  if (preferBatchCard) break;
                  const normalized = coerceProductImproveFormPayload(chunk.args);
                  snapshotRef.current.productImproveCard = true;
                  snapshotRef.current.productImproveCardPayload = normalized;
                  setStreamingGenerateCard(true);
                  setStreamingGeneratePayload(normalized);
                } else if (chunk.name === "open_picture_translate_form") {
                  const normalized = coercePictureTranslateFormPayload(chunk.args);
                  snapshotRef.current.pictureTranslateCard = true;
                  snapshotRef.current.pictureTranslateFormPayload = normalized;
                  setStreamingPictureTranslateCard(true);
                  setStreamingPictureTranslatePayload(normalized);
                } else if (chunk.name === "open_image_generation_form") {
                  const normalized = coerceImageGenerationFormPayload(chunk.args);
                  snapshotRef.current.imageGenerationCard = true;
                  snapshotRef.current.imageGenerationFormPayload = normalized;
                  setStreamingImageGenerationCard(true);
                  setStreamingImageGenerationPayload(normalized);
                } else if (chunk.name === "open_batch_tasks_form") {
                  const normalized = enrichBatchPayload(
                    coerceBatchTasksFormPayload(chunk.args),
                    workspaceBatchProducts,
                  );
                  snapshotRef.current.batchTasksCard = true;
                  snapshotRef.current.batchTasksFormPayload = normalized;
                  snapshotRef.current.productImproveCard = false;
                  snapshotRef.current.productImproveCardPayload = undefined;
                  setStreamingGenerateCard(false);
                  setStreamingGeneratePayload(undefined);
                  setStreamingBatchTasksCard(true);
                  setStreamingBatchTasksPayload(normalized);
                }
              } else if (chunk.type === "tool_result") {
                markFirstChunkSeen();
                appendThinkingNote(`${chunk.name} returned a result`);
                if (chunk.name === "generate_product_description") {
                  const parsed = JSON.parse(chunk.result) as unknown;
                  snapshotRef.current.productImproveCard = true;
                  snapshotRef.current.productImproveCardPayload = parsed;
                  setStreamingGenerateCard(true);
                  setStreamingGeneratePayload(parsed);
                }
              } else if (chunk.type === "error") {
                markFirstChunkSeen();
                const msg = chunk.message;
                setStreamingText(msg);
                snapshotRef.current.reply = msg;
              } else if (chunk.type === "done") {
                markFirstChunkSeen();
                const reply =
                  chunk.metadata.finalReply?.trim() ||
                  snapshotRef.current.reply;
                snapshotRef.current.reply = reply;

                const ui = chunk.metadata.uiPayloads;
                if (ui?.translationTaskForm) {
                  const normalized = coerceTranslationTaskFormPayload(
                    ui.translationTaskForm,
                  );
                  snapshotRef.current.translationTaskForm = normalized;
                  setStreamingTranslationForm(normalized);
                }
                if (ui?.attachments) {
                  snapshotRef.current.attachments =
                    coerceChatMessageAttachments(ui.attachments);
                }
                if (ui?.taskProposal) {
                  const proposal = coerceTaskProposalPayload(ui.taskProposal);
                  if (proposal && !snapshotRef.current.taskProposal) {
                    const merged = mergeTaskProposalTargets(proposal, workspaceBatchProducts);
                    snapshotRef.current.taskProposal = merged;
                    snapshotRef.current.productImproveCard = false;
                    snapshotRef.current.productImproveCardPayload = undefined;
                    setStreamingGenerateCard(false);
                    setStreamingGeneratePayload(undefined);
                    setStreamingTaskProposal(merged);
                  }
                }
                if (
                  ui?.productImproveCardPayload &&
                  !preferBatchCard &&
                  !snapshotRef.current.taskProposal
                ) {
                  snapshotRef.current.productImproveCard = true;
                  snapshotRef.current.productImproveCardPayload =
                    ui.productImproveCardPayload;
                  setStreamingGenerateCard(true);
                  setStreamingGeneratePayload(ui.productImproveCardPayload);
                }
                if (ui?.pictureTranslateCard) {
                  const normalized = coercePictureTranslateFormPayload(
                    ui.pictureTranslateCard,
                  );
                  snapshotRef.current.pictureTranslateCard = true;
                  snapshotRef.current.pictureTranslateFormPayload = normalized;
                  setStreamingPictureTranslateCard(true);
                  setStreamingPictureTranslatePayload(normalized);
                }
                if (ui?.imageGenerationCard) {
                  const normalized = coerceImageGenerationFormPayload(
                    ui.imageGenerationCard,
                  );
                  snapshotRef.current.imageGenerationCard = true;
                  snapshotRef.current.imageGenerationFormPayload = normalized;
                  setStreamingImageGenerationCard(true);
                  setStreamingImageGenerationPayload(normalized);
                }
                if (ui?.batchTasksCard) {
                  const normalized = enrichBatchPayload(
                    coerceBatchTasksFormPayload(ui.batchTasksCard),
                    workspaceBatchProducts,
                  );
                  snapshotRef.current.batchTasksCard = true;
                  snapshotRef.current.batchTasksFormPayload = normalized;
                  if (preferBatchCard) {
                    snapshotRef.current.productImproveCard = false;
                    snapshotRef.current.productImproveCardPayload = undefined;
                    setStreamingGenerateCard(false);
                    setStreamingGeneratePayload(undefined);
                  }
                  setStreamingBatchTasksCard(true);
                  setStreamingBatchTasksPayload(normalized);
                } else if (
                  preferBatchCard &&
                  workspaceBatchProducts.length >= 2 &&
                  !snapshotRef.current.taskProposal
                ) {
                  // 工作台已选 ≥2 个商品但服务端未发卡片：客户端兜底合成通用提案卡
                  const proposal = buildBatchProductImproveProposal({
                    products: workspaceBatchProducts,
                  });
                  snapshotRef.current.taskProposal = proposal;
                  snapshotRef.current.productImproveCard = false;
                  snapshotRef.current.productImproveCardPayload = undefined;
                  setStreamingGenerateCard(false);
                  setStreamingGeneratePayload(undefined);
                  setStreamingTaskProposal(proposal);
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
    streamingTranslationForm,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingPictureTranslateCard,
    streamingPictureTranslatePayload,
    streamingImageGenerationCard,
    streamingImageGenerationPayload,
    streamingBatchTasksCard,
    streamingBatchTasksPayload,
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
