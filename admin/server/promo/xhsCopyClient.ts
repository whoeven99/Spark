import { getEnv } from "../lib/env.js";
import {
  cardPlaybookHint,
  findBannedHit,
  normalizeCardSlots,
  normalizeDraft,
  normalizeTitles,
  playbookHint,
  scrubBanned,
  titlePlaybookHint,
  type XhsContentCard,
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

function requireCopyModel(provider?: string | null): CopyModelInfo {
  const resolved = resolveCopyModel(provider);
  if (!resolved) {
    throw new Error(
      arkCopyHint() || "未配置可用的文案模型。豆包需要 VOLC_ARK_TEXT_MODEL（对话 Model ID 或 ep-），或配置 DEEPSEEK_API_KEY / OPENAI_API_KEY。",
    );
  }
  return resolved;
}

export async function generateXhsTitles(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  provider?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
}): Promise<{ titles: string[]; model: CopyModelInfo }> {
  const resolved = requireCopyModel(params.provider);
  const system = params.systemPrompt?.trim() || buildTitleSystemPrompt();
  const user = params.userPrompt?.trim() || buildTitleUserPrompt(params);
  const content = await invokeChat(resolved, system, user);
  const titles = normalizeTitles(parseJsonObject(content), params.topic).map((item) =>
    findBannedHit(item) ? scrubBanned(item) : item,
  );
  return { titles, model: resolved };
}

export async function generateXhsCopy(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  title: string;
  provider?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
}): Promise<{ draft: XhsCopyDraft; model: CopyModelInfo }> {
  const resolved = requireCopyModel(params.provider);
  const lockedTitle = params.title.trim() || params.topic;
  const system = params.systemPrompt?.trim() || buildCopySystemPrompt();
  const user = params.userPrompt?.trim() || buildCopyUserPrompt({
    ...params,
    title: lockedTitle,
  });
  const content = await invokeChat(resolved, system, user);
  const draft = normalizeDraft(parseJsonObject(content), lockedTitle);
  draft.title = lockedTitle.slice(0, 18);
  const bannedSource = [draft.title, draft.body, draft.cover.headline].join("\n");
  if (findBannedHit(bannedSource)) {
    draft.title = scrubBanned(draft.title);
    draft.body = scrubBanned(draft.body);
    draft.cover.headline = scrubBanned(draft.cover.headline);
  }
  return { draft, model: resolved };
}

export async function generateXhsCardSlots(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  title: string;
  body: string;
  provider?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
}): Promise<{ cards: XhsContentCard[]; model: CopyModelInfo }> {
  const resolved = requireCopyModel(params.provider);
  const title = params.title.trim() || params.topic;
  const system = params.systemPrompt?.trim() || buildCardSystemPrompt();
  const user = params.userPrompt?.trim() || buildCardUserPrompt({
    ...params,
    title,
  });
  const content = await invokeChat(resolved, system, user);
  const parsed = parseJsonObject(content);
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const cards = normalizeCardSlots(obj.cards ?? parsed, title, params.body).map((card) => ({
    headline: findBannedHit(card.headline) ? scrubBanned(card.headline) : card.headline,
    lines: card.lines.map((line) => (findBannedHit(line) ? scrubBanned(line) : line)),
  }));
  return { cards, model: resolved };
}

export function buildTitleSystemPrompt(): string {
  return [
    "你是小红书标题编辑，给 Shopify AI 插件 Spark 写推广笔记标题。",
    "只输出一个 JSON 对象，不要 Markdown、不要解释。",
    "字段：titles，必须是 5 个互不相同的标题字符串。",
    "每个标题 ≤14 字，必须有钩子，禁止只写两个品牌名对打。",
    "禁用：最、第一、100%、神仙、宝藏、绝对、保证。",
    "没有补充里的真实数字，禁止编造转化率、CTR、百分比。",
  ].join("\n");
}

export function buildTitleUserPrompt(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
}): string {
  const notes = params.notes.trim() || "（无补充）";
  return [
    `方向：${params.direction}`,
    titlePlaybookHint(params.direction),
    `选题：${params.topic}`,
    `补充：${notes}`,
    "按这个选题给出 5 个可直接发的标题，不要解释。",
  ].join("\n\n");
}

export function buildCopySystemPrompt(): string {
  return [
    "你是小红书图文编辑，给 Shopify AI 插件 Spark 写推广笔记正文。",
    "只输出一个 JSON 对象，不要 Markdown、不要解释。",
    "字段：body, tags, cover.*。不要输出 title，不要输出 cards。",
    "语气像真人店主，短句换行。禁用：最、第一、100%、神仙、宝藏、绝对、保证。",
    "body 200-400 字，前 80 字必须是钩子。细节留给滑页，不要写成说明书。",
    "没有补充里的真实数字，禁止编造转化率、CTR、百分比。",
    "对比向：cover.leftTitle 是对照对象，cover.rightTitle 固定写 Spark；leftHook/rightHook 各一个动作，如只动嘴/能改店。禁止第二行只写品牌名。",
    "cover.headline 写成「只动嘴 vs 能改店」这种成对句，不要「Sidekick只动嘴」后只跟 Spark。tags 3-5 个，不要 #。",
  ].join("\n");
}

export function buildCopyUserPrompt(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  title: string;
}): string {
  const notes = params.notes.trim() || "（无补充）";
  return [
    `方向：${params.direction}`,
    playbookHint(params.direction),
    `选题：${params.topic}`,
    `已确定标题（不要改写）：${params.title}`,
    `补充：${notes}`,
    "只写正文、话题和封面槽。不要再给标题，不要写滑页卡片。",
  ].join("\n\n");
}

export function buildCardSystemPrompt(): string {
  return [
    "你是小红书滑页卡片编辑，只写给图片排版用的短句，不写笔记正文。",
    "只输出一个 JSON 对象，不要 Markdown、不要解释。",
    "字段：cards，2-4 张。",
    "每张 card：headline ≤10 字，lines 2-4 条、每条≤16 字。",
    "不要把正文原样塞进卡片。禁用：最、第一、100%、神仙、宝藏、绝对、保证。",
    "没有补充里的真实数字，禁止编造转化率、CTR、百分比。",
  ].join("\n");
}

export function buildCardUserPrompt(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  title: string;
  body: string;
}): string {
  const notes = params.notes.trim() || "（无补充）";
  const body = params.body.trim() || "（正文未定）";
  return [
    `方向：${params.direction}`,
    cardPlaybookHint(params.direction),
    `选题：${params.topic}`,
    `已确定标题：${params.title}`,
    `已确定正文：\n${body}`,
    `补充：${notes}`,
    "只输出 cards。不要重写标题或正文。",
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
