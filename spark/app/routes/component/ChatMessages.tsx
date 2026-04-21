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
              borderWidth="base"
              style={{
                borderColor:
                  item.role === "assistant" ? "rgba(44, 110, 203, 0.35)" : "rgba(0, 128, 96, 0.35)",
                background:
                  item.role === "assistant"
                    ? "linear-gradient(180deg, rgba(44, 110, 203, 0.08), rgba(44, 110, 203, 0.02))"
                    : "linear-gradient(180deg, rgba(0, 128, 96, 0.08), rgba(0, 128, 96, 0.02))",
              }}
            >
              <div style={{ marginBottom: "0.25rem" }}>
                <s-badge
                  tone={
                    item.role === "assistant"
                      ? index % 3 === 0
                        ? "info"
                        : "caution"
                      : "success"
                  }
                >
                  {item.role === "assistant" ? "机器人" : "你"}
                </s-badge>
              </div>
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
