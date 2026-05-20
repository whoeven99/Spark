import {
  DEFAULT_IMAGE_GEN_HEIGHT,
  DEFAULT_IMAGE_GEN_WIDTH,
  IMAGE_GENERATION_LOG_PREFIX,
} from "./constants.server";

const LOG_PREFIX = `${IMAGE_GENERATION_LOG_PREFIX}[OpenAI]`;

const DALLE3_SIZES = ["1024x1024", "1792x1024", "1024x1792"] as const;
type Dalle3Size = (typeof DALLE3_SIZES)[number];

const GPT_IMAGE_POPULAR_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
] as const;

export type OpenAiImageGenerateFailure = {
  ok: false;
  reasonCode: string;
  detail?: string;
};

export type OpenAiImageGenerateOk = { ok: true; bytes: Buffer };

function isGptImageModel(model: string): boolean {
  return model.toLowerCase().startsWith("gpt-image");
}

export function isOpenAiImageConfigured(): boolean {
  return Boolean(resolveImageApiKey());
}

function resolveImageApiKey(): string | undefined {
  return (
    process.env.OPENAI_IMAGE_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    undefined
  );
}

function resolveBaseUrl(): string {
  const raw =
    process.env.OPENAI_IMAGE_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.OPENAI_API_BASE?.trim() ||
    "https://api.openai.com/v1";
  let base = raw.replace(/\/+$/, "");
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`;
  }
  return base;
}

function resolveImagesPostUrl(): string {
  const endpoint = process.env.OPENAI_IMAGE_ENDPOINT?.trim();
  if (endpoint) {
    return endpoint;
  }

  const base = resolveBaseUrl();
  // 兼容把完整 Azure 地址误填在 OPENAI_IMAGE_BASE_URL 的情况
  if (base.includes("/images/generations")) {
    return base;
  }

  const apiVersion = process.env.OPENAI_IMAGE_API_VERSION?.trim();
  let url = `${base}/images/generations`;
  if (apiVersion) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}api-version=${encodeURIComponent(apiVersion)}`;
  }
  return url;
}

function resolveImageModel(): string {
  return (
    process.env.OPENAI_IMAGE_MODEL?.trim() ||
    process.env.OPENAI_DALLE_MODEL?.trim() ||
    "gpt-image-2"
  );
}

function resolveImageSize(model: string): string {
  const explicit = process.env.IMAGE_GEN_SIZE?.trim();
  if (explicit) {
    return explicit;
  }

  const width = Number(process.env.IMAGE_GEN_WIDTH ?? DEFAULT_IMAGE_GEN_WIDTH);
  const height = Number(process.env.IMAGE_GEN_HEIGHT ?? DEFAULT_IMAGE_GEN_HEIGHT);

  if (isGptImageModel(model)) {
    if (height > width * 1.2) return "1024x1536";
    if (width > height * 1.2) return "1536x1024";
    return "1024x1024";
  }

  if (width > height * 1.2) return "1792x1024";
  if (height > width * 1.2) return "1024x1792";
  return "1024x1024";
}

function resolveImageQuality(model: string): string | undefined {
  const raw = process.env.OPENAI_IMAGE_QUALITY?.trim();
  if (!raw) return undefined;

  if (isGptImageModel(model)) {
    if (raw === "hd") return "high";
    if (raw === "standard") return "medium";
    if (["low", "medium", "high", "auto"].includes(raw)) return raw;
    return raw;
  }

  if (raw === "high") return "hd";
  if (raw === "medium" || raw === "low") return "standard";
  if (raw === "hd" || raw === "standard") return raw;
  return undefined;
}

function buildImageRequestBody(params: {
  prompt: string;
  model: string;
  size: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
  };

  const quality = resolveImageQuality(params.model);
  if (quality) {
    body.quality = quality;
  }

  // gpt-image 系列（含 Azure）不支持 response_format，默认返回 base64
  if (!isGptImageModel(params.model)) {
    body.response_format = "b64_json";
    const style = process.env.OPENAI_IMAGE_STYLE?.trim();
    if (style === "vivid" || style === "natural") {
      body.style = style;
    }
  }

  return body;
}

function buildAuthHeaders(apiKey: string, postUrl: string): Record<string, string> {
  const style = process.env.OPENAI_IMAGE_AUTH_STYLE?.trim().toLowerCase();
  const useApiKeyHeader =
    style === "api-key" ||
    (style !== "bearer" &&
      (postUrl.includes(".openai.azure.com") ||
        postUrl.includes("cognitiveservices.azure.com")));

  if (useApiKeyHeader) {
    return { "api-key": apiKey };
  }
  return { Authorization: `Bearer ${apiKey}` };
}

type OpenAiImagesResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string; code?: string; type?: string };
};

async function fetchImageBytesFromUrl(
  url: string,
): Promise<OpenAiImageGenerateOk | OpenAiImageGenerateFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reasonCode: "openai_image_fetch_failed",
        detail: String(res.status),
      };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) {
      return { ok: false, reasonCode: "openai_empty_image" };
    }
    return { ok: true, bytes };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reasonCode: "openai_image_fetch_failed", detail };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI Images API（gpt-image-2 / DALL·E 等，兼容自定义 BASE_URL）。
 * @see https://platform.openai.com/docs/api-reference/images/create
 */
export async function openAiGenerateImageToBytes(params: {
  prompt: string;
}): Promise<OpenAiImageGenerateOk | OpenAiImageGenerateFailure> {
  const apiKey = resolveImageApiKey();
  if (!apiKey) {
    return { ok: false, reasonCode: "openai_credentials_missing" };
  }

  const postUrl = resolveImagesPostUrl();
  const model = resolveImageModel();
  const size = resolveImageSize(model);

  const body = buildImageRequestBody({
    prompt: params.prompt,
    model,
    size,
  });

  const authHeaders = buildAuthHeaders(apiKey, postUrl);

  console.info(
    `${LOG_PREFIX} request model=${model} size=${size} postUrl=${postUrl} promptLen=${params.prompt.length}`,
  );

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(postUrl, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} fetch threw detail=${detail}`);
    return { ok: false, reasonCode: "openai_request_failed", detail };
  }

  const responseText = await res.text();
  let parsed: OpenAiImagesResponse;
  try {
    parsed = JSON.parse(responseText) as OpenAiImagesResponse;
  } catch {
    return {
      ok: false,
      reasonCode: "openai_response_parse_failed",
      detail: `HTTP ${res.status}`,
    };
  }

  if (!res.ok) {
    const detail =
      parsed.error?.message?.trim() ||
      parsed.error?.code?.trim() ||
      `HTTP ${res.status}`;
    console.error(
      `${LOG_PREFIX} api error status=${res.status} detail=${detail} elapsedMs=${Date.now() - startedAt}`,
    );
    return { ok: false, reasonCode: "openai_api_error", detail };
  }

  const first = parsed.data?.[0];
  const b64 = first?.b64_json?.trim();
  if (b64) {
    try {
      const bytes = Buffer.from(b64, "base64");
      if (bytes.length === 0) {
        return { ok: false, reasonCode: "openai_empty_image" };
      }
      console.info(
        `${LOG_PREFIX} ok bytes=${bytes.length} elapsedMs=${Date.now() - startedAt}`,
      );
      return { ok: true, bytes };
    } catch {
      return { ok: false, reasonCode: "openai_image_base64_decode_failed" };
    }
  }

  const imageUrl = first?.url?.trim();
  if (imageUrl) {
    return fetchImageBytesFromUrl(imageUrl);
  }

  return { ok: false, reasonCode: "openai_empty_image" };
}
