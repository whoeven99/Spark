import {
  IMAGE_GENERATION_LOG_PREFIX,
  MAX_PROMPT_CHARS,
  MIN_PROMPT_CHARS,
} from "./constants.server";
import { generateImageToBytes } from "./generateImageToBytes.server";
import {
  isImageGenerationConfigured,
  resolveImageGenerationProvider,
} from "./imageGenerationConfig.server";
import { uploadGeneratedImageAndGetUrl } from "./imageGenerationBlob.server";
import type { ImageGenerationFailureReason, ImageGenerationResult } from "./types";

function isImageGenerationEnabled(): boolean {
  const raw = process.env.IMAGE_GENERATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}

export function normalizeImageGenerationPrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/g, " ");
}

export function validateImageGenerationPrompt(prompt: string): string | null {
  const normalized = normalizeImageGenerationPrompt(prompt);
  if (normalized.length < MIN_PROMPT_CHARS) {
    return `提示词至少 ${MIN_PROMPT_CHARS} 个字符`;
  }
  if (normalized.length > MAX_PROMPT_CHARS) {
    return `提示词不能超过 ${MAX_PROMPT_CHARS} 个字符`;
  }
  return null;
}

const REASON_MESSAGES: Record<string, string> = {
  credentials_missing:
    "未配置图片生成：请设置 OPENAI_IMAGE_API_KEY 与 OPENAI_IMAGE_BASE_URL（gpt-image-2），或 IMAGE_GEN_PROVIDER=volc 并配置 HUOSHAN_*",
  prompt_invalid: "提示词无效，请修改后重试",
  openai_request_failed: "OpenAI 图片生成请求失败，请稍后重试",
  openai_api_error: "OpenAI 图片生成返回错误，请调整提示词或稍后重试",
  openai_response_parse_failed: "OpenAI 图片生成响应异常，请稍后重试",
  openai_empty_image: "未收到生成图片，请调整提示词后重试",
  volc_request_failed: "火山图片生成请求失败，请稍后重试",
  volc_api_error: "火山图片生成返回错误，请调整提示词或稍后重试",
  volc_response_parse_failed: "火山图片生成响应异常，请稍后重试",
  volc_empty_image: "未收到生成图片，请调整提示词后重试",
  blob_upload_failed: "图片上传存储失败，请稍后重试",
  disabled: "商品图片生成功能已关闭",
};

function mapProviderFailure(
  reasonCode: string,
  detail: string | undefined,
  requestId: string,
): ImageGenerationResult {
  if (reasonCode === "credentials_missing") {
    return {
      ok: false,
      reason: "credentials_missing",
      errorMsg: REASON_MESSAGES.credentials_missing,
      requestId,
    };
  }

  const reasonMap: Partial<Record<string, ImageGenerationFailureReason>> = {
    openai_credentials_missing: "credentials_missing",
    volc_credentials_missing: "credentials_missing",
    openai_request_failed: "openai_api_error",
    openai_api_error: "openai_api_error",
    openai_response_parse_failed: "openai_response_parse_failed",
    openai_empty_image: "openai_empty_image",
    openai_image_fetch_failed: "openai_api_error",
    openai_image_base64_decode_failed: "openai_api_error",
    volc_request_failed: "volc_api_error",
    volc_api_error: "volc_api_error",
    volc_response_parse_failed: "volc_response_parse_failed",
    volc_empty_image: "volc_empty_image",
    volc_image_fetch_failed: "volc_api_error",
    volc_image_base64_decode_failed: "volc_api_error",
  };

  const reason = reasonMap[reasonCode] ?? "openai_api_error";
  const base =
    REASON_MESSAGES[reason] ??
    REASON_MESSAGES.openai_api_error ??
    "图片生成失败，请稍后重试";
  return {
    ok: false,
    reason,
    errorMsg: detail ? `${base}（${detail}）` : base,
    requestId,
  };
}

export async function executeImageGeneration(params: {
  requestId: string;
  shop: string;
  prompt: string;
}): Promise<ImageGenerationResult> {
  const requestId = params.requestId;

  if (!isImageGenerationEnabled()) {
    return {
      ok: false,
      reason: "disabled",
      errorMsg: REASON_MESSAGES.disabled,
      requestId,
    };
  }

  if (!isImageGenerationConfigured()) {
    return {
      ok: false,
      reason: "credentials_missing",
      errorMsg: REASON_MESSAGES.credentials_missing,
      requestId,
    };
  }

  const promptError = validateImageGenerationPrompt(params.prompt);
  if (promptError) {
    return {
      ok: false,
      reason: "prompt_invalid",
      errorMsg: promptError,
      requestId,
    };
  }

  const provider = resolveImageGenerationProvider();
  const normalizedPrompt = normalizeImageGenerationPrompt(params.prompt);
  console.info(
    `${IMAGE_GENERATION_LOG_PREFIX} start requestId=${requestId} shop=${params.shop} provider=${provider ?? "none"} promptLen=${normalizedPrompt.length}`,
  );

  const generated = await generateImageToBytes({ prompt: normalizedPrompt });

  if (!generated.ok) {
    return mapProviderFailure(generated.reasonCode, generated.detail, requestId);
  }

  let imageUrl: string;
  try {
    imageUrl = await uploadGeneratedImageAndGetUrl({
      shop: params.shop,
      imageBytes: generated.bytes,
      requestId,
      extension: "png",
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(
      `${IMAGE_GENERATION_LOG_PREFIX} blob upload failed requestId=${requestId} detail=${detail}`,
    );
    return {
      ok: false,
      reason: "blob_upload_failed",
      errorMsg: REASON_MESSAGES.blob_upload_failed,
      requestId,
    };
  }

  console.info(
    `${IMAGE_GENERATION_LOG_PREFIX} success requestId=${requestId} provider=${provider} bytes=${generated.bytes.length}`,
  );

  return {
    ok: true,
    imageUrl,
    provider: provider === "volc" ? "volc" : "openai",
    requestId,
  };
}
