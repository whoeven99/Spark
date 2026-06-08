import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  ChatMessage,
  ChatMessageAttachment,
  ProductImproveCardPayload,
} from "../../lib/chatMessage";
import type { ImageGenerationFormPayload } from "../../lib/imageGenerationFormPayload";
import type { PictureTranslateFormPayload } from "../../lib/pictureTranslateFormPayload";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { coerceTranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { ChatMessages } from "../component/chat/ChatMessages";
import { StreamingAssistantReply } from "../component/chat/StreamingAssistantReply";
import { ChatInput } from "../component/chat/ChatInput";
import { LanguageSelector } from "../component/common/LanguageSelector";
import { ChatPageCredentialsChrome } from "./chat/ChatPageCredentialsChrome";
import {
  buildInitialAssistantMessage,
  buildQuickPrompts,
  quickPromptTones,
} from "./chat/chatPageConstants";
import { useChatStream } from "./chat/useChatStream";
import {
  pageCompactSurfaceStyle,
  pageColorTokens,
  pageIntroBannerStyle,
  pageSurfaceStyle,
  PageSurface,
} from "./pageUiStyles";

/** App Bridge 顶栏 + 主栏底部语言条预留高度 */
const CHAT_PAGE_VIEWPORT_OFFSET_PX = 152;

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
    streamingText,
    streamingThinkingText,
    streamingTranslationForm,
    streamingGenerateCard,
    streamingGeneratePayload,
    streamingPictureTranslateCard,
    streamingPictureTranslatePayload,
    streamingImageGenerationCard,
    streamingImageGenerationPayload,
    sendMessage: streamConversation,
    prepareStreaming,
    abort: abortStream,
    skillSteps,
  } = useChatStream();
  const [awaitingAssistantReply, setAwaitingAssistantReply] = useState(false);
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
        productImproveCard: true,
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
    const run = () => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
  };

  useLayoutEffect(() => {
    scrollToBottom();
  }, [
    messages,
    isStreaming,
    awaitingAssistantReply,
    streamingText,
    streamingThinkingText,
    skillSteps.length,
    streamingTranslationForm,
    streamingGenerateCard,
    streamingPictureTranslateCard,
    streamingImageGenerationCard,
  ]);

  const sendMessage = async (content: string) => {
    if (isStreaming || awaitingAssistantReply) return;
    replyEpochRef.current += 1;
    const epoch = replyEpochRef.current;
    setMessages((prev) => [...prev, { role: "user", content }]);
    flushSync(() => {
      setAwaitingAssistantReply(true);
    });
    prepareStreaming();

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
          setAwaitingAssistantReply(false);
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
              ...(p.productImproveCard ? { productImproveCard: true } : {}),
              ...(p.productImproveCardPayload
                ? {
                    productImproveCardPayload:
                      p.productImproveCardPayload as ProductImproveCardPayload,
                  }
                : {}),
              ...(p.pictureTranslateCard ? { pictureTranslateCard: true } : {}),
              ...(p.pictureTranslateFormPayload
                ? {
                    pictureTranslateFormPayload:
                      p.pictureTranslateFormPayload as PictureTranslateFormPayload,
                  }
                : {}),
              ...(p.imageGenerationCard ? { imageGenerationCard: true } : {}),
              ...(p.imageGenerationFormPayload
                ? {
                    imageGenerationFormPayload:
                      p.imageGenerationFormPayload as ImageGenerationFormPayload,
                  }
                : {}),
              ...(p.thinkingContent ? { thinkingContent: p.thinkingContent } : {}),
            },
          ]);

          if (p.aborted) {
            shopify.toast.show(t("chat.streamAborted"));
          }
        },
      });
    } catch {
      setAwaitingAssistantReply(false);
      shopify.toast.show(t("chat.sendFailed"));
    }
  };

  const succeedTranslationCard = (
    messageIndex: number,
    detail: { jobId?: string; jobIds?: string[]; message: string },
  ) => {
    shopify.toast.show(detail.message || t("chat.translationCreateSuccess"));
    const ids = detail.jobIds ?? (detail.jobId ? [detail.jobId] : []);
    setMessages((prev) => {
      const next = prev.map((m, i): ChatMessage =>
        i === messageIndex && m.role === "assistant"
          ? { role: "assistant", content: m.content }
          : m,
      );
      next.push({
        role: "assistant",
        content:
          ids.length > 1
            ? detail.message
            : ids.length === 1
              ? t("chat.translationSubmittedWithId", { jobId: ids[0] })
              : t("chat.translationSubmitted"),
      });
      return next;
    });
  };

  const succeedPictureTranslateCard = (
    _messageIndex: number,
    _detail: { taskId: string; batchId: string },
  ) => {
    shopify.toast.show(t("pictureTranslate.submitSuccess"));
  };

  const succeedImageGenerationCard = (
    _messageIndex: number,
    _detail: { taskId: string; batchId: string },
  ) => {
    shopify.toast.show(t("imageGeneration.submitSuccess"));
  };

  const showStreamingReply = isStreaming || awaitingAssistantReply;

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
              setAwaitingAssistantReply(false);
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
            height: `calc(100dvh - ${CHAT_PAGE_VIEWPORT_OFFSET_PX}px)`,
            minHeight: `calc(100dvh - ${CHAT_PAGE_VIEWPORT_OFFSET_PX}px)`,
            gap: "0.75rem",
          }}
        >
          <div style={pageCompactSurfaceStyle}>
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
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <div ref={messagesContainerRef} style={{ height: "100%", overflowY: "auto" }}>
              <div style={pageSurfaceStyle}>
                <ChatMessages
                  messages={messages}
                  streamingSlot={
                    <StreamingAssistantReply
                      active={showStreamingReply}
                      isStreaming={isStreaming}
                      streamingText={streamingText}
                      streamingThinkingText={streamingThinkingText}
                      skillSteps={skillSteps}
                      streamingTranslationForm={streamingTranslationForm}
                      streamingGenerateCard={streamingGenerateCard}
                      streamingGeneratePayload={streamingGeneratePayload}
                      streamingPictureTranslateCard={streamingPictureTranslateCard}
                      streamingPictureTranslatePayload={streamingPictureTranslatePayload}
                      streamingImageGenerationCard={streamingImageGenerationCard}
                      streamingImageGenerationPayload={streamingImageGenerationPayload}
                    />
                  }
                  onTranslationCardSuccess={succeedTranslationCard}
                  onPictureTranslateCardSuccess={succeedPictureTranslateCard}
                  onImageGenerationCardSuccess={succeedImageGenerationCard}
                />
              </div>
            </div>
          </div>

          <div style={pageSurfaceStyle}>
            <ChatInput onMessageSend={sendMessage} isSending={isStreaming} onAbort={abortStream} />
          </div>

          <LanguageSelector />
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
