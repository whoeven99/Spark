import type { CSSProperties } from "react";
import type { ChatMessage } from "../../../lib/chatMessage";
import { ChatMessageContent } from "./ChatMessageContent";
import { GenerateDescriptionChatCard } from "./GenerateDescriptionChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";

type ChatMessagesProps = {
  messages: ChatMessage[];
  onTranslationCardSuccess: (
    messageIndex: number,
    detail: { jobId?: string; message: string },
  ) => void;
};

export function ChatMessages({
  messages,
  onTranslationCardSuccess,
}: ChatMessagesProps) {
  return (
    <s-stack direction="block" gap="base">
      {messages.map((item, index) => {
        const hasTranslationCard =
          item.role === "assistant" && Boolean(item.translationTaskForm);
        const hasGenerateDescriptionCard =
          item.role === "assistant" && Boolean(item.generateDescriptionCard);
        const hasEmbeddedCard = hasTranslationCard || hasGenerateDescriptionCard;

        const bubbleShellStyle: CSSProperties = {
          borderRadius: "12px",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor:
            item.role === "assistant"
              ? "rgba(44, 110, 203, 0.35)"
              : "rgba(0, 128, 96, 0.35)",
          background:
            item.role === "assistant"
              ? "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))"
              : "linear-gradient(180deg, rgba(0, 128, 96, 0.08), rgba(0, 128, 96, 0.02))",
        };

        return (
          <div
            key={`${item.role}-${index}`}
            style={{
              display: "flex",
              justifyContent:
                item.role === "assistant" ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                maxWidth: hasEmbeddedCard ? "min(540px, 96%)" : "80%",
              }}
            >
              <div style={bubbleShellStyle}>
                <s-box padding="base" borderRadius="base" background="transparent">
                  <div style={{ marginBottom: "0.25rem" }}>
                    <s-badge tone={item.role === "assistant" ? "neutral" : "success"}>
                      {item.role === "assistant" ? "AI Assistant" : "你"}
                    </s-badge>
                  </div>
                  <div style={{ marginTop: "0.35rem" }}>
                    {item.role === "assistant" ? (
                      <ChatMessageContent content={item.content} />
                    ) : (
                      <span style={{ whiteSpace: "pre-wrap" }}>{item.content}</span>
                    )}
                  </div>

                  {hasTranslationCard && item.translationTaskForm ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <TranslationTaskChatCard
                        embedded
                        initialPayload={item.translationTaskForm}
                        onSuccess={(detail) =>
                          onTranslationCardSuccess(index, detail)
                        }
                      />
                    </div>
                  ) : null}

                  {hasGenerateDescriptionCard ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <GenerateDescriptionChatCard embedded />
                    </div>
                  ) : null}
                </s-box>
              </div>
            </div>
          </div>
        );
      })}
    </s-stack>
  );
}
