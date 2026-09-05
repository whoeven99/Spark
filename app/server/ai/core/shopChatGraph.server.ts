import type { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getPersonalizedSystemPrompt } from "./shopAssistantPrompt";
import { fetchRecentReflectionSummary } from "../../agentRunLog/recentReflection.server";
import { baseAgentTools } from "../skills/system/baseAgentTools.server";
import { wrapToolWithTokenUsage } from "../../tokenUsage/wrapToolWithTokenUsage.server";
import type { AgentContext, ToolDefinition } from "./toolRegistry.server";
import type { PlaybookDefinition } from "./playbookRegistry.server";

let shopChatModel: ChatOpenAI | null = null;
let shopSummaryModel: ChatOpenAI | null = null;

/** maxTokens 是构造期参数，不能在调用期覆盖，所以按用途各建一个单例。 */
function createShopModel(maxTokens: number): ChatOpenAI {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is missing");
  }

  return new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat",
    temperature: 0.2,
    maxTokens,
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    },
  });
}

export function getShopChatModel(): ChatOpenAI {
  if (!shopChatModel) {
    shopChatModel = createShopModel(Number(process.env.AI_MAX_TOKENS) || 4096);
  }
  return shopChatModel;
}

/** 历史对话摘要用：输出上限更小以加速。 */
export function getShopSummaryModel(): ChatOpenAI {
  if (!shopSummaryModel) {
    shopSummaryModel = createShopModel(512);
  }
  return shopSummaryModel;
}

/** 构建 Shopify 店铺对话用的 LangGraph ReAct Agent（CompiledStateGraph）。 */
export async function buildShopChatGraph(
  context: AgentContext,
  extraTools: DynamicStructuredTool[] = [],
  activeDefs: ToolDefinition[] = [],
  activePlaybookDefs: PlaybookDefinition[] = [],
  preFetchedReflectionSummary?: string,
  promptOptions?: { skillFocus?: string | null; userText?: string | null },
) {
  const model = getShopChatModel();
  const wrappedBaseTools = context.shop?.trim()
    ? baseAgentTools.map((tool) => wrapToolWithTokenUsage(tool, context))
    : baseAgentTools;
  const tools = [...wrappedBaseTools, ...extraTools];

  const reflectionSummary = preFetchedReflectionSummary !== undefined
    ? preFetchedReflectionSummary || undefined
    : context.shop?.trim()
      ? await fetchRecentReflectionSummary(context.shop)
      : undefined;
  const dynamicPrompt = await getPersonalizedSystemPrompt(context, activeDefs, {
    reflectionSummary,
    activePlaybookDefs,
    skillFocus: promptOptions?.skillFocus,
    userText: promptOptions?.userText,
  });

  return createReactAgent({
    llm: model,
    tools,
    prompt: dynamicPrompt,
  });
}
