import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../../../lib/chatMessage";

type StreamChunk =
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
      };
    };

export type ChatStreamFinishPayload = {
  aborted: boolean;
  reply: string;
  translationTaskForm?: unknown;
  generateDescriptionCard?: boolean;
  generateDescriptionCardPayload?: unknown;
  httpStatus?: number;
};

type Snapshot = {
  reply: string;
  translationTaskForm?: unknown;
  generateDescriptionCard: boolean;
  generateDescriptionCardPayload?: unknown;
};

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTranslationForm, setStreamingTranslationForm] = useState<unknown>();
  const [streamingGenerateCard, setStreamingGenerateCard] = useState(false);
  const [streamingGeneratePayload, setStreamingGeneratePayload] = useState<unknown>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const snapshotRef = useRef<Snapshot>({
    reply: "",
    translationTaskForm: undefined,
    generateDescriptionCard: false,
    generateDescriptionCardPayload: undefined,
  });

  const resetSnapshot = () => {
    snapshotRef.current = {
      reply: "",
      translationTaskForm: undefined,
      generateDescriptionCard: false,
      generateDescriptionCardPayload: undefined,
    };
  };

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

      setIsStreaming(true);
      setAwaitingFirstChunk(true);
      resetSnapshot();
      setStreamingText("");
      setStreamingTranslationForm(undefined);
      setStreamingGenerateCard(false);
      setStreamingGeneratePayload(undefined);

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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

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
                  snapshotRef.current.reply = next;
                  return next;
                });
              } else if (chunk.type === "tool_call") {
                markFirstChunkSeen();
                if (chunk.name === "open_translation_task_form") {
                  snapshotRef.current.translationTaskForm = chunk.args;
                  setStreamingTranslationForm(chunk.args);
                }
              } else if (chunk.type === "tool_result") {
                markFirstChunkSeen();
                if (chunk.name === "generate_product_description") {
                  const parsed = JSON.parse(chunk.result) as unknown;
                  snapshotRef.current.generateDescriptionCard = true;
                  snapshotRef.current.generateDescriptionCardPayload = parsed;
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
                finalizeOnce({
                  aborted: false,
                  reply,
                  translationTaskForm: snapshotRef.current.translationTaskForm,
                  generateDescriptionCard: snapshotRef.current.generateDescriptionCard,
                  generateDescriptionCardPayload:
                    snapshotRef.current.generateDescriptionCardPayload,
                });
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
            generateDescriptionCard: snapshotRef.current.generateDescriptionCard,
            generateDescriptionCardPayload:
              snapshotRef.current.generateDescriptionCardPayload,
          });
        }
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (aborted) {
          finalizeOnce({
            aborted: true,
            reply: snapshotRef.current.reply,
            translationTaskForm: snapshotRef.current.translationTaskForm,
            generateDescriptionCard: snapshotRef.current.generateDescriptionCard,
            generateDescriptionCardPayload:
              snapshotRef.current.generateDescriptionCardPayload,
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
            generateDescriptionCard: snapshotRef.current.generateDescriptionCard,
            generateDescriptionCardPayload:
              snapshotRef.current.generateDescriptionCardPayload,
          });
        }
      } finally {
        abortControllerRef.current = null;
        if (!finalized) {
          finalizeOnce({
            aborted: controller.signal.aborted,
            reply: snapshotRef.current.reply,
            translationTaskForm: snapshotRef.current.translationTaskForm,
            generateDescriptionCard: snapshotRef.current.generateDescriptionCard,
            generateDescriptionCardPayload:
              snapshotRef.current.generateDescriptionCardPayload,
          });
        }
      }
    },
    [],
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
    sendMessage,
    abort,
  };
}
