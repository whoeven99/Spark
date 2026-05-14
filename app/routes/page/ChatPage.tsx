import { useState, useRef, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, GenerateDescriptionCardPayload } from "../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { ChatMessages } from "../component/chat/ChatMessages";
import { ChatInput } from "../component/chat/ChatInput";
import { ChatPageCredentialsChrome } from "./chat/ChatPageCredentialsChrome";
import {
  buildInitialAssistantMessage,
  buildQuickPrompts,
  quickPromptTones,
} from "./chat/chatPageConstants";
import { asideCardStyle } from "./chat/chatPageStyles";

export function ChatPage() {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const firstMessage = buildInitialAssistantMessage(t);
  const quickPrompts = buildQuickPrompts(t);
  const generateDescriptionQuickPrompt = t("chat.quickPromptGenerateDescription");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: "assistant",
      content: firstMessage,
    },
  ]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.role === "assistant") {
        return [{ role: "assistant", content: buildInitialAssistantMessage(t) }];
      }
      return prev;
    });
  }, [i18n.language, t]);

  const openGenerateDescriptionCard = () => {
    if (isSending) return;
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
  }, [messages, isSending]);

  const sendMessage = async (content: string) => {
    if (isSending) return;
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsSending(true);

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const apiMessages = [...messages, { role: "user" as const, content }].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const response = await fetch(`/chat${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
        translationTaskForm?: TranslationTaskFormPayload;
        generateDescriptionCard?: boolean;
        generateDescriptionCardPayload?: GenerateDescriptionCardPayload;
      };
      const assistantText =
        data.reply?.trim() ||
        data.error?.trim() ||
        (!response.ok
          ? t("chat.requestFailed", { status: response.status })
          : t("chat.invalidReply"));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantText,
          ...(data.translationTaskForm ? { translationTaskForm: data.translationTaskForm } : {}),
          ...(data.generateDescriptionCard ? { generateDescriptionCard: true } : {}),
          ...(data.generateDescriptionCardPayload
            ? { generateDescriptionCardPayload: data.generateDescriptionCardPayload }
            : {}),
        },
      ]);
    } catch {
      shopify.toast.show(t("chat.sendFailed"));
    } finally {
      setIsSending(false);
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

  return (
    <s-page heading={t("chat.pageTitle")}>
      <s-section heading={t("chat.sectionTitle")}>
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-paragraph>
              {t("chat.intro")}
            </s-paragraph>
            <s-badge tone="success">{t("chat.assistantOnline")}</s-badge>
          </s-stack>
          <s-button
            type="button"
            variant="secondary"
            onClick={() => {
              setMessages([{ role: "assistant", content: firstMessage }]);
              shopify.toast.show(t("chat.newChatStarted"));
            }}
            {...(isSending ? { disabled: true } : {})}
          >
            {t("common.newChat")}
          </s-button>
        </s-stack>

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
                    onClick={() =>
                      prompt === generateDescriptionQuickPrompt
                        ? openGenerateDescriptionCard()
                        : sendMessage(prompt)
                    }
                    {...(isSending ? { disabled: true } : {})}
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
                <ChatMessages messages={messages} onTranslationCardSuccess={succeedTranslationCard} />
              </s-box>
            </div>
          </div>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <ChatInput onMessageSend={sendMessage} isSending={isSending} />
          </s-box>
        </div>
      </s-section>

      <s-section slot="aside" heading={t("chat.tipsTitle")}>
        <div style={asideCardStyle}>
          <s-unordered-list>
            <s-list-item>{t("chat.tipSingleQuestion")}</s-list-item>
            <s-list-item>{t("chat.tipScenario")}</s-list-item>
            <s-list-item>{t("chat.tipAction")}</s-list-item>
            <s-list-item>
              {t("chat.tipNewChat")}
            </s-list-item>
          </s-unordered-list>
        </div>
      </s-section>

      <ChatPageCredentialsChrome shopify={shopify} />
    </s-page>
  );
}
