import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { agentTools } from "./tools";

function extractMessageText(message: BaseMessage): string {
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

type LangChainAgent = Awaited<ReturnType<typeof createAgent>>;

let agentPromise: Promise<LangChainAgent> | null = null;

async function buildAgent() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  const model = new ChatOpenAI({
    model: process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat",
    temperature: 0.2,
    apiKey,
    configuration: {
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    },
  });

  return createAgent({
    tools: agentTools,
    model,
    systemPrompt:
      "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间和天气相关问题，优先调用工具获取信息；如果工具失败，明确说明。",
  });
}

function getAgent() {
  if (!process.env.DEEPSEEK_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is missing");
  }

  if (!agentPromise) {
    agentPromise = buildAgent();
  }

  return agentPromise;
}

export async function invokeChatAgent(input: string) {
  const agent = await getAgent();
  const result = await agent.invoke({
    messages: [new HumanMessage(input)],
  });

  const { messages } = result;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (AIMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) {
        return text;
      }
    }
  }

  return "我暂时没有生成有效回复，请稍后重试。";
}
