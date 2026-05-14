import type { DynamicStructuredTool } from "@langchain/core/tools";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  extractMessageText,
  extractMessagesContext,
} from "../utils/langchainMessageText";
import { buildShopChatGraph, getShopChatModel } from "./shopChatGraph.server";
import type { TranslationTaskFormPayload } from "../../../lib/translationTaskFormPayload";
import type { GenerateDescriptionCardPayload } from "../../../lib/chatMessage";
import { polishFinalReply } from "../utils/polishFinalReply";
import {
  defaultTranslationTaskFormPayload,
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "../skills/translation/extract";
import { GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "../skills/marketing/tool";
import {
  createLangsmithTracer,
  getTraceUrl,
} from "../utils/langsmith.server";

export type InvokeChatAgentResult = {
  reply: string;
  translationTaskForm?: TranslationTaskFormPayload;
  generateDescriptionCard?: boolean;
  generateDescriptionCardPayload?: GenerateDescriptionCardPayload;
};

function lastHumanUtterance(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (HumanMessage.isInstance(msg)) {
      return extractMessageText(msg).trim();
    }
  }
  return "";
}

async function generateFallbackReply(input: string, contextText: string) {
  const model = getShopChatModel();
  const result = await model.invoke([
    new SystemMessage(
      "你是一个店铺 AI 助手。请基于用户问题和已知上下文直接给出有帮助的回答。若信息不足，请明确不确定点并给出下一步可执行建议。必须使用简体中文，不要输出 Markdown 表格。",
    ),
    new HumanMessage(
      `用户问题：${input}\n\n已知上下文（可能包含工具执行结果）：\n${contextText || "（无）"}`,
    ),
  ]);
  return extractMessageText(result).trim();
}

function hasGenerateDescriptionToolCall(messages: BaseMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name === GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME) {
      return true;
    }
  }
  return false;
}

function shouldInjectGenerateDescriptionCardFallback(
  lastUserText: string,
  assistantReplyText: string,
): boolean {
  const u = lastUserText.trim();
  const a = assistantReplyText.trim();
  if (!u || !a) return false;
  const userSignals =
    /(商品描述|营销描述|文案|写描述|优化描述|product description)/i.test(u) &&
    /(gid:\/\/shopify\/Product\/\d+|\b\d{6,}\b)/i.test(u);
  const assistantSignals =
    /(已生成|生成结果|核心要点|一句话概括|如需调整|商品描述)/i.test(a);
  return userSignals && assistantSignals;
}

function extractGenerateDescriptionCardPayload(
  messages: BaseMessage[],
): GenerateDescriptionCardPayload | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!ToolMessage.isInstance(msg)) continue;
    if (msg.name !== GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME) continue;

    const raw = extractMessageText(msg).trim();
    if (!raw.startsWith("{")) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const rec = parsed as Record<string, unknown>;
    if (rec.ok !== true) continue;

    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const description =
      typeof rec.description === "string" ? rec.description : "";
    if (!title || !description) continue;

    const productId =
      typeof rec.productId === "string" ? rec.productId.trim() : "";
    const targetLanguage =
      typeof rec.targetLanguage === "string"
        ? rec.targetLanguage.trim()
        : undefined;

    return {
      productId,
      title,
      description,
      ...(targetLanguage ? { targetLanguage } : {}),
    };
  }
  return undefined;
}

import type { UserProfile } from "./toolRegistry.server";

export type InvokeChatAgentParams = {
  /** 完整对话上下文；最后一条须为用户消息（HumanMessage）。 */
  messages: BaseMessage[];
  extraTools?: DynamicStructuredTool[];
  /** 可选的会话名称，用于 LangSmith 追踪 */
  sessionName?: string;
  /** 用户画像，用于动态个性化建议 */
  profile?: UserProfile;
};

export async function invokeChatAgent(
  params: InvokeChatAgentParams,
): Promise<InvokeChatAgentResult & { langsmithTraceUrl?: string}> {
  const { messages: agentInputMessages, extraTools, sessionName, profile } = params;
  
  // 创建 LangSmith 追踪器
  const tracer = createLangsmithTracer(sessionName);
  const callbacks = tracer ? [tracer] : [];
  
  const graph = buildShopChatGraph(extraTools ?? [], profile);
  const result = await graph.invoke(
    { messages: agentInputMessages },
    { callbacks }
  );

  const { messages } = result;
  const extractedForm = extractTranslationTaskFormFromMessages(messages);
  const extractedGeneratePayload = extractGenerateDescriptionCardPayload(messages);
  const lastUserText =
    lastHumanUtterance(agentInputMessages) || lastHumanUtterance(messages) || "";
  const toolCalledGenerateDescription = hasGenerateDescriptionToolCall(messages);

  const resolveTranslationTaskForm = (assistantReplyRaw: string) => {
    if (extractedForm) return extractedForm;
    if (shouldInjectTranslationTaskFormFallback(lastUserText, assistantReplyRaw)) {
      return defaultTranslationTaskFormPayload();
    }
    return undefined;
  };

  const resolveGenerateDescriptionCard = (assistantReplyRaw: string) => {
    if (toolCalledGenerateDescription) return true;
    return shouldInjectGenerateDescriptionCardFallback(
      lastUserText,
      assistantReplyRaw,
    );
  };

  // 从 tracer 获取 traceUrl（如果可用）
  const traceUrl = tracer ? getTraceUrl() : undefined;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (AIMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) {
        return {
          reply: polishFinalReply(text),
          translationTaskForm: resolveTranslationTaskForm(text),
          generateDescriptionCard: resolveGenerateDescriptionCard(text),
          ...(extractedGeneratePayload
            ? { generateDescriptionCardPayload: extractedGeneratePayload }
            : {}),
          ...(traceUrl ? { langsmithTraceUrl: traceUrl } : {}),
        };
      }
    }
  }

  try {
    const fallbackText = await generateFallbackReply(
      lastUserText,
      extractMessagesContext(messages),
    );
    if (fallbackText) {
      return {
        reply: polishFinalReply(fallbackText),
        translationTaskForm: resolveTranslationTaskForm(fallbackText),
        generateDescriptionCard: resolveGenerateDescriptionCard(fallbackText),
        ...(extractedGeneratePayload
          ? { generateDescriptionCardPayload: extractedGeneratePayload }
          : {}),
        ...(traceUrl ? { langsmithTraceUrl: traceUrl } : {}),
      };
    }
  } catch {
    // Fallback invocation failed; keep graceful default below.
  }

  const defaultReply =
    "我暂时没拿到工具结果，但可以继续帮你分析。你可以换个问法，或告诉我你想要的数据范围（例如最近 7 天销售额/订单数/转化率）。";

  return {
    reply: defaultReply,
    translationTaskForm: resolveTranslationTaskForm(defaultReply),
    generateDescriptionCard: resolveGenerateDescriptionCard(defaultReply),
    ...(extractedGeneratePayload
      ? { generateDescriptionCardPayload: extractedGeneratePayload }
      : {}),
    ...(traceUrl ? { langsmithTraceUrl: traceUrl } : {}),
  };
}
