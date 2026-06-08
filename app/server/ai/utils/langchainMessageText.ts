import type { BaseMessage } from "@langchain/core/messages";

/**
 * 从 LangChain BaseMessage 提取模型思考/推理内容。
 * 支持多种模型格式：
 * - Anthropic/Claude extended thinking：content 数组中 type="thinking" 的块
 * - DeepSeek reasoner：additional_kwargs.reasoning_content
 * - OpenAI o1/o3 系列：additional_kwargs.reasoning_content 或 content 中的 reasoning 块
 */
export function extractMessageThinking(message: BaseMessage): string {
  const content = (message as { content?: unknown }).content;

  // 1. Anthropic/Claude 格式：content 为数组，包含 type="thinking" 块
  if (Array.isArray(content)) {
    const fromBlocks = content
      .map((block) => {
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          (block as { type?: string }).type === "thinking" &&
          "thinking" in block
        ) {
          return String((block as { thinking?: string }).thinking ?? "");
        }
        return "";
      })
      .join("");
    if (fromBlocks) return fromBlocks;
  }

  // 2. DeepSeek / OpenAI reasoning 格式：additional_kwargs.reasoning_content
  const additionalKwargs = (message as { additional_kwargs?: Record<string, unknown> }).additional_kwargs;
  if (additionalKwargs?.reasoning_content) {
    return String(additionalKwargs.reasoning_content);
  }

  // 3. 某些适配器可能把 reasoning_content 放在 response_metadata 中
  const responseMetadata = (message as { response_metadata?: Record<string, unknown> }).response_metadata;
  if (responseMetadata?.reasoning_content) {
    return String(responseMetadata.reasoning_content);
  }

  return "";
}

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
