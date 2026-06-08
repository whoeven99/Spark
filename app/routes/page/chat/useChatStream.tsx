import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage, ChatMessageAttachment } from "../../../lib/chatMessage";
import { coerceChatMessageAttachments } from "../../../lib/chatMessage";
import { coerceTranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
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
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "skill_progress"; event: SkillProgressEvent }
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
          attachments?: unknown;
        };
      };
    };

export type ChatStreamFinishPayload = {
  aborted: boolean;
  reply: string;
  translationTaskForm?: unknown;
  attachments?: ChatMessageAttachment[];
  productImproveCard?: boolean;
  productImproveCardPayload?: unknown;
  httpStatus?: number;
};

type Snapshot = {
  reply: string;
  streamedText: string;
  translationTaskForm?: unknown;
  attachments: ChatMessageAttachment[];
  productImproveCard: boolean;
  productImproveCardPayload?: unknown;
};

/** @deprecated 兼容旧名，等价于 SkillStepProgress */
export type PlaybookStepProgress = SkillStepProgress;

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTranslationForm, setStreamingTranslationForm] = useState<unknown>();
  const [streamingGenerateCard, setStreamingGenerateCard] = useState(false);
  const [streamingGeneratePayload, setStreamingGeneratePayload] = useState<unknown>();
  const [skillSteps, setSkillSteps] = useState<SkillStepProgress[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot>({
    reply: "",
    streamedText: "",
    translationTaskForm: undefined,
    attachments: [],
    productImproveCard: false,
    productImproveCardPayload: undefined,
  });

  const resetSnapshot = () => {
    snapshotRef.current = {
      reply: "",
      streamedText: "",
      translationTaskForm: undefined,
      attachments: [],
      productImproveCard: false,
      productImproveCardPayload: undefined,
    };
  };

  const prepareStreaming = useCallback(() => {
    flushSync(() => {
      setIsStreaming(true);
      setAwaitingFirstChunk(true);
      resetSnapshot();
      setStreamingText("");
      setStreamingTranslationForm(undefined);
      setStreamingGenerateCard(false);
      setStreamingGeneratePayload(undefined);
      setSkillSteps([]);
    });
  }, []);

  const sendMessage = useCallback(
    async (
      messages: ChatMessage[],
      options?: {
        url?: string;
        onFinish?: (payload: ChatStreamFinishPayload) => void;
      },
    ) => {
      const url = options?.url ?? "/chat-stream";
      const onFinish = options?.onFinish;

      prepareStreaming();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let finalized = false;
      const finalizeOnce = (payload: ChatStreamFinishPayload) => {
        if (finalized) return;
        finalized = true;
        setIsStreaming(false);
        setAwaitingFirstChunk(false);
        setStreamingText("");
        setStreamingTranslationForm(undefined);
        setStreamingGenerateCard(false);
        setStreamingGeneratePayload(undefined);
        setSkillSteps([]);
        onFinish?.(payload);
      };

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
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

              if (chunk.type === "text") {
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
                }
              } else if (chunk.type === "skill_progress") {
                markFirstChunkSeen();
                const ev = chunk.event;
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
                if (chunk.name === "open_translation_task_form") {
                  const normalized = coerceTranslationTaskFormPayload(chunk.args);
                  snapshotRef.current.translationTaskForm = normalized;
                  setStreamingTranslationForm(normalized);
                }
              } else if (chunk.type === "tool_result") {
                markFirstChunkSeen();
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
                if (ui?.productImproveCardPayload) {
                  snapshotRef.current.productImproveCard = true;
                  snapshotRef.current.productImproveCardPayload =
                    ui.productImproveCardPayload;
                  setStreamingGenerateCard(true);
                  setStreamingGeneratePayload(ui.productImproveCardPayload);
                }

                const finishPayload: ChatStreamFinishPayload = {
                  aborted: false,
                  reply,
                  translationTaskForm: snapshotRef.current.translationTaskForm,
                  attachments: snapshotRef.current.attachments,
                  productImproveCard: snapshotRef.current.productImproveCard,
                  productImproveCardPayload:
                    snapshotRef.current.productImproveCardPayload,
                };

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
          finalizeOnce({
            aborted: false,
            reply: snapshotRef.current.reply,
            translationTaskForm: snapshotRef.current.translationTaskForm,
            attachments: snapshotRef.current.attachments,
            productImproveCard: snapshotRef.current.productImproveCard,
            productImproveCardPayload:
              snapshotRef.current.productImproveCardPayload,
          });
        }
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (aborted) {
          finalizeOnce({
            aborted: true,
            reply: snapshotRef.current.reply,
            translationTaskForm: snapshotRef.current.translationTaskForm,
            attachments: snapshotRef.current.attachments,
            productImproveCard: snapshotRef.current.productImproveCard,
            productImproveCardPayload:
              snapshotRef.current.productImproveCardPayload,
          });
        } else {
          console.error("Stream error", e);
          const fallback = "抱歉，服务暂时不可用，请稍后重试。";
          setStreamingText(fallback);
          snapshotRef.current.reply = fallback;
          finalizeOnce({
            aborted: false,
            reply: fallback,
            translationTaskForm: snapshotRef.current.translationTaskForm,
            attachments: snapshotRef.current.attachments,
            productImproveCard: snapshotRef.current.productImproveCard,
            productImproveCardPayload:
              snapshotRef.current.productImproveCardPayload,
          });
        }
      } finally {
        abortControllerRef.current = null;
        if (!finalized) {
          finalizeOnce({
            aborted: controller.signal.aborted,
            reply: snapshotRef.current.reply,
            translationTaskForm: snapshotRef.current.translationTaskForm,
            attachments: snapshotRef.current.attachments,
            productImproveCard: snapshotRef.current.productImproveCard,
            productImproveCardPayload:
              snapshotRef.current.productImproveCardPayload,
          });
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
    skillSteps,
    /** @deprecated 兼容旧名 */
    playbookSteps: skillSteps,
    prepareStreaming,
    sendMessage,
    abort,
  };
}
