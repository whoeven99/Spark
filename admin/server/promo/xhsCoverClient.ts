import { getEnv } from "../lib/env.js";
import { emptyCoverSlots, type XhsCoverSlots, type XhsDirection } from "./xhsPlaybooks.js";
import { renderTemplateSvg, svgToImagePayload } from "./xhsTemplateCover.js";

export type CoverProvider = "volc-ark" | "openai" | "template";

export type CoverModelInfo = {
  provider: CoverProvider;
  model: string;
};

const COVER_PROVIDERS: readonly CoverProvider[] = ["volc-ark", "openai", "template"];

function isCoverProvider(value: string): value is CoverProvider {
  return COVER_PROVIDERS.includes(value as CoverProvider);
}

export type CoverImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  base64: string;
};

export function listCoverModels(): CoverModelInfo[] {
  const options: CoverModelInfo[] = [];
  if (resolveArkApiKey()) {
    options.push({
      provider: "volc-ark",
      model: getEnv("VOLC_ARK_IMAGE_MODEL", "doubao-seedream-5-0-pro-260628"),
    });
  }
  if (resolveImageApiKey()) {
    options.push({
      provider: "openai",
      model: resolveImageModel(),
    });
  }
  options.push({ provider: "template", model: "html-template" });
  return options;
}

export function resolveCoverModel(preferred?: string | null): CoverModelInfo {
  const options = listCoverModels();
  if (preferred && isCoverProvider(preferred)) {
    const hit = options.find((item) => item.provider === preferred);
    if (hit) return hit;
  }
  return options.find((item) => item.provider === "volc-ark") ?? options[0] ?? {
    provider: "template",
    model: "html-template",
  };
}

export async function generateXhsCover(params: {
  direction: XhsDirection;
  topic: string;
  cover: XhsCoverSlots;
  provider?: string | null;
  imagePrompt?: string | null;
}): Promise<{ image: CoverImage; model: CoverModelInfo; error?: string }> {
  const planned = resolveCoverModel(params.provider);
  const prompt = params.imagePrompt?.trim() || buildImagePrompt(params);
  const templateImage = svgToImagePayload(renderTemplateSvg(params));

  switch (planned.provider) {
    case "volc-ark":
      try {
        const image = await generateViaArk(prompt, planned.model);
        return { image, model: planned };
      } catch (error) {
        return {
          image: templateImage,
          model: { provider: "template", model: "html-template" },
          error: error instanceof Error ? error.message : String(error),
        };
      }
    case "openai":
      try {
        const image = await generateViaOpenAi(prompt, planned.model);
        return { image, model: planned };
      } catch (error) {
        return {
          image: templateImage,
          model: { provider: "template", model: "html-template" },
          error: error instanceof Error ? error.message : String(error),
        };
      }
    case "template":
      return { image: templateImage, model: planned };
    default: {
      const _never: never = planned.provider;
      return { image: templateImage, model: planned, error: `未知封面模型 ${_never}` };
    }
  }
}

function resolveArkApiKey(): string {
  return getEnv("VOLC_ARK_API_KEY") || getEnv("ARK_API_KEY");
}

function resolveImageApiKey(): string {
  return getEnv("OPENAI_IMAGE_API_KEY") || getEnv("OPENAI_API_KEY");
}

function resolveImageModel(): string {
  return getEnv("OPENAI_IMAGE_MODEL") || getEnv("OPENAI_DALLE_MODEL") || "gpt-image-2";
}

function resolveBaseUrl(): string {
  const raw =
    getEnv("OPENAI_IMAGE_BASE_URL") ||
    getEnv("OPENAI_BASE_URL") ||
    getEnv("OPENAI_API_BASE") ||
    "https://api.openai.com/v1";
  let base = raw.replace(/\/+$/, "");
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`;
  }
  return base;
}

function resolveImagesPostUrl(): string {
  const base = resolveBaseUrl();
  if (base.includes("/images/generations")) {
    return base;
  }
  let url = `${base}/images/generations`;
  const apiVersion = getEnv("OPENAI_IMAGE_API_VERSION");
  if (apiVersion) {
    url += `${url.includes("?") ? "&" : "?"}api-version=${encodeURIComponent(apiVersion)}`;
  }
  return url;
}

function isGptImageModel(model: string): boolean {
  return model.toLowerCase().startsWith("gpt-image");
}

function resolveImageSize(model: string): string {
  const explicit = getEnv("IMAGE_GEN_SIZE");
  if (explicit) return explicit;
  if (isGptImageModel(model)) return "1024x1536";
  return "1024x1792";
}

const XHS_COVER_UI = [
  "视觉系统：瑞士国际主义信息卡 / 知识卡片，扁平、网格、高留白。",
  "不是手账、不是贴纸拼贴、不是马克笔涂鸦、不是真人自拍、不是海报、不是科技蓝发光。",
  "竖版 3:4。只准三色：纯黑、白或浅灰底、荧光黄绿 #C8FF00。无阴影、无渐变、无照片底图。",
  "细横线分割页眉、标题、模块、页脚。左上角小灰字系列名，右上角页码 01 / 09。",
  "主标题：超大加粗无衬线，可折成 2 行，必须写全指定原文，禁止截断单词或品牌名（不要出现 Spark vs S）。",
  "点缀只用荧光绿：小标签（PROMPT / TOOL / PAIN）、左侧竖条引用、页码旁的强调字。",
  "中文必须印刷体、锐利、不连笔、不糊、不乱码；不要发明大段英文。",
  "不要水印、不要小红书 Logo、不要二维码、不要柱状图折线图。",
].join("\n");

function compareHeadlineLock(
  direction: XhsDirection,
  cover: XhsCoverSlots,
  headline: string,
): string {
  if (direction !== "compare") {
    return `封面主标题必须完整写在图上，可折两行，不要改写、不要截断：${headline}`;
  }
  const left = `${cover.leftTitle || "对照"} ${cover.leftHook || ""}`.trim();
  const right = `${cover.rightTitle || "Spark"} ${cover.rightHook || ""}`.trim();
  if (cover.leftHook && cover.rightHook) {
    return [
      "对比主标题必须写成对称两行，字号一样大，每行都是「名字+动作」：",
      `第一行：${left}`,
      `第二行：${right}`,
      "禁止第二行只剩品牌名。禁止一边有动词、一边没有。",
    ].join("\n");
  }
  return [
    `对比主标题必须是成对区别句，两边都有动作：${headline}`,
    "不要写成「Sidekick只动嘴」下面只跟一个 Spark。",
  ].join("\n");
}

export function previewImagePrompt(direction: XhsDirection, topic: string): string {
  return buildImagePrompt({
    direction,
    topic,
    cover: emptyCoverSlots(),
  });
}

export function buildImagePrompt(params: {
  direction: XhsDirection;
  topic: string;
  cover: XhsCoverSlots;
}): string {
  const { direction, topic, cover } = params;
  const headline = cover.headline || topic;
  const lines = [
    "生成一张可直接发小红书的竖版封面。",
    XHS_COVER_UI,
    `选题：${topic}`,
    `封面主标题原文：${headline}`,
    compareHeadlineLock(direction, cover, headline),
  ];
  if (cover.subhead) {
    lines.push(`引用句（标题下，左侧一条荧光绿竖条）：${cover.subhead}`);
  }

  switch (direction) {
    case "howto":
      lines.push(
        "构图：白底 Prompt 知识卡。",
        "上：荧光绿小标签（如 PROMPT 01）+ 超大黑标题。",
        "中：纯黑大矩形，顶边一条荧光绿，框内白字很少，只放指定提示词，不要写成说明书。",
        "下：三列规格栏，细竖线分隔，每列上灰小标签 + 下黑短词。",
        cover.promptBox ? `黑框里的字：${cover.promptBox}` : "",
      );
      break;
    case "compare":
      lines.push(
        "构图：左右两栏信息卡。左边对照对象，右边 Spark。栏目标题必须原样写上。",
        `左边栏标题（对照/旧方法，不要写 Spark）：${cover.leftTitle || "对照"}`,
        `右边栏标题（必须是推荐方）：${cover.rightTitle || "Spark"}`,
        cover.left.length ? `左边短词必须原样、一条都不要改：${cover.left.join(" / ")}` : "",
        cover.right.length ? `右边短词必须原样、一条都不要改：${cover.right.join(" / ")}` : "",
        "禁止左右对调品牌。禁止把 Spark 放左边或打叉。禁止把对照对象画成赢家。",
        "不要红叉绿勾，不要手机截图，不要自己编优缺点，不要截断英文品牌名。",
      );
      break;
    case "data":
      lines.push(
        "构图：结果封面。优先荧光绿满铺底 + 黑色超大数字；或纯黑底 + 荧光绿大数字。",
        "数字是唯一视觉中心，标题小一号压在上方。底栏三列小字规格即可。",
        "不要仪表盘、不要Excel、不要手机实物照片。",
        cover.metric ? `必须醒目写出的数字：${cover.metric}` : "",
        cover.metricNote ? `数字下方小字口径：${cover.metricNote}` : "",
      );
      break;
    default: {
      const _never: never = direction;
      return _never;
    }
  }

  return lines.filter(Boolean).join("\n");
}

async function generateViaArk(prompt: string, model: string): Promise<CoverImage> {
  const base = getEnv("VOLC_ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3").replace(
    /\/$/,
    "",
  );
  const size = getEnv("VOLC_ARK_IMAGE_SIZE", "2K");
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveArkApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      response_format: "url",
      size,
      stream: false,
      watermark: false,
    }),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    data?: Array<{ url?: string; b64_json?: string }>;
  };
  if (!res.ok) {
    throw new Error(raw.error?.message || `方舟文生图 HTTP ${res.status}`);
  }
  const url = raw.data?.[0]?.url?.trim();
  if (url) {
    return fetchRemoteImage(url);
  }
  const b64 = raw.data?.[0]?.b64_json?.trim();
  if (b64) {
    return { mimeType: "image/png", base64: stripDataUrl(b64) };
  }
  throw new Error("方舟文生图没有返回图片");
}

async function generateViaOpenAi(prompt: string, model: string): Promise<CoverImage> {
  const apiKey = resolveImageApiKey();
  const postUrl = resolveImagesPostUrl();
  const size = resolveImageSize(model);
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
    size,
  };
  if (!isGptImageModel(model)) {
    body.response_format = "b64_json";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (postUrl.includes(".openai.azure.com") || postUrl.includes("cognitiveservices.azure.com")) {
    headers["api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(postUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  if (!res.ok) {
    throw new Error(raw.error?.message || `GPT 文生图 HTTP ${res.status}`);
  }

  const b64 = raw.data?.[0]?.b64_json?.trim();
  if (b64) {
    return { mimeType: "image/png", base64: stripDataUrl(b64) };
  }
  const url = raw.data?.[0]?.url?.trim();
  if (url) {
    return fetchRemoteImage(url);
  }
  throw new Error("GPT 文生图没有返回图片");
}

async function fetchRemoteImage(url: string): Promise<CoverImage> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载封面图失败 HTTP ${res.status}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const mime = (res.headers.get("content-type") || "image/png").split(";")[0];
  const mimeType = mime === "image/jpeg" || mime === "image/webp" ? mime : "image/png";
  return { mimeType, base64: bytes.toString("base64") };
}

function stripDataUrl(value: string): string {
  const idx = value.indexOf("base64,");
  return idx >= 0 ? value.slice(idx + 7) : value;
}
