import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "../../../lib/chatMessage";
import { ChatMessageContent } from "./ChatMessageContent";
import { ProductImproveChatCard } from "./ProductImproveChatCard";
import { PictureTranslateChatCard } from "./PictureTranslateChatCard";
import { TranslationTaskChatCard } from "../translation/TranslationTaskChatCard";

type ChatMessagesProps = {
  messages: ChatMessage[];
  onTranslationCardSuccess: (
    messageIndex: number,
    detail: { jobId?: string; message: string },
  ) => void;
  onPictureTranslateCardSuccess: (
    messageIndex: number,
    detail: { translatedImage: string; message: string },
  ) => void;
};

export function ChatMessages({
  messages,
  onTranslationCardSuccess,
  onPictureTranslateCardSuccess,
}: ChatMessagesProps) {
  const { t } = useTranslation();
  return (
    <s-stack direction="block" gap="base">
      {messages.map((item, index) => {
        const hasTranslationCard =
          item.role === "assistant" && Boolean(item.translationTaskForm);
        const hasGenerateDescriptionCard =
          item.role === "assistant" && Boolean(item.productImproveCard);
        const hasPictureTranslateCard =
          item.role === "assistant" && Boolean(item.pictureTranslateCard);
        const imageAttachments =
          item.role === "assistant"
            ? item.attachments?.filter((attachment) => attachment.type === "image") ?? []
            : [];
        const hasImageAttachments = imageAttachments.length > 0;
        const hasEmbeddedCard =
          hasTranslationCard ||
          hasGenerateDescriptionCard ||
          hasPictureTranslateCard ||
          hasImageAttachments;

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

                  {hasImageAttachments ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <s-stack direction="block" gap="small">
                        {imageAttachments.map((attachment, attachmentIndex) => (
                          <div
                            key={`${attachment.url}-${attachmentIndex}`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.45rem",
                            }}
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.alt ?? t("pictureTranslate.translatedImageAlt")}
                              loading="lazy"
                              style={{
                                display: "block",
                                maxWidth: "100%",
                                maxHeight: "520px",
                                objectFit: "contain",
                                borderRadius: "10px",
                                border: "1px solid rgba(44, 110, 203, 0.18)",
                              }}
                            />
                            <a
                              href={attachment.url}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: "0.875rem" }}
                            >
                              {t("pictureTranslate.downloadImage")}
                            </a>
                          </div>
                        ))}
                      </s-stack>
                    </div>
                  ) : null}

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
                      <ProductImproveChatCard
                        embedded
                        initialResult={item.productImproveCardPayload}
                      />
                    </div>
                  ) : null}

                  {hasPictureTranslateCard ? (
                    <div style={{ marginTop: "0.85rem" }}>
                      <PictureTranslateChatCard
                        embedded
                        onSuccess={(detail) =>
                          onPictureTranslateCardSuccess(index, detail)
                        }
                      />
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
