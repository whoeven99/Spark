import { getEnv } from "../lib/env.js";
import type { XhsCoverSlots, XhsDirection } from "./xhsPlaybooks.js";
import { renderTemplateSvg, svgToImagePayload } from "./xhsTemplateCover.js";

export type CoverModelInfo = {
  provider: "volc-ark" | "openai" | "template";
  model: string;
};

export type CoverImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  base64: string;
};

export function resolveCoverModel(): CoverModelInfo {
  if (resolveArkApiKey()) {
    return {
      provider: "volc-ark",
      model: getEnv("VOLC_ARK_IMAGE_MODEL", "doubao-seedream-5-0-pro-260628"),
    };
  }
  if (resolveImageApiKey()) {
    return {
      provider: "openai",
      model: resolveImageModel(),
    };
  }
  return { provider: "template", model: "html-template" };
}

export async function generateXhsCover(params: {
  direction: XhsDirection;
  topic: string;
  cover: XhsCoverSlots;
}): Promise<{ image: CoverImage; model: CoverModelInfo; error?: string }> {
  const planned = resolveCoverModel();
  const prompt = buildImagePrompt(params);
  const templateImage = svgToImagePayload(renderTemplateSvg(params));

  if (planned.provider === "volc-ark") {
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
  }

  if (planned.provider === "openai") {
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
  }

  return {
    image: templateImage,
    model: planned,
    error: "未配置 VOLC_ARK_API_KEY，已用模板封面",
  };
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

function buildImagePrompt(params: {
  direction: XhsDirection;
  topic: string;
  cover: XhsCoverSlots;
}): string {
  const { direction, topic, cover } = params;
  const headline = cover.headline || topic;
  const lines = [
    "生成一张小红书爆款图文封面，不是海报、不是PPT、不是知识付费课件、不是企业宣传图。",
    "画幅竖版 3:4（1080x1440 观感），缩略图也能一眼看清主标题。",
    "气质像真人店主随手做的笔记封面：生活感、手账感、高信息密度但字很少。",
    "常见爆款元素可少量使用：便签纸、高光马克笔、手写批注、贴纸、胶带、手机截图碎片、对比色色块。",
    "中文大字为主，印刷体或手写标题均可，必须清晰、不连笔糊、不乱码、不发明英文段落。",
    "主标题只放下面指定的那几个字，字要巨大，占画面上半或视觉中心。",
    "高对比、干净背景或轻度纸纹理，避免灰雾、避免复杂长文、避免水印、避免小红书 Logo、避免二维码。",
    "不要真人正脸特写，不要网红摆拍，不要科技蓝发光背景，不要仪表盘数据大屏。",
    `选题：${topic}`,
    `封面主标题（必须完整、清晰地写在图上）：${headline}`,
  ];
  if (cover.subhead) {
    lines.push(`副标题（小一号，一句痛点）：${cover.subhead}`);
  }

  switch (direction) {
    case "howto":
      lines.push(
        "构图：教程/干货卡。左上角小标签如「保姆级」或「3步」，中间超大标题，下方一块深色提示词框。",
        "像「收藏了就会用」的小红书教学封面，有步骤感，但画面上最多 3 个短词，不要写成说明书。",
        cover.promptBox ? `底部提示词框里的字：${cover.promptBox}` : "",
      );
      break;
    case "compare":
      lines.push(
        "构图：左右对照爆款封面。左边旧方法偏红/叉，右边新方法偏绿/对勾，中间或顶部超大标题。",
        "像小红书常见的「别再用A，改用B」封面，生活化色块，不要商务信息图。",
        cover.left.length ? `左边短词：${cover.left.join(" / ")}` : "",
        cover.right.length ? `右边短词：${cover.right.join(" / ")}` : "",
      );
      break;
    case "data":
      lines.push(
        "构图：结果卡。画面只强调一个巨大数字，其余都是衬托。",
        "像小红书「用了之后」封面：数字最大、口径一行小字，可用圆圈、高光笔、便签把数字圈出来。",
        "不要柱状图、折线图、Excel、后台截图表格。",
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
