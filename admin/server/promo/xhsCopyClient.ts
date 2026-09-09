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

const TITLE_JSON_CONTRACT =
  "只输出一个 JSON 对象，不要 Markdown、不要解释。字段：titles，必须是 5 个互不相同的标题字符串。";

export async function generateXhsTitles(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  provider?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
}): Promise<{ titles: string[]; model: CopyModelInfo }> {
  const resolved = requireCopyModel(params.provider);
  const system = ensureJsonContract(params.systemPrompt?.trim() || buildTitleSystemPrompt(), TITLE_JSON_CONTRACT);
  const user = params.userPrompt?.trim()
    ? [
        params.userPrompt.trim(),
        `当前选题：${params.topic}`,
        `补充：${params.notes.trim() || "（无）"}`,
        TITLE_JSON_CONTRACT,
      ].join("\n\n")
    : buildTitleUserPrompt(params);
  const content = await invokeChat(resolved, system, user);
  const titles = normalizeTitles(parseTitlesPayload(content), params.topic).map((item) =>
    findBannedHit(item) ? scrubBanned(item) : item,
  );
  return { titles, model: resolved };
}

const COPY_JSON_CONTRACT =
  "只输出一个 JSON 对象，不要 Markdown、不要解释。字段：body, tags, cover。不要输出 title，不要输出 cards。";

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
  const system = ensureJsonContract(params.systemPrompt?.trim() || buildCopySystemPrompt(), COPY_JSON_CONTRACT);
  const user = params.userPrompt?.trim()
    ? [
        params.userPrompt.trim(),
        `当前选题：${params.topic}`,
        `已确定标题（不要改写）：${lockedTitle}`,
        `补充：${params.notes.trim() || "（无）"}`,
        COPY_JSON_CONTRACT,
      ].join("\n\n")
    : buildCopyUserPrompt({
        ...params,
        title: lockedTitle,
      });
  const content = await invokeChat(resolved, system, user);
  const draft = normalizeDraft(parseCopyPayload(content), lockedTitle);
  if (!draft.body.trim()) {
    throw new Error("文案模型没有返回正文");
  }
  draft.title = lockedTitle.slice(0, 18);
  const bannedSource = [draft.title, draft.body, draft.cover.headline].join("\n");
  if (findBannedHit(bannedSource)) {
    draft.title = scrubBanned(draft.title);
    draft.body = scrubBanned(draft.body);
    draft.cover.headline = scrubBanned(draft.cover.headline);
  }
  return { draft, model: resolved };
}

const CARD_JSON_CONTRACT = "只输出一个 JSON 对象，不要 Markdown、不要解释。字段：cards，必须是 2-4 张。";

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
  const system = ensureJsonContract(params.systemPrompt?.trim() || buildCardSystemPrompt(), CARD_JSON_CONTRACT);
  const user = params.userPrompt?.trim()
    ? [
        params.userPrompt.trim(),
        `已确定标题：${title}`,
        `已确定正文：\n${params.body.trim() || "（正文未定）"}`,
        CARD_JSON_CONTRACT,
      ].join("\n\n")
    : buildCardUserPrompt({
        ...params,
        title,
      });
  const content = await invokeChat(resolved, system, user);
  let parsed: unknown = {};
  try {
    parsed = parseJsonObject(content);
  } catch {
    parsed = {};
  }
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

export function buildCardVisualSystemPrompt(): string {
  return [
    "你是小红书滑页画面导演，写可复用的竖版 3:4 信息卡视觉规则。",
    "写构图、配色、字体气质、模块和页码，不要要求真人脸、小红书水印或制作说明。",
    "文字内容另说，这里只管画面怎么画。",
  ].join("\n");
}

export function buildCardVisualUserPrompt(params: {
  direction: XhsDirection;
  topic: string;
  notes: string;
  title: string;
}): string {
  const notes = params.notes.trim() || "（无补充）";
  return [
    `方向：${params.direction}`,
    cardPlaybookHint(params.direction),
    `选题：${params.topic}`,
    `已确定标题：${params.title}`,
    `补充：${notes}`,
    "按这个选题写滑页画面。不要输出 JSON，不要写制作说明。",
  ].join("\n\n");
}

export function isCardCopyPrompt(text: string | null | undefined): boolean {
  const value = String(text ?? "");
  return value.includes("字段：cards") || value.includes("只输出一个 JSON");
}

export type ChatUserContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export async function invokeCopyChat(
  provider: string | null | undefined,
  system: string,
  user: ChatUserContent,
): Promise<{ content: string; model: CopyModelInfo }> {
  const resolved = requireCopyModel(provider);
  const content = await invokeChat(resolved, system, user);
  return { content, model: resolved };
}

export function parseCopyJson(text: string): unknown {
  return parseJsonObject(text);
}

export function resolveVisionCopyModel(preferred?: string | null): CopyModelInfo | null {
  const options = listCopyModels();
  const openai = options.find((item) => item.provider === "openai");
  if (openai) return openai;
  const ark = options.find((item) => item.provider === "volc-ark");
  if (ark) return ark;
  return resolveCopyModel(preferred);
}

async function invokeChat(model: CopyModelInfo, system: string, user: ChatUserContent): Promise<string> {
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
      ...(model.provider === "deepseek" || model.provider === "openai"
        ? { response_format: { type: "json_object" } }
        : {}),
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

function ensureJsonContract(system: string, contract: string): string {
  if (/只输出一个 JSON|JSON 对象/.test(system)) return system;
  return `${system.trim()}\n\n${contract}`;
}

function parseTitlesPayload(text: string): unknown {
  try {
    return parseJsonObject(text);
  } catch {
    const extracted = extractTitlesFromText(text);
    if (extracted.length === 0) {
      throw new Error("文案模型没有返回 JSON");
    }
    return { titles: extracted };
  }
}

function parseCopyPayload(text: string): unknown {
  try {
    return parseJsonObject(text);
  } catch {
    const body = extractCopyBody(text);
    if (!body) {
      throw new Error("文案模型没有返回 JSON");
    }
    return { body };
  }
}

function extractCopyBody(text: string): string {
  const quoted = text.match(/"body"\s*:\s*"([\s\S]*?)"\s*[,}]/);
  if (quoted?.[1]) {
    const unescaped = quoted[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
    if (unescaped.length >= 40) return unescaped.slice(0, 480);
  }
  const stripped = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*(?:好的[，,]?|以下是|这是)[^\n]*\n/, "")
    .trim();
  if (stripped.length >= 40) return stripped.slice(0, 480);
  return "";
}

function extractTitlesFromText(text: string): string[] {
  const titles: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .replace(/^\s*(?:\d+[\.\)、]|[-*•])\s*/, "")
      .replace(/^["「『]|["」』]$/g, "")
      .trim();
    if (cleaned.length < 2 || cleaned.length > 24) continue;
    if (/^(只输出|字段|方向|选题|补充|JSON|titles)/i.test(cleaned)) continue;
    titles.push(cleaned);
  }
  return [...new Set(titles)].slice(0, 5);
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = (fenced?.[1] ?? text).trim();
  const objStart = payload.indexOf("{");
  const objEnd = payload.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    const parsed = tryParseJson(payload.slice(objStart, objEnd + 1));
    if (parsed !== undefined) return parsed;
  }
  const arrStart = payload.indexOf("[");
  const arrEnd = payload.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    const parsed = tryParseJson(payload.slice(arrStart, arrEnd + 1));
    if (parsed !== undefined) return parsed;
  }
  throw new Error("文案模型没有返回 JSON");
}

function tryParseJson(slice: string): unknown | undefined {
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    const repaired = slice.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired) as unknown;
    } catch {
      return undefined;
    }
  }
}
