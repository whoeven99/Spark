import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { loadMultipleFilesText } from "./fileStore.server";

const MAX_TOTAL_CHARS = 60_000;

export async function buildFileContextBlock(
  shop: string,
  fileIds: string[],
): Promise<string | null> {
  if (!fileIds.length) return null;

  const files = await loadMultipleFilesText(shop, fileIds);
  if (!files.length) return null;

  let totalChars = 0;
  const sections: string[] = [];

  for (const file of files) {
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (remaining <= 0) break;
    const text = file.text.slice(0, remaining);
    totalChars += text.length;
    sections.push(`=== 文件：${file.name} ===\n${text}`);
  }

  if (!sections.length) return null;

  return [
    "【附加文件上下文】（用户已上传文件，内容已解析为文本，你可直接阅读和分析，无需任何工具）",
    "以下是文件的完整文本内容，请结合这些内容回答用户问题：",
    ...sections,
  ].join("\n\n");
}

/**
 * 将文件上下文作为一条额外的 SystemMessage 注入到消息列表最前面。
 * 如果已有 SystemMessage 则追加到它后面，否则在 messages[0] 之前插入一条。
 */
export function injectFileContextIntoMessages(
  messages: BaseMessage[],
  contextBlock: string,
): BaseMessage[] {
  if (!messages.length) {
    return [new SystemMessage(contextBlock)];
  }

  const first = messages[0];
  if (first instanceof SystemMessage) {
    const combined = `${first.content as string}\n\n${contextBlock}`;
    return [new SystemMessage(combined), ...messages.slice(1)];
  }

  return [new SystemMessage(contextBlock), ...messages];
}

export async function injectFilesIntoMessages(
  messages: BaseMessage[],
  shop: string,
  fileIds: string[],
): Promise<BaseMessage[]> {
  const block = await buildFileContextBlock(shop, fileIds);
  if (!block) return messages;
  return injectFileContextIntoMessages(messages, block);
}
