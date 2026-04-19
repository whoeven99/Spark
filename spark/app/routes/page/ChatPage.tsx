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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你好，我是你的店铺助手。你可以问我业务问题，或让我查当前时间、某城市天气等。",
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
  }, [messages]);

  const sendMessage = async (content: string) => {
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
      <s-section heading="对话窗口">
        <div ref={messagesContainerRef} style={{ minHeight: "420px", maxHeight: "420px", overflowY: "auto" }}>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <ChatMessages messages={messages} />
          </s-box>
        </div>
      </s-section>

      <s-section>
        <ChatInput
          onMessageSend={sendMessage}
          isSending={isSending}
        />
      </s-section>
    </s-page>
  );
}
