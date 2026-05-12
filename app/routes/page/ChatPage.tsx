import { useState, useRef, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { ChatMessage } from "../../lib/chatMessage";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { ChatMessages } from "../component/chat/ChatMessages";
import { ChatInput } from "../component/chat/ChatInput";
import { ChatPageCredentialsChrome } from "./chat/ChatPageCredentialsChrome";
import { INITIAL_ASSISTANT_MESSAGE, quickPrompts, quickPromptTones } from "./chat/chatPageConstants";
import { asideCardStyle } from "./chat/chatPageStyles";

export function ChatPage() {
  const shopify = useAppBridge();
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: INITIAL_ASSISTANT_MESSAGE,
    },
  ]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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
      };
      const assistantText =
        data.reply?.trim() ||
        data.error?.trim() ||
        (!response.ok
          ? `请求失败（${response.status}），请稍后重试。`
          : "未收到有效回复，请重试。");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantText,
          ...(data.translationTaskForm ? { translationTaskForm: data.translationTaskForm } : {}),
        },
      ]);
    } catch {
      shopify.toast.show("发送失败，请稍后重试");
    } finally {
      setIsSending(false);
    }
  };

  const succeedTranslationCard = (
    messageIndex: number,
    detail: { jobId?: string; message: string },
  ) => {
    shopify.toast.show(detail.message || "翻译任务创建成功");
    setMessages((prev) => {
      const next = prev.map((m, i): ChatMessage =>
        i === messageIndex && m.role === "assistant"
          ? { role: "assistant", content: m.content }
          : m,
      );
      next.push({
        role: "assistant",
        content: detail.jobId
          ? `翻译任务已提交（任务 ID：${detail.jobId}）。请到应用「翻译任务」页查看 JSON Runtime 进度。`
          : "翻译任务已提交。请到「翻译任务」页查看进度。",
      });
      return next;
    });
  };

  return (
    <s-page heading="Shopify Ai Assistant">
      <s-section heading="智能问答">
        <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-paragraph>
              你可以在这里直接提问，获取店铺经营分析、广告/物流授权引导和运营建议。
            </s-paragraph>
            <s-badge tone="success">AI 助手在线</s-badge>
          </s-stack>
          <s-button
            type="button"
            variant="secondary"
            onClick={() => {
              setMessages([{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }]);
              shopify.toast.show("已开始新对话");
            }}
            {...(isSending ? { disabled: true } : {})}
          >
            新对话
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
              <s-paragraph>快捷问题</s-paragraph>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.25rem" }}>
                {quickPrompts.map((prompt, index) => (
                  <s-button
                    key={prompt}
                    type="button"
                    tone={quickPromptTones[index]}
                    variant="secondary"
                    onClick={() => sendMessage(prompt)}
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

      <s-section slot="aside" heading="使用建议">
        <div style={asideCardStyle}>
          <s-unordered-list>
            <s-list-item>尽量一次只提一个问题，回答会更准确。</s-list-item>
            <s-list-item>可直接说明场景，例如“新客拉新”“复购提升”。</s-list-item>
            <s-list-item>需要执行动作时，请明确给出目标和限制条件。</s-list-item>
            <s-list-item>
              模型会记住当前页这段对话；点「新对话」可清空上下文重新开始。
            </s-list-item>
          </s-unordered-list>
        </div>
      </s-section>

      <ChatPageCredentialsChrome shopify={shopify} />
    </s-page>
  );
}
