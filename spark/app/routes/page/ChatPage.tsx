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
  }, [messages, isSending]);

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
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 220px)",
          minHeight: "460px",
          gap: 0,
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <div
            ref={messagesContainerRef}
            style={{ height: "100%", overflowY: "auto" }}
          >
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <ChatMessages messages={messages} />
            </s-box>
          </div>
        </div>

        <div style={{ marginTop: 0 }}>
          <ChatInput onMessageSend={sendMessage} isSending={isSending} />
        </div>
      </div>
    </s-page>
  );
}
