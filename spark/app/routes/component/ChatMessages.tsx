import { ChatMessageContent } from "./ChatMessageContent";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessagesProps = {
  messages: Message[];
};

export function ChatMessages({ messages }: ChatMessagesProps) {
  return (
    <s-stack direction="block" gap="base">
      {messages.map((item, index) => (
        <div
          key={`${item.role}-${index}`}
          style={{
            display: "flex",
            justifyContent:
              item.role === "assistant" ? "flex-start" : "flex-end",
          }}
        >
          <div style={{ maxWidth: "80%" }}>
            <s-box
              padding="base"
              borderRadius="base"
              background={item.role === "assistant" ? "subdued" : "base"}
            >
              <strong>{item.role === "assistant" ? "机器人" : "你"}</strong>
              <div style={{ marginTop: "0.35rem" }}>
                {item.role === "assistant" ? (
                  <ChatMessageContent content={item.content} />
                ) : (
                  <span style={{ whiteSpace: "pre-wrap" }}>{item.content}</span>
                )}
              </div>
            </s-box>
          </div>
        </div>
      ))}
    </s-stack>
  );
}
