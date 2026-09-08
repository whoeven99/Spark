import { getEnv } from "../lib/env.js";
import type { XhsCoverSlots, XhsDirection } from "./xhsPlaybooks.js";
import { renderTemplateSvg, svgToImagePayload } from "./xhsTemplateCover.js";

export type CoverModelInfo = {
  provider: "volc-ark" | "volc-visual" | "template";
  model: string;
};

export type CoverImage = {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  base64: string;
};

export function resolveCoverModel(): CoverModelInfo {
  if (readArkKey()) {
    return {
      provider: "volc-ark",
      model: getEnv("VOLC_ARK_IMAGE_MODEL", "doubao-seedream-4-5-251128"),
    };
  }
  if (readVisualKeys()) {
    return {
      provider: "volc-visual",
      model: getEnv("IMAGE_GEN_VOLC_REQ_KEY", "high_aes_general_v20"),
    };
  }
  return { provider: "template", model: "html-template" };
}

export async function generateXhsCover(params: {
  direction: XhsDirection;
  topic: string;
  cover: XhsCoverSlots;
}): Promise<{ image: CoverImage | null; model: CoverModelInfo; error?: string }> {
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

  if (planned.provider === "volc-visual") {
    try {
      const image = await generateViaVisual(prompt, planned.model);
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
    error: "未配置火山文生图密钥（VOLC_ARK_API_KEY 或 HUOSHAN_API_KEY / VOLC_ACCESSKEY），已用模板封面",
  };
}

function readArkKey(): string {
  return (
    getEnv("VOLC_ARK_API_KEY") ||
    getEnv("ARK_API_KEY") ||
    getEnv("VOLCENGINE_ARK_API_KEY")
  );
}

function readVisualKeys(): { accessKeyId: string; secretKey: string } | null {
  const accessKeyId = getEnv("HUOSHAN_API_KEY") || getEnv("VOLC_ACCESSKEY");
  const secretKey = getEnv("HUOSHAN_API_SECRET") || getEnv("VOLC_SECRETKEY");
  if (!accessKeyId || !secretKey) return null;
  return { accessKeyId, secretKey };
}

function buildImagePrompt(params: {
  direction: XhsDirection;
  topic: string;
  cover: XhsCoverSlots;
}): string {
  const { direction, topic, cover } = params;
  const lines = [
    "小红书竖版封面 3:4，信息流缩略图也能看清。",
    "大字少字，高对比，不要段落，不要英文乱码，不要水印。",
    `选题：${topic}`,
    `主标题：${cover.headline || topic}`,
  ];
  if (cover.subhead) lines.push(`副标题：${cover.subhead}`);

  switch (direction) {
    case "howto":
      lines.push(
        "风格：白底知识卡片，左上小标签，中间超大黑字标题，底部一块黑底放短提示词。",
        cover.promptBox ? `黑底文字：${cover.promptBox}` : "",
      );
      break;
    case "compare":
      lines.push(
        "风格：左右对照撕纸卡，左红右青。",
        cover.left.length ? `左侧：${cover.left.join(" / ")}` : "",
        cover.right.length ? `右侧：${cover.right.join(" / ")}` : "",
      );
      break;
    case "data":
      lines.push(
        "风格：黑底，中间一个超大荧光绿数字。",
        cover.metric ? `主数字：${cover.metric}` : "",
        cover.metricNote ? `口径：${cover.metricNote}` : "",
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
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readArkKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "768x1024",
      response_format: "b64_json",
      watermark: false,
    }),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  if (!res.ok) {
    throw new Error(raw.error?.message || `火山方舟 HTTP ${res.status}`);
  }
  const b64 = raw.data?.[0]?.b64_json?.trim();
  if (b64) {
    return { mimeType: "image/png", base64: stripDataUrl(b64) };
  }
  const url = raw.data?.[0]?.url?.trim();
  if (url) {
    return fetchRemoteImage(url);
  }
  throw new Error("火山方舟没有返回图片");
}

async function generateViaVisual(prompt: string, reqKey: string): Promise<CoverImage> {
  const keys = readVisualKeys();
  if (!keys) {
    throw new Error("缺少火山视觉密钥");
  }

  const { Service } = await import("@volcengine/openapi");
  const service = new Service({
    host: "visual.volcengineapi.com",
    serviceName: "cv",
    region: "cn-north-1",
    accessKeyId: keys.accessKeyId,
    secretKey: keys.secretKey,
  });
  const cvProcess = service.createJSONAPI("CVProcess", { Version: "2022-08-31" });
  const raw = (await cvProcess({
    req_key: reqKey,
    prompt,
    width: 768,
    height: 1024,
    return_url: true,
  })) as unknown as Record<string, unknown>;

  const code = raw.code;
  if (typeof code === "number" && code !== 10000) {
    throw new Error(`${code}: ${String(raw.message ?? "火山视觉失败")}`);
  }

  const data =
    raw.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  const urls = asStringList(data.image_urls ?? data.ImageUrls ?? data.image_url ?? data.url);
  if (urls[0]) {
    return fetchRemoteImage(urls[0]);
  }
  const b64List = asStringList(
    data.binary_data_base64 ?? data.BinaryDataBase64 ?? data.binary_data ?? data.image,
  );
  if (b64List[0]) {
    return { mimeType: "image/png", base64: stripDataUrl(b64List[0]) };
  }
  throw new Error("火山视觉没有返回图片");
}

async function fetchRemoteImage(url: string): Promise<CoverImage> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载封面图失败 HTTP ${res.status}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  const mime = (res.headers.get("content-type") || "image/png").split(";")[0];
  const mimeType =
    mime === "image/jpeg" || mime === "image/webp" ? mime : "image/png";
  return { mimeType, base64: bytes.toString("base64") };
}

function stripDataUrl(value: string): string {
  const idx = value.indexOf("base64,");
  return idx >= 0 ? value.slice(idx + 7) : value;
}

function asStringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}
