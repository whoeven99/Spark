import type { CSSProperties } from "react";
import { useState, useRef, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  ChatMessage,
  ChatMessageAttachment,
  GenerateDescriptionCardPayload,
} from "../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { ChatMessages } from "../component/chat/ChatMessages";
import { ChatMessageContent } from "../component/chat/ChatMessageContent";
import { ChatStreamingSkeleton } from "../component/chat/ChatStreamingSkeleton";
import { ChatInput } from "../component/chat/ChatInput";
import { ChatPageCredentialsChrome } from "./chat/ChatPageCredentialsChrome";
import {
  buildInitialAssistantMessage,
  buildQuickPrompts,
  quickPromptTones,
} from "./chat/chatPageConstants";
import { useChatStream } from "./chat/useChatStream";
import { pageIntroBannerStyle, PageSurface } from "./pageUiStyles";

const streamingAssistantBubbleShellStyle: CSSProperties = {
  borderRadius: "12px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "rgba(44, 110, 203, 0.35)",
  background:
    "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))",
};

export function ChatPage() {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const firstMessage = buildInitialAssistantMessage(t);
  const quickPrompts = buildQuickPrompts(t);
  const generateDescriptionQuickPrompt = t("chat.quickPromptGenerateDescription");
  const createTranslationQuickPrompt = t("chat.quickPromptCreateTranslation");
  const pictureTranslateQuickPrompt = t("chat.quickPromptPictureTranslate");
  const {
    isStreaming,
    awaitingFirstChunk,
    streamingText,
    sendMessage: streamConversation,
    abort: abortStream,
  } = useChatStream();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: "assistant",
      content: firstMessage,
    },
  ]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /** 忽略重置会话或中止后延迟抵达的流式 onFinish，避免把旧回复拼回列表 */
  const replyEpochRef = useRef(0);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.role === "assistant") {
        return [{ role: "assistant", content: buildInitialAssistantMessage(t) }];
      }
      return prev;
    });
  }, [i18n.language, t]);

  const openTranslationTaskCard = () => {
    if (isStreaming) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: createTranslationQuickPrompt },
      {
        role: "assistant",
        content: t("chat.assistantOpenTranslationCard"),
        translationTaskForm: coerceTranslationTaskFormPayload({}),
      },
    ]);
  };

  const openGenerateDescriptionCard = () => {
    if (isStreaming) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: generateDescriptionQuickPrompt },
      {
        role: "assistant",
        content: t("chat.assistantOpenGenerateCard"),
        generateDescriptionCard: true,
      },
    ]);
  };

  const openPictureTranslateCard = () => {
    if (isStreaming) return;
    console.info("[PictureTranslateButton] click open picture translate card");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: pictureTranslateQuickPrompt },
      {
        role: "assistant",
        content: t("chat.assistantOpenPictureTranslateCard"),
        pictureTranslateCard: true,
      },
    ]);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 0);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, awaitingFirstChunk, streamingText]);

  const sendMessage = async (content: string) => {
    if (isStreaming) return;
    replyEpochRef.current += 1;
    const epoch = replyEpochRef.current;
    setMessages((prev) => [...prev, { role: "user", content }]);

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const apiMessages = [...messages, { role: "user" as const, content }].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      await streamConversation(apiMessages, {
        url: `/chat-stream${authQuery}`,
        onFinish: (p) => {
          if (epoch !== replyEpochRef.current) return;
          const assistantText =
            p.httpStatus !== undefined
              ? t("chat.requestFailed", { status: p.httpStatus })
              : p.aborted && !p.reply.trim()
                ? t("chat.streamAbortedEmpty")
                : p.reply.trim() || t("chat.invalidReply");

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: assistantText,
              ...(p.attachments?.length
                ? { attachments: p.attachments as ChatMessageAttachment[] }
                : {}),
              ...(p.translationTaskForm
                ? { translationTaskForm: p.translationTaskForm as TranslationTaskFormPayload }
                : {}),
              ...(p.generateDescriptionCard ? { generateDescriptionCard: true } : {}),
              ...(p.generateDescriptionCardPayload
                ? {
                    generateDescriptionCardPayload:
                      p.generateDescriptionCardPayload as GenerateDescriptionCardPayload,
                  }
                : {}),
            },
          ]);

          if (p.aborted) {
            shopify.toast.show(t("chat.streamAborted"));
          }
        },
      });
    } catch {
      shopify.toast.show(t("chat.sendFailed"));
    }
  };

  const succeedTranslationCard = (
    messageIndex: number,
    detail: { jobId?: string; message: string },
  ) => {
    shopify.toast.show(detail.message || t("chat.translationCreateSuccess"));
    setMessages((prev) => {
      const next = prev.map((m, i): ChatMessage =>
        i === messageIndex && m.role === "assistant"
          ? { role: "assistant", content: m.content }
          : m,
      );
      next.push({
        role: "assistant",
        content: detail.jobId
          ? t("chat.translationSubmittedWithId", { jobId: detail.jobId })
          : t("chat.translationSubmitted"),
      });
      return next;
    });
  };

  const succeedPictureTranslateCard = (
    messageIndex: number,
    detail: { translatedImage: string; message: string },
  ) => {
    shopify.toast.show(detail.message);
    setMessages((prev) => {
      const next = prev.map((m, i): ChatMessage => {
        if (i !== messageIndex || m.role !== "assistant") return m;
        return {
          role: "assistant",
          content: m.content,
        };
      });
      next.push({
        role: "assistant",
        content: t("chat.pictureTranslateCompleted"),
        attachments: [
          {
            type: "image",
            url: detail.translatedImage,
            alt: t("pictureTranslate.translatedImageAlt"),
          },
        ],
      });
      return next;
    });
  };

  return (
    <s-page heading={t("chat.pageTitle")}>
      <s-section heading={t("chat.sectionTitle")}>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-badge tone="success">{t("chat.assistantOnline")}</s-badge>
            <s-button
            type="button"
            variant="secondary"
            onClick={() => {
              replyEpochRef.current += 1;
              abortStream();
              setMessages([{ role: "assistant", content: firstMessage }]);
              shopify.toast.show(t("chat.newChatStarted"));
            }}
          >
            {t("common.newChat")}
          </s-button>
          </s-stack>
          <div style={pageIntroBannerStyle("chat", { marginBottom: "0" })}>
            {t("chat.intro")}
          </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100dvh - 140px)",
            minHeight: "calc(100dvh - 140px)",
            gap: "0.75rem",
          }}
        >
          <s-box padding="small" borderWidth="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="none">
              <s-paragraph>{t("chat.quickQuestions")}</s-paragraph>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.25rem" }}>
                {quickPrompts.map((prompt, index) => (
                  <s-button
                    key={prompt}
                    type="button"
                    tone={quickPromptTones[index]}
                    variant="secondary"
                    onClick={() => {
                      if (prompt === generateDescriptionQuickPrompt) {
                        openGenerateDescriptionCard();
                      } else if (prompt === createTranslationQuickPrompt) {
                        openTranslationTaskCard();
                      } else if (prompt === pictureTranslateQuickPrompt) {
                        openPictureTranslateCard();
                      } else {
                        sendMessage(prompt);
                      }
                    }}
                    {...(isStreaming ? { disabled: true } : {})}
                  >
                    {prompt}
                  </s-button>
                ))}
              </div>
            </s-stack>
          </s-box>

          <div style={{ flex: 1, minHeight: 0 }}>
            <div ref={messagesContainerRef} style={{ height: "100%", overflowY: "auto" }}>
              <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                <ChatMessages
                  messages={messages}
                  onTranslationCardSuccess={succeedTranslationCard}
                  onPictureTranslateCardSuccess={succeedPictureTranslateCard}
                />
                {isStreaming ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-start",
                      marginTop: "1rem",
                    }}
                  >
                    <div style={{ maxWidth: "80%" }}>
                      <div style={streamingAssistantBubbleShellStyle}>
                        <s-box padding="base" borderRadius="base" background="transparent">
                          <div style={{ marginBottom: "0.25rem" }}>
                            <s-badge tone="neutral">AI Assistant</s-badge>
                          </div>
                          <div style={{ marginTop: "0.35rem", minHeight: awaitingFirstChunk ? "3rem" : undefined }}>
                            {awaitingFirstChunk ? (
                              <ChatStreamingSkeleton />
                            ) : (
                              <ChatMessageContent content={streamingText} />
                            )}
                          </div>
                        </s-box>
                      </div>
                    </div>
                  </div>
                ) : null}
              </s-box>
            </div>
          </div>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <ChatInput onMessageSend={sendMessage} isSending={isStreaming} onAbort={abortStream} />
          </s-box>
        </div>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading={t("chat.tipsTitle")}>
        <PageSurface>
          <s-unordered-list>
            <s-list-item>{t("chat.tipSingleQuestion")}</s-list-item>
            <s-list-item>{t("chat.tipScenario")}</s-list-item>
            <s-list-item>{t("chat.tipAction")}</s-list-item>
            <s-list-item>
              {t("chat.tipNewChat")}
            </s-list-item>
          </s-unordered-list>
        </PageSurface>
      </s-section>

      <ChatPageCredentialsChrome shopify={shopify} />
    </s-page>
  );
}
