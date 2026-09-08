import { getEnv } from "../lib/env.js";
import {
  findBannedHit,
  normalizeDraft,
  playbookHint,
  type XhsCopyDraft,
  type XhsDirection,
} from "./xhsPlaybooks.js";

export type CopyModelInfo = {
  provider: "deepseek" | "openai";
  model: string;
};

export function resolveCopyModel(): CopyModelInfo | null {
  const deepseekKey = getEnv("DEEPSEEK_API_KEY");
  if (deepseekKey) {
    return {
      provider: "deepseek",
      model: getEnv("DEEPSEEK_MODEL", "deepseek-chat"),
    };
  }
  const openaiKey = getEnv("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      provider: "openai",
      model: getEnv("OPENAI_MODEL", "gpt-4o-mini"),
    };
  }
  return null;
}

export async function generateXhsCopy(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
}): Promise<{ draft: XhsCopyDraft; model: CopyModelInfo }> {
  const resolved = resolveCopyModel();
  if (!resolved) {
    throw new Error("未配置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY");
  }

  const content = await invokeChat(resolved, buildSystemPrompt(), buildUserPrompt(params));
  const draft = normalizeDraft(parseJsonObject(content), params.topic);
  const banned = findBannedHit(`${draft.title}\n${draft.body}\n${draft.cover.headline}`);
  if (banned) {
    draft.title = draft.title.replaceAll(banned, "");
    draft.body = draft.body.replaceAll(banned, "");
    draft.cover.headline = draft.cover.headline.replaceAll(banned, "");
  }
  return { draft, model: resolved };
}

function buildSystemPrompt(): string {
  return [
    "你是小红书图文编辑，给 Shopify AI 插件 Spark 写推广笔记。",
    "只输出一个 JSON 对象，不要 Markdown、不要解释。",
    "字段：title, body, tags, cover.headline, cover.subhead, cover.left, cover.right, cover.metric, cover.metricNote, cover.promptBox。",
    "语气像真人店主，短句换行。禁用：最、第一、100%、神仙、宝藏、绝对、保证。",
    "title ≤14 字。cover.headline 3-10 字。tags 3-5 个，不要 #。",
  ].join("\n");
}

function buildUserPrompt(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
}): string {
  const notes = params.notes.trim() || "（无补充）";
  return [
    `方向：${params.direction}`,
    playbookHint(params.direction),
    `选题：${params.topic}`,
    `补充：${notes}`,
  ].join("\n\n");
}

async function invokeChat(model: CopyModelInfo, system: string, user: string): Promise<string> {
  const { baseUrl, apiKey } = resolveEndpoint(model);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  if (!res.ok) {
    throw new Error(raw.error?.message || `文案模型 HTTP ${res.status}`);
  }
  const content = raw.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("文案模型没有返回内容");
  }
  return content;
}

function resolveEndpoint(model: CopyModelInfo): { baseUrl: string; apiKey: string } {
  if (model.provider === "deepseek") {
    return {
      baseUrl: getEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").replace(/\/$/, ""),
      apiKey: getEnv("DEEPSEEK_API_KEY"),
    };
  }
  return {
    baseUrl: getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey: getEnv("OPENAI_API_KEY"),
  };
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = (fenced?.[1] ?? text).trim();
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("文案模型没有返回 JSON");
  }
  return JSON.parse(payload.slice(start, end + 1)) as unknown;
}
