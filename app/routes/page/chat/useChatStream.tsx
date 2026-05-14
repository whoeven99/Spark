import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "../../../lib/chatMessage";

type StreamChunk =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "error"; message: string }
  | { type: "done"; metadata: { totalTokens: number; model: string } };

export function useChatStream() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentTranslationForm, setCurrentTranslationForm] = useState<unknown>();
  const [currentGenerateCard, setCurrentGenerateCard] = useState<unknown>();
  const [currentGeneratePayload, setCurrentGeneratePayload] = useState<unknown>();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (
      messages: ChatMessage[],
      onChunk?: (chunk: StreamChunk) => void,
      onComplete?: (data: { reply: string; translationTaskForm?: unknown; generateDescriptionCard?: boolean; generateDescriptionCardPayload?: unknown }) => void,
    ) => {
      setIsLoading(true);
      setCurrentMessage("");
      setCurrentTranslationForm(undefined);
      setCurrentGenerateCard(undefined);
      setCurrentGeneratePayload(undefined);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch("/chat-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const chunk: StreamChunk = JSON.parse(line.slice(6));
                
                onChunk?.(chunk);

                if (chunk.type === "text") {
                  setCurrentMessage((prev) => prev + chunk.content);
                } else if (chunk.type === "tool_call") {
                  if (chunk.name === "open_translation_task_form") {
                    setCurrentTranslationForm(chunk.args);
                  }
                } else if (chunk.type === "tool_result") {
                  if (chunk.name === "generate_product_description") {
                    setCurrentGenerateCard(true);
                    setCurrentGeneratePayload(JSON.parse(chunk.result));
                  }
                } else if (chunk.type === "done") {
                  onComplete?.({
                    reply: currentMessage,
                    translationTaskForm: currentTranslationForm,
                    generateDescriptionCard: currentGenerateCard,
                    generateDescriptionCardPayload: currentGeneratePayload,
                  });
                }
              } catch (e) {
                console.error("Failed to parse chunk", e);
              }
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          console.log("Request aborted");
        } else {
          console.error("Stream error", e);
          setCurrentMessage("抱歉，服务暂时不可用，请稍后重试。");
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [currentMessage, currentTranslationForm, currentGenerateCard, currentGeneratePayload],
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    isLoading,
    currentMessage,
    currentTranslationForm,
    currentGenerateCard,
    currentGeneratePayload,
    sendMessage,
    abort,
  };
}
