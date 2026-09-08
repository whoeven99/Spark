import { getEnv } from "../lib/env.js";
import type { XhsCoverSlots, XhsDirection } from "./xhsPlaybooks.js";
import { renderTemplateSvg, svgToImagePayload } from "./xhsTemplateCover.js";

export type CoverModelInfo = {
  provider: "openai" | "template";
  model: string;
};

export type CoverImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  base64: string;
};

export function resolveCoverModel(): CoverModelInfo {
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

  if (planned.provider !== "openai") {
    return {
      image: templateImage,
      model: planned,
      error: "未配置 GPT 文生图（OPENAI_IMAGE_API_KEY 或 OPENAI_API_KEY），已用模板封面",
    };
  }

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
  const lines = [
    "Xiaohongshu vertical cover 3:4, readable as a small thumbnail.",
    "Big short Chinese text, high contrast, no paragraphs, no watermark, no garbled English.",
    `Topic: ${topic}`,
    `Headline: ${cover.headline || topic}`,
  ];
  if (cover.subhead) lines.push(`Subhead: ${cover.subhead}`);

  switch (direction) {
    case "howto":
      lines.push(
        "Style: white knowledge card, small label top-left, huge black title, black box at bottom for a short prompt.",
        cover.promptBox ? `Black box text: ${cover.promptBox}` : "",
      );
      break;
    case "compare":
      lines.push(
        "Style: left-right comparison card, red left and teal right.",
        cover.left.length ? `Left: ${cover.left.join(" / ")}` : "",
        cover.right.length ? `Right: ${cover.right.join(" / ")}` : "",
      );
      break;
    case "data":
      lines.push(
        "Style: black background, one huge lime-green number in the center.",
        cover.metric ? `Metric: ${cover.metric}` : "",
        cover.metricNote ? `Caption: ${cover.metricNote}` : "",
      );
      break;
    default: {
      const _never: never = direction;
      return _never;
    }
  }

  return lines.filter(Boolean).join("\n");
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
