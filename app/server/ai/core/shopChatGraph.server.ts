import type { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getPersonalizedSystemPrompt } from "./shopAssistantPrompt";
import { baseAgentTools } from "../skills/system/baseAgentTools.server";
import type { UserProfile } from "./toolRegistry.server";

let shopChatModel: ChatOpenAI | null = null;

export function getShopChatModel(): ChatOpenAI {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is missing");
  }

  if (!shopChatModel) {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    shopChatModel = new ChatOpenAI({
      model: process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat",
      temperature: 0.2,
      apiKey,
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
      },
    });
  }

  return shopChatModel;
}

/** 构建 Shopify 店铺对话用的 LangGraph ReAct Agent（CompiledStateGraph）。 */
export function buildShopChatGraph(extraTools: DynamicStructuredTool[] = [], profile?: UserProfile) {
  const model = getShopChatModel();
  const tools = [...baseAgentTools, ...extraTools];

  return createReactAgent({
    llm: model,
    tools,
    prompt: getPersonalizedSystemPrompt(profile),
  });
}
