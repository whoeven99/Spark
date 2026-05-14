import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  extractMessageText,
  extractMessagesContext,
} from "./langchainMessageText";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import type { GenerateDescriptionCardPayload } from "../../lib/chatMessage";
import { polishFinalReply } from "./polishFinalReply";
import {
  defaultTranslationTaskFormPayload,
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "./translationTaskFormExtract";
import { baseAgentTools } from "./tools";
import { GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "./tool/generateDescriptionTool";

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; metadata: { totalTokens: number; model: string } };

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
      "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间、天气、当前 Shopify 商店基础信息等问题，优先调用对应工具获取信息；如果工具失败，明确说明。若用户问题不需要工具，也要基于常识和上下文直接给出可执行建议，不要只回复不知道。回复尽量结构清晰，优先使用短段落和列表，不要使用 Markdown 表格。\n\n当用户想要创建「翻译任务」「批量翻译商品/页面」或填写目标语言做本地化时，必须调用工具 open_translation_task_form，并从对话中提取尽量准确的 sourceLocale、targetLocale、limitPerType、resourceTypes；不确定的字段可留空让用户在卡片里补全。调用工具后仍需用一两句话说明接下来可在卡片中确认并提交。禁止在未成功调用 open_translation_task_form 时声称「已为你打开卡片」或「卡片已打开」；若尚未调用该工具，必须先发起工具调用，不要仅用文字描述表单内容来代替卡片。\n\n当用户明确要求根据商品 ID 生成、撰写或优化商品营销描述时，应调用工具 generate_product_description，传入 productId（及可选 targetLanguage）。工具返回 JSON 字符串：成功时含 description 字段，请用简洁中文向用户概括要点并引用描述中的关键信息，不要编造工具未返回的内容。若用户未提供商品 ID，先请对方提供，不要猜测 ID。",
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

async function generateFallbackReplyStream(input: string, contextText: string): Promise<ReadableStream<StreamChunk>> {
  const model = getChatModel();
  
  const stream = await model.stream([
    new SystemMessage(
      "你是一个店铺 AI 助手。请基于用户问题和已知上下文直接给出有帮助的回答。若信息不足，请明确不确定点并给出下一步可执行建议。必须使用简体中文，不要输出 Markdown 表格。",
    ),
    new HumanMessage(
      `用户问题：${input}\n\n已知上下文（可能包含工具执行结果）：\n${contextText || "（无）"}`,
    ),
  ]);

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const content = extractMessageText(chunk);
        if (content) {
          controller.enqueue({ type: "text", content });
        }
      }
      controller.enqueue({
        type: "done",
        metadata: { totalTokens: 0, model: model.model ?? "unknown" }
      });
      controller.close();
    }
  });
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

export type InvokeChatAgentStreamParams = {
  messages: BaseMessage[];
  extraTools?: DynamicStructuredTool[];
  config?: RunnableConfig;
};

export async function invokeChatAgentStream(
  params: InvokeChatAgentStreamParams,
): Promise<ReadableStream<StreamChunk>> {
  const { messages: agentInputMessages, extraTools, config } = params;
  const agent = await buildAgent(extraTools ?? []);
  const result = await agent.invoke({
    messages: agentInputMessages,
  }, config);

  const { messages: resultMessages } = result;
  const extractedForm = extractTranslationTaskFormFromMessages(resultMessages);
  const extractedGeneratePayload = extractGenerateDescriptionCardPayload(resultMessages);
  const lastUserText =
    lastHumanUtterance(agentInputMessages) || lastHumanUtterance(resultMessages) || "";
  const toolCalledGenerateDescription = hasGenerateDescriptionToolCall(resultMessages);

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

  // 找到最终回复并流式模拟（完整的 LangChain 流式 Agent 更复杂）
  let finalReply = "";
  for (let i = resultMessages.length - 1; i >= 0; i -= 1) {
    const msg = resultMessages[i];
    if (AIMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) {
        finalReply = polishFinalReply(text);
        break;
      }
    }
  }

  if (!finalReply) {
    try {
      const fallbackStream = await generateFallbackReplyStream(
        lastUserText,
        extractMessagesContext(resultMessages),
      );
      return fallbackStream;
    } catch {
      finalReply = "我暂时没拿到工具结果，但可以继续帮你分析。你可以换个问法，或告诉我你想要的数据范围（例如最近 7 天销售额/订单数/转化率）。";
    }
  }

  // 模拟流式输出（真实的 LangChain Agent 流式需要用 .stream() 方法，但需要额外处理工具调用）
  return new ReadableStream({
    async start(controller) {
      // 逐个字符模拟流式
      for (let i = 0; i < finalReply.length; i += 3) {
        const chunk = finalReply.slice(i, i + 3);
        controller.enqueue({ type: "text", content: chunk });
        await new Promise(r => setTimeout(r, 10)); // 模拟延迟
      }
      
      // 发送结构化数据
      const translationTaskForm = resolveTranslationTaskForm(finalReply);
      if (translationTaskForm) {
        controller.enqueue({ 
          type: "tool_call", 
          name: "open_translation_task_form", 
          args: translationTaskForm 
        });
      }
      
      if (extractedGeneratePayload) {
        controller.enqueue({
          type: "tool_result",
          name: GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME,
          result: JSON.stringify(extractedGeneratePayload)
        });
      }
      
      controller.enqueue({
        type: "done",
        metadata: { totalTokens: 0, model: "unknown" }
      });
      
      controller.close();
    }
  });
}
