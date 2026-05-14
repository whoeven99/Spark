import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
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
} from "./langchainMessageText";
import { buildShopChatGraph, getShopChatModel } from "./chatGraph.server";
import type { TranslationTaskFormPayload } from "../../lib/translationTaskFormPayload";
import type { GenerateDescriptionCardPayload } from "../../lib/chatMessage";
import { polishFinalReply } from "./polishFinalReply";
import {
  defaultTranslationTaskFormPayload,
  extractTranslationTaskFormFromMessages,
  shouldInjectTranslationTaskFormFallback,
} from "./translationTaskFormExtract";
import { GENERATE_PRODUCT_DESCRIPTION_TOOL_NAME } from "./tool/generateDescriptionTool";

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; args: unknown }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; metadata: { totalTokens: number; model: string } };

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
  const model = getShopChatModel();
  
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
  const graph = buildShopChatGraph(extraTools ?? []);
  const result = await graph.invoke(
    {
      messages: agentInputMessages,
    },
    config,
  );

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

  // 找到最终回复并流式模拟（可用 LangGraph `graph.stream`/`streamEvents` 做真流式，当前仍为整块推理后的分段推送）
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

  // 模拟流式输出；图上亦可改用 LangGraph 原生 stream API 输出 token 级事件
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
