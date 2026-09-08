import { getEnv } from "../lib/env.js";
import {
  findBannedHit,
  normalizeDraft,
  playbookHint,
  scrubBanned,
  type XhsCopyDraft,
  type XhsDirection,
} from "./xhsPlaybooks.js";

export type CopyProvider = "volc-ark" | "deepseek" | "openai";

export type CopyModelInfo = {
  provider: CopyProvider;
  model: string;
};

const COPY_PROVIDERS: readonly CopyProvider[] = ["volc-ark", "deepseek", "openai"];

function isCopyProvider(value: string): value is CopyProvider {
  return COPY_PROVIDERS.includes(value as CopyProvider);
}

const KNOWN_UNAVAILABLE_ARK_TEXT_MODELS = new Set(["doubao-seed-1-6-251015"]);

function resolveArkApiKey(): string {
  return getEnv("VOLC_ARK_API_KEY") || getEnv("ARK_API_KEY");
}

export function configuredArkTextModel(): string {
  const raw = getEnv("VOLC_ARK_TEXT_MODEL");
  if (!raw || KNOWN_UNAVAILABLE_ARK_TEXT_MODELS.has(raw)) return "";
  return raw;
}

export function arkCopyHint(): string {
  if (!resolveArkApiKey()) return "";
  if (configuredArkTextModel()) return "";
  return "封面密钥已通，但还没有可用的豆包对话模型。请在方舟开通对话模型，把 Model ID 或 ep- 写入 VOLC_ARK_TEXT_MODEL，不要用 doubao-seed-1-6-251015。";
}

export function listCopyModels(): CopyModelInfo[] {
  const options: CopyModelInfo[] = [];
  if (getEnv("DEEPSEEK_API_KEY")) {
    options.push({
      provider: "deepseek",
      model: getEnv("DEEPSEEK_MODEL", "deepseek-chat"),
    });
  }
  const arkTextModel = configuredArkTextModel();
  if (resolveArkApiKey() && arkTextModel) {
    options.push({
      provider: "volc-ark",
      model: arkTextModel,
    });
  }
  if (getEnv("OPENAI_API_KEY")) {
    options.push({
      provider: "openai",
      model: getEnv("OPENAI_MODEL", "gpt-4o-mini"),
    });
  }
  return options;
}

export function resolveCopyModel(preferred?: string | null): CopyModelInfo | null {
  const options = listCopyModels();
  if (options.length === 0) return null;
  if (preferred && isCopyProvider(preferred)) {
    const hit = options.find((item) => item.provider === preferred);
    if (hit) return hit;
  }
  return options.find((item) => item.provider === "deepseek") ?? options[0] ?? null;
}

export async function generateXhsCopy(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  provider?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
}): Promise<{ draft: XhsCopyDraft; model: CopyModelInfo }> {
  const resolved = resolveCopyModel(params.provider);
  if (!resolved) {
    throw new Error(
      arkCopyHint() || "未配置可用的文案模型。豆包需要 VOLC_ARK_TEXT_MODEL（对话 Model ID 或 ep-），或配置 DEEPSEEK_API_KEY / OPENAI_API_KEY。",
    );
  }

  const system = params.systemPrompt?.trim() || buildCopySystemPrompt();
  const user = params.userPrompt?.trim() || buildCopyUserPrompt(params);
  const content = await invokeChat(resolved, system, user);
  const draft = normalizeDraft(parseJsonObject(content), params.topic);
  const bannedSource = [
    draft.title,
    draft.body,
    draft.cover.headline,
    ...draft.cards.flatMap((card) => [card.headline, ...card.lines]),
  ].join("\n");
  if (findBannedHit(bannedSource)) {
    draft.title = scrubBanned(draft.title);
    draft.body = scrubBanned(draft.body);
    draft.cover.headline = scrubBanned(draft.cover.headline);
    draft.cards = draft.cards.map((card) => ({
      headline: scrubBanned(card.headline),
      lines: card.lines.map((line) => scrubBanned(line)),
    }));
  }
  return { draft, model: resolved };
}

export function buildCopySystemPrompt(): string {
  return [
    "你是小红书图文编辑，给 Shopify AI 插件 Spark 写推广笔记。",
    "只输出一个 JSON 对象，不要 Markdown、不要解释。",
    "字段：title, body, tags, cover.*, cards。",
    "cards 是 2-4 张滑页卡片，只给图片排版，不要把笔记正文原样塞进去。",
    "每张 card：headline ≤10 字，lines 2-4 条、每条≤16 字。",
    "语气像真人店主，短句换行。禁用：最、第一、100%、神仙、宝藏、绝对、保证。",
    "title ≤14 字，必须有钩子，禁止只写两个品牌名对打。body 200-400 字，前 80 字必须是钩子。细节放 cards。",
    "没有补充里的真实数字，禁止编造转化率、CTR、百分比。",
    "对比向：cover.leftTitle 是对照对象，cover.rightTitle 固定写 Spark；left 是对照短板，right 是 Spark 能力。禁止对调。",
    "cover.headline 可两行、不超过 18 字；Spark、Sidekick 等品牌名必须写全，禁止出现 Spark vs S。tags 3-5 个，不要 #。",
  ].join("\n");
}

export function buildCopyUserPrompt(params: {
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
  switch (model.provider) {
    case "volc-ark":
      return {
        baseUrl: getEnv("VOLC_ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").replace(
          /\/$/,
          "",
        ),
        apiKey: resolveArkApiKey(),
      };
    case "deepseek":
      return {
        baseUrl: getEnv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1").replace(/\/$/, ""),
        apiKey: getEnv("DEEPSEEK_API_KEY"),
      };
    case "openai":
      return {
        baseUrl: getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
        apiKey: getEnv("OPENAI_API_KEY"),
      };
    default: {
      const _never: never = model.provider;
      throw new Error(`未知文案模型 ${_never}`);
    }
  }
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
