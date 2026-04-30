import type { DynamicStructuredTool } from "@langchain/core/tools";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { baseAgentTools } from "./tools";

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

function polishFinalReply(rawText: string): string {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  // If the model already returned structured markdown/code, keep it as-is.
  if (/```/.test(text) || /^#{1,6}\s/m.test(text) || /^\s*[-*]\s/m.test(text)) {
    return text;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return text;
  }

  const metricLineCount = lines.filter(
    (line) => /^[^-].+[：:].+/.test(line) && !line.startsWith("注："),
  ).length;
  if (metricLineCount < 2) {
    return lines.join("\n\n");
  }

  const polished: string[] = [];
  const firstLine = lines[0];
  const firstLineLooksLikeMetric = /^[^-].+[：:].+/.test(firstLine);

  if (firstLineLooksLikeMetric) {
    polished.push("### 查询结果");
  } else {
    polished.push(`### ${firstLine}`);
  }
  polished.push("");

  for (let i = firstLineLooksLikeMetric ? 0 : 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("注：")) {
      polished.push("");
      polished.push(`> ${line}`);
      continue;
    }

    const metricMatch = line.match(/^([^：:]{1,60})[：:]\s*(.+)$/);
    if (metricMatch) {
      polished.push(`- **${metricMatch[1].trim()}**：${metricMatch[2].trim()}`);
    } else {
      polished.push(`- ${line}`);
    }
  }

  return polished.join("\n").replace(/\n{3,}/g, "\n\n");
}

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
      "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间、天气、当前 Shopify 商店基础信息等问题，优先调用对应工具获取信息；如果工具失败，明确说明。",
  });
}

export async function invokeChatAgent(
  input: string,
  options?: { extraTools?: DynamicStructuredTool[] },
) {
  const agent = await buildAgent(options?.extraTools ?? []);
  const result = await agent.invoke({
    messages: [new HumanMessage(input)],
  });

  const { messages } = result;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (AIMessage.isInstance(msg)) {
      const text = extractMessageText(msg).trim();
      if (text) {
        return polishFinalReply(text);
      }
    }
  }

  return "我暂时没有生成有效回复，请稍后重试。";
}
