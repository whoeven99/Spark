import type { BaseMessage } from "@langchain/core/messages";

/** 从 LangChain BaseMessage 抽取纯文本（字符串或多模态块中的 text）。 */
export function extractMessageText(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return String((block as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** 拼接对话中的非空文本，截断长度供兜底模型上下文使用。 */
export function extractMessagesContext(messages: BaseMessage[]): string {
  const chunks: string[] = [];
  for (const msg of messages) {
    const text = extractMessageText(msg).trim();
    if (!text) continue;
    chunks.push(text);
  }
  return chunks.join("\n\n").slice(0, 4000);
}
