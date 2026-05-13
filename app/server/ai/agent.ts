import type { DynamicStructuredTool } from "@langchain/core/tools";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  extractMessageText,
  extractMessagesContext,
} from "./langchainMessageText";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import { polishFinalReply } from "./polishFinalReply";
import {
  defaultTranslationTaskFormPayload,
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "./translationTaskFormExtract";
import { baseAgentTools } from "./tools";

export type InvokeChatAgentResult = {
  reply: string;
  translationTaskForm?: TranslationTaskFormPayload;
};

let chatModel: ChatOpenAI | null = null;

function getChatModel() {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is missing");
  }

  if (!chatModel) {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    chatModel = new ChatOpenAI({
      model: process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat",
      temperature: 0.2,
      apiKey,
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
      },
    });
  }

  return chatModel;
}

async function buildAgent(extraTools: DynamicStructuredTool[] = []) {
  const model = getChatModel();
  const tools = [...baseAgentTools, ...extraTools];

  return createAgent({
    tools,
    model,
    systemPrompt:
      "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间、天气、当前 Shopify 商店基础信息等问题，优先调用对应工具获取信息；如果工具失败，明确说明。若用户问题不需要工具，也要基于常识和上下文直接给出可执行建议，不要只回复不知道。回复尽量结构清晰，优先使用短段落和列表，不要使用 Markdown 表格。\n\n当用户想要创建「翻译任务」「批量翻译商品/页面」或填写目标语言做本地化时，必须调用工具 open_translation_task_form，并从对话中提取尽量准确的 sourceLocale、targetLocale、limitPerType、resourceTypes；不确定的字段可留空让用户在卡片里补全。调用该工具后仍需用一两句话说明接下来可在卡片中确认并提交。禁止在未成功调用 open_translation_task_form 时声称「已为你打开卡片」或「卡片已打开」；若尚未调用该工具，必须先发起工具调用，不要仅用文字描述表单内容来代替卡片。\n\n当用户明确要求根据商品 ID 生成、撰写或优化商品营销描述时，应调用工具 generate_product_description，传入 productId（及可选 targetLanguage）。工具返回 JSON 字符串：成功时含 description 字段，请用简洁中文向用户概括要点并引用描述中的关键信息，不要编造工具未返回的内容。若用户未提供商品 ID，先请对方提供，不要猜测 ID。",
  });
}

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
  const model = getChatModel();
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

export type InvokeChatAgentParams = {
  /** 完整对话上下文；最后一条须为用户消息（HumanMessage）。 */
  messages: BaseMessage[];
  extraTools?: DynamicStructuredTool[];
};

export async function invokeChatAgent(
  params: InvokeChatAgentParams,
): Promise<InvokeChatAgentResult> {
  const { messages: agentInputMessages, extraTools } = params;
  const agent = await buildAgent(extraTools ?? []);
  const result = await agent.invoke({
    messages: agentInputMessages,
  });

  const { messages } = result;
  const extractedForm = extractTranslationTaskFormFromMessages(messages);
  const lastUserText =
    lastHumanUtterance(agentInputMessages) || lastHumanUtterance(messages) || "";

  const resolveTranslationTaskForm = (assistantReplyRaw: string) => {
    if (extractedForm) return extractedForm;
    if (shouldInjectTranslationTaskFormFallback(lastUserText, assistantReplyRaw)) {
      return defaultTranslationTaskFormPayload();
    }
    return undefined;
  };

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (AIMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) {
        return {
          reply: polishFinalReply(text),
          translationTaskForm: resolveTranslationTaskForm(text),
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
  };
}
