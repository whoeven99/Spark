import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  extractMessageText,
  extractMessagesContext,
} from "../utils/langchainMessageText";
import { buildShopChatGraph, getShopChatModel } from "./shopChatGraph.server";
import { polishFinalReply } from "../utils/polishFinalReply";
import {
  createLangsmithTracer,
  getTraceUrl,
} from "../utils/langsmith.server";
import { globalToolRegistry, type AgentContext } from "./toolRegistry.server";
import "../skills/index";

export type InvokeChatAgentResult = {
  reply: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uiPayloads?: Record<string, any>;
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

export type InvokeChatAgentParams = {
  /** 完整对话上下文；最后一条须为用户消息（HumanMessage）。 */
  messages: BaseMessage[];
  /** 代理上下文（含 admin 和用户画像等） */
  context: AgentContext;
  /** 可选的会话名称，用于 LangSmith 追踪 */
  sessionName?: string;
};

export async function invokeChatAgent(
  params: InvokeChatAgentParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<InvokeChatAgentResult & { langsmithTraceUrl?: string }> {
  const { messages: agentInputMessages, context, sessionName } = params;
  
  // 从全局注册表获取当前上下文激活的工具
  const activeDefs = await globalToolRegistry.getActiveToolDefinitions(context);
  const extraTools = await globalToolRegistry.getToolsForContext(context);

  // 创建 LangSmith 追踪器
  const tracer = createLangsmithTracer(sessionName);
  const callbacks = tracer ? [tracer] : [];
  
  const graph = await buildShopChatGraph(context, extraTools, activeDefs);
  const result = await graph.invoke(
    { messages: agentInputMessages },
    { callbacks }
  );

  const { messages } = result;
  
  const lastUserText =
    lastHumanUtterance(agentInputMessages) || lastHumanUtterance(messages) || "";

  // 动态提取各 Tool 定义的 UI Payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uiPayloads: Record<string, any> = {};
  
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (AIMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) {
        for (const def of activeDefs) {
          if (def.extractUIPayload && def.uiPayloadKey) {
            const payload = def.extractUIPayload(messages, lastUserText, text);
            if (payload !== undefined) {
              uiPayloads[def.uiPayloadKey] = payload;
            }
          }
        }

        return {
          reply: polishFinalReply(text),
          uiPayloads,
          ...(tracer ? { langsmithTraceUrl: getTraceUrl() } : {}),
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
      for (const def of activeDefs) {
        if (def.extractUIPayload && def.uiPayloadKey) {
          const payload = def.extractUIPayload(messages, lastUserText, fallbackText);
          if (payload !== undefined) {
            uiPayloads[def.uiPayloadKey] = payload;
          }
        }
      }

      return {
        reply: polishFinalReply(fallbackText),
        uiPayloads,
        ...(tracer ? { langsmithTraceUrl: getTraceUrl() } : {}),
      };
    }
  } catch {
    // Fallback invocation failed; keep graceful default below.
  }

  const defaultReply =
    "我暂时没拿到工具结果，但可以继续帮你分析。你可以换个问法，或告诉我你想要的数据范围（例如最近 7 天销售额/订单数/转化率）。";

  for (const def of activeDefs) {
    if (def.extractUIPayload && def.uiPayloadKey) {
      const payload = def.extractUIPayload(messages, lastUserText, defaultReply);
      if (payload !== undefined) {
        uiPayloads[def.uiPayloadKey] = payload;
      }
    }
  }

  return {
    reply: defaultReply,
    uiPayloads,
    ...(tracer ? { langsmithTraceUrl: getTraceUrl() } : {}),
  };
}
