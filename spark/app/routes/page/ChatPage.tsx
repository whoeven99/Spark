import { useState, useRef, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ChatMessages } from "../component/ChatMessages";
import { ChatInput } from "../component/ChatInput";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function ChatPage() {
  const shopify = useAppBridge();
  const [isSending, setIsSending] = useState(false);
  const initialAssistantMessage =
    "你好，我是你的店铺助手。你可以问我业务问题，或让我查当前时间、某城市天气等。";
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: initialAssistantMessage,
    },
  ]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const quickPrompts = [
    "给我 3 个提升转化率的建议",
    "帮我写一段新品上架文案",
    "今天适合做什么促销活动？",
  ];
  const quickPromptTones: Array<"info" | "success" | "caution"> = [
    "info",
    "success",
    "caution",
  ];

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
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const data: { reply?: string; error?: string } = await response.json().catch(() => ({}));
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
        },
      ]);
    } catch {
      shopify.toast.show("发送失败，请稍后重试");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <s-page heading="AI 对话机器人">
      <s-section heading="智能问答">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-paragraph>
            使用 Shopify 管理后台内置风格组件，快速获得运营建议、文案草稿和常见业务分析。
          </s-paragraph>
          <s-badge tone="success">助手在线</s-badge>
        </s-stack>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100vh - 290px)",
            minHeight: "480px",
            gap: "0.75rem",
          }}
        >
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="inline" gap="base">
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
              <s-button
                type="button"
                tone="critical"
                variant="secondary"
                onClick={() =>
                  setMessages([{ role: "assistant", content: initialAssistantMessage }])
                }
                {...(isSending ? { disabled: true } : {})}
              >
                清空会话
              </s-button>
            </s-stack>
          </s-box>

          <div style={{ flex: 1, minHeight: 0 }}>
            <div
              ref={messagesContainerRef}
              style={{ height: "100%", overflowY: "auto" }}
            >
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <ChatMessages messages={messages} />
              </s-box>
            </div>
          </div>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <ChatInput onMessageSend={sendMessage} isSending={isSending} />
          </s-box>
        </div>
      </s-section>

      <s-section slot="aside" heading="使用建议">
        <s-unordered-list>
          <s-list-item>尽量一次只提一个问题，回答会更准确。</s-list-item>
          <s-list-item>可直接说明场景，例如“新客拉新”“复购提升”。</s-list-item>
          <s-list-item>需要执行动作时，请明确给出目标和限制条件。</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
