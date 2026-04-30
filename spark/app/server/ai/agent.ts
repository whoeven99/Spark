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

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!normalized) return false;
  return normalized
    .split("|")
    .map((part) => part.trim())
    .every((part) => /^:?-{3,}:?$/.test(part));
}

function normalizeMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    const maybeTable = current.includes("|") && isMarkdownTableSeparator(next);
    if (!maybeTable) {
      out.push(current);
      i += 1;
      continue;
    }

    const headers = splitTableRow(current);
    i += 2; // Skip header + separator.
    const rows: string[][] = [];
    while (i < lines.length && (lines[i] ?? "").includes("|")) {
      const row = splitTableRow(lines[i] ?? "");
      if (row.some(Boolean)) {
        rows.push(row);
      }
      i += 1;
    }

    if (!rows.length) {
      out.push(current, next);
      continue;
    }

    for (const row of rows) {
      const first = row[0] || "项目";
      const details = row
        .slice(1)
        .map((value, idx) => `${headers[idx + 1] || `字段${idx + 2}`}：${value || "-"}`)
        .join("；");
      out.push(`- **${first}**：${details || "-"}`);
    }
  }

  return out.join("\n");
}

function polishFinalReply(rawText: string): string {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  // Keep code blocks untouched.
  if (/```/.test(text)) {
    return text;
  }

  const normalizedText = normalizeMarkdownTables(text);
  if (/^#{1,6}\s/m.test(normalizedText) || /^\s*[-*]\s/m.test(normalizedText)) {
    return normalizedText;
  }

  const lines = normalizedText
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
      "你是一个店铺 AI 助手，请始终使用简体中文回复。对于时间、天气、当前 Shopify 商店基础信息等问题，优先调用对应工具获取信息；如果工具失败，明确说明。回复尽量结构清晰，优先使用短段落和列表，不要使用 Markdown 表格。",
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
