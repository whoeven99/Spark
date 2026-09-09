import {
  invokeCopyChat,
  parseCopyJson,
  resolveCopyModel,
  resolveVisionCopyModel,
  type CopyModelInfo,
} from "./xhsCopyClient.js";
import type { XhsDirection } from "./xhsPlaybooks.js";

export type ReferenceImage = {
  mimeType: string;
  base64: string;
};

export type PublicNoteMeta = {
  title: string;
  description: string;
  imageCount: number;
  finalUrl: string;
  warning: string | null;
};

export type StyleAnalyzeResult = {
  titleSystem: string;
  titleUser: string;
  copySystem: string;
  copyUser: string;
  imagePrompt: string;
  cardSystem: string;
  cardUser: string;
  styleSummary: string;
  source: PublicNoteMeta | null;
  model: string;
  sawImages: boolean;
};

const ALLOWED_HOSTS = new Set([
  "xiaohongshu.com",
  "www.xiaohongshu.com",
  "xhslink.com",
  "www.xhslink.com",
]);

const URL_IN_TEXT = /https?:\/\/[^\s<>"'，。]+/gi;

export function extractXhsUrl(raw: string): string | null {
  const matches = raw.match(URL_IN_TEXT) ?? [];
  for (const item of matches) {
    try {
      const parsed = new URL(item.replace(/[),.;]+$/, ""));
      if (isAllowedHost(parsed.hostname)) return parsed.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return host.endsWith(".xiaohongshu.com") || host.endsWith(".xhslink.com");
}

function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const property = html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    );
    if (property?.[1]) return decodeHtml(property[1]);
    const flipped = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
    );
    if (flipped?.[1]) return decodeHtml(flipped[1]);
  }
  return "";
}

function metaContents(html: string, key: string): string[] {
  const values: string[] = [];
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    "gi",
  );
  for (const match of html.matchAll(re)) {
    if (match[1]) values.push(decodeHtml(match[1]));
  }
  return [...new Set(values)];
}

function decodeHtml(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/ - 小红书$/, "")
    .trim();
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`打开链接失败 HTTP ${res.status}`);
  }
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

async function downloadPublicImage(url: string): Promise<ReferenceImage | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "image/*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 1_800_000) return null;
    const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    const mimeType =
      mime === "image/png" || mime === "image/webp" || mime === "image/gif" ? mime : "image/jpeg";
    return { mimeType, base64: bytes.toString("base64") };
  } catch {
    return null;
  }
}

export async function readPublicNote(rawUrl: string): Promise<{
  meta: PublicNoteMeta;
  images: ReferenceImage[];
}> {
  const extracted = extractXhsUrl(rawUrl);
  if (!extracted) {
    throw new Error("请贴小红书笔记链接（xiaohongshu.com 或 xhslink.com）");
  }
  const first = new URL(extracted);
  if (!isAllowedHost(first.hostname)) {
    throw new Error("只接受小红书公开链接");
  }
  const { html, finalUrl } = await fetchHtml(extracted);
  const finalHost = new URL(finalUrl).hostname;
  if (!isAllowedHost(finalHost)) {
    throw new Error("链接跳到了非小红书域名，已停止");
  }
  const title = metaContent(html, ["og:title", "twitter:title"]).replace(/\s*-\s*小红书$/, "");
  const description = metaContent(html, ["og:description", "description", "twitter:description"]);
  const imageUrls = [
    ...metaContents(html, "og:image"),
    ...metaContents(html, "twitter:image"),
  ].slice(0, 3);
  const images: ReferenceImage[] = [];
  for (const imageUrl of imageUrls) {
    const image = await downloadPublicImage(imageUrl);
    if (image) images.push(image);
  }
  let warning: string | null = null;
  if (!title && !description && images.length === 0) {
    warning = "公开页没有读到标题、简介或封面。把文字和图片贴进来即可。";
  } else if (!description || description.length < 40) {
    warning = "链接多半只有标题和封面，正文请自己贴进来。";
  }
  return {
    meta: {
      title,
      description,
      imageCount: images.length,
      finalUrl,
      warning,
    },
    images,
  };
}

function clipField(value: unknown): string {
  return String(value ?? "").trim().slice(0, 12000);
}

function readAnalyzePayload(raw: unknown): Omit<StyleAnalyzeResult, "source" | "model" | "sawImages"> {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    titleSystem: clipField(obj.titleSystem),
    titleUser: clipField(obj.titleUser),
    copySystem: clipField(obj.copySystem),
    copyUser: clipField(obj.copyUser),
    imagePrompt: clipField(obj.imagePrompt),
    cardSystem: clipField(obj.cardSystem),
    cardUser: clipField(obj.cardUser),
    styleSummary: clipField(obj.styleSummary).slice(0, 400),
  };
}

function buildAnalyzeSystem(): string {
  return [
    "你是小红书风格拆解编辑，给 Spark 运营写可复用提示词。",
    "只输出一个 JSON 对象，不要 Markdown、不要解释。",
    "字段：titleSystem, titleUser, copySystem, copyUser, imagePrompt, cardSystem, cardUser, styleSummary。",
    "拆的是风格和结构，不要抄参考笔记的原句、品牌名、具体数字。",
    "titleSystem / copySystem 写可复用文案规则。titleUser / copyUser 写这次怎么套到 Spark 选题上，用占位写「选题 / 已定标题 / 已定正文」。",
    "cardSystem / cardUser 写滑页画面怎么画：构图、配色、字体气质、模块，不要抄参考图上的字。",
    "imagePrompt 写竖版 3:4 封面怎么画：构图、配色、字体气质、模块，不要要求出现参考图里的真人脸或小红书水印。",
    "参考是对比向就用左右栏；功能向用提示词卡；数据向放大数字。没有图就按文字推断。",
    "styleSummary 用两句中文说明学到了什么。",
  ].join("\n");
}

function buildAnalyzeUser(params: {
  direction: XhsDirection;
  topic: string;
  title: string;
  body: string;
  imageCount: number;
  vision: boolean;
}): string {
  return [
    `我们要发的方向：${params.direction}`,
    `我们要发的选题：${params.topic || "（还没定）"}`,
    `参考标题：${params.title || "（无）"}`,
    `参考正文：\n${params.body || "（无）"}`,
    params.vision
      ? `附图 ${params.imageCount} 张，按图拆封面和滑页视觉。`
      : "当前模型看不到图，封面和滑页提示词按文字风格写。",
    "输出四套提示词，让我们能做出同一气质、但内容是 Spark 的笔记。",
  ].join("\n\n");
}

export async function analyzeReferenceStyle(params: {
  direction: XhsDirection;
  topic: string;
  title: string;
  body: string;
  images: ReferenceImage[];
  copyProvider?: string | null;
}): Promise<{ prompts: Omit<StyleAnalyzeResult, "source" | "model" | "sawImages">; model: CopyModelInfo; sawImages: boolean }> {
  const visionModel = params.images.length > 0 ? resolveVisionCopyModel(params.copyProvider) : null;
  const textModel = resolveCopyModel(params.copyProvider);
  const useVision = Boolean(visionModel && visionModel.provider !== "deepseek" && params.images.length > 0);
  const model = (useVision ? visionModel : textModel);
  if (!model) {
    throw new Error("未配置文案模型，无法分析风格。");
  }

  const userText = buildAnalyzeUser({
    direction: params.direction,
    topic: params.topic,
    title: params.title,
    body: params.body,
    imageCount: params.images.length,
    vision: useVision,
  });
  const user = useVision
    ? [
        { type: "text" as const, text: userText },
        ...params.images.slice(0, 4).map((image) => ({
          type: "image_url" as const,
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        })),
      ]
    : userText;

  const invoked = await invokeCopyChat(model.provider, buildAnalyzeSystem(), user);
  return {
    prompts: readAnalyzePayload(parseCopyJson(invoked.content)),
    model: invoked.model,
    sawImages: useVision,
  };
}
