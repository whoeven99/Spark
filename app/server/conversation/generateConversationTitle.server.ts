import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { extractMessageText } from "../ai/utils/langchainMessageText";
import { getShopSummaryModel } from "../ai/core/shopChatGraph.server";
import { recordChatTokenUsage } from "../tokenUsage/index.server";

/** 侧栏标题上限：中文偏短、英文略长，统一按字符截断。 */
export const CONVERSATION_TITLE_MAX_CHARS = 28;

const TITLE_GENERATION_TIMEOUT_MS = 6000;

const TITLE_SYSTEM_PROMPT = `You name chat conversations, like Cursor's chat titles.
Given the first user message and optional assistant reply, output ONE short title.

Rules:
- Match the user's language (Chinese → Chinese, English → English).
- Capture the topic/intent, not a verbatim quote of the first sentence.
- Prefer noun phrases or brief verb phrases (e.g. "功能介绍", "Optimize product copy").
- Max ${CONVERSATION_TITLE_MAX_CHARS} characters.
- No quotes, no trailing punctuation, no emoji, no markdown, no colon-prefixed labels.
- Output the title only — nothing else.`;

/** 把 LLM 输出收成可展示的侧栏标题；失败返回 null。 */
export function sanitizeConversationTitle(raw: string): string | null {
  let title =
    raw
      .split(/\r?\n/)[0]
      ?.trim()
      .replace(/^["'`「『]+/, "")
      .replace(/["'`」』]+$/, "")
      .replace(/^标题[:：]\s*/i, "")
      .replace(/^Title[:：]\s*/i, "")
      .trim() ?? "";

  title = title.replace(/[.。!！?？;；:：]+$/g, "").trim();
  if (!title) return null;

  if (title.length > CONVERSATION_TITLE_MAX_CHARS) {
    title = `${title.slice(0, CONVERSATION_TITLE_MAX_CHARS - 1)}…`;
  }
  return title || null;
}

/** 无 LLM 时的回退：截断用户首句。 */
export function fallbackConversationTitle(userText: string): string {
  const cleaned = userText.replace(/\s+/g, " ").trim();
  if (!cleaned) return "新对话";
  if (cleaned.length <= CONVERSATION_TITLE_MAX_CHARS) return cleaned;
  return `${cleaned.slice(0, CONVERSATION_TITLE_MAX_CHARS - 1)}…`;
}

function buildTitlePrompt(userText: string, assistantText?: string): string {
  const user = userText.slice(0, 800).trim();
  const assistant = (assistantText ?? "").slice(0, 600).trim();
  if (assistant) {
    return `User:\n${user}\n\nAssistant (excerpt):\n${assistant}`;
  }
  return `User:\n${user}`;
}

/**
 * 用轻量 summary 模型为会话生成短标题（Cursor 风格）。
 * 失败或超时回退到截断首句；有 shop 时记入 chat token 用量。
 */
export async function generateConversationTitle(params: {
  shop?: string;
  userText: string;
  assistantText?: string;
}): Promise<string> {
  const userText = params.userText.trim();
  const fallback = fallbackConversationTitle(userText);
  if (!userText) return fallback;

  try {
    const summaryModel = getShopSummaryModel();
    const result = await Promise.race([
      summaryModel.invoke([
        new SystemMessage(TITLE_SYSTEM_PROMPT),
        new HumanMessage(buildTitlePrompt(userText, params.assistantText)),
      ]),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), TITLE_GENERATION_TIMEOUT_MS),
      ),
    ]);
    if (!result) return fallback;

    if (params.shop?.trim()) {
      const usageMeta =
        result && typeof result === "object" && "usage_metadata" in result
          ? (result as { usage_metadata?: unknown }).usage_metadata
          : undefined;
      await recordChatTokenUsage({ shop: params.shop, usage: usageMeta });
    }

    return sanitizeConversationTitle(extractMessageText(result)) ?? fallback;
  } catch (error) {
    console.warn("[ConversationTitle] generate failed, using fallback", error);
    return fallback;
  }
}
