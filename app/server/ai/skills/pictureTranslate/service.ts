import { getAppEntry } from "../../../config/appEntry.server";
import { logDetailedError } from "../../../generateDescription/generateDescriptionLog.server";
import {
  buildPictureTranslateBillingItem,
  recordVisualToolTokenUsage,
} from "../../../tokenUsage/index.server";
import { executePictureTranslatePipeline } from "../../../pictureTranslate/pictureTranslateExecutor.server";
import { persistPictureTranslateSuccess } from "../../../pictureTranslate/pictureTranslatePersist.server";
import { fetchSourceImageBytes } from "../../../pictureTranslate/volcenginePictureTranslate.server";
import {
  ERROR_MESSAGES,
  MAX_IMAGE_BYTES,
  PICTURE_TRANSLATE_TOOL_ERROR_LOG_PREFIX,
  PICTURE_TRANSLATE_TOOL_LOG_PREFIX,
  PICTURE_TRANSLATE_TOOL_NAME,
  BASE64_MARKER,
  DATA_URL_PREFIX,
} from "./constants";
import type {
  PictureTranslateInputSummary,
  PictureTranslateResolvedInput,
  PictureTranslateToolFailure,
  PictureTranslateToolResult,
  PictureTranslateToolSuccess,
} from "./types";

type ExecutePictureTranslateParams = {
  requestId: string;
  shop: string;
  input: PictureTranslateResolvedInput;
};

function ok(translatedImage: string): PictureTranslateToolSuccess {
  return { success: true, translatedImage, textBlocks: [] };
}

function fail(error: string): PictureTranslateToolFailure {
  return { success: false, error };
}

function isPng(bytes: Buffer): boolean {
  if (bytes.length < 8) return false;
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Buffer): boolean {
  if (bytes.length < 3) return false;
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function detectImageFormat(bytes: Buffer): "png" | "jpg" | null {
  if (isPng(bytes)) return "png";
  if (isJpeg(bytes)) return "jpg";
  return null;
}

function buildInputSummary(
  input: PictureTranslateResolvedInput,
): PictureTranslateInputSummary {
  let imageUrlHost: string | undefined;
  if (input.imageUrl) {
    try {
      imageUrlHost = new URL(input.imageUrl).host;
    } catch {
      imageUrlHost = undefined;
    }
  }

  return {
    hasImageUrl: Boolean(input.imageUrl),
    imageUrlHost,
    hasImageBase64: Boolean(input.imageBase64),
    imageBase64Length: input.imageBase64?.length ?? 0,
    targetLanguage: input.targetLanguage,
    sourceLanguage: input.sourceLanguage,
  };
}

function extractBase64Payload(imageBase64: string): string {
  const trimmed = imageBase64.trim();
  if (!trimmed) {
    throw new Error(ERROR_MESSAGES.IMAGE_BASE64_INVALID);
  }
  if (trimmed.startsWith(DATA_URL_PREFIX)) {
    const markerIndex = trimmed.indexOf(BASE64_MARKER);
    if (markerIndex === -1) {
      throw new Error(ERROR_MESSAGES.IMAGE_BASE64_INVALID);
    }
    return trimmed.slice(markerIndex + BASE64_MARKER.length).trim();
  }
  return trimmed;
}

function decodeImageBase64ToBytes(imageBase64: string): Buffer {
  const payload = extractBase64Payload(imageBase64).replace(/\s+/g, "");
  if (!payload) {
    throw new Error(ERROR_MESSAGES.IMAGE_BASE64_INVALID);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(payload)) {
    throw new Error(ERROR_MESSAGES.IMAGE_BASE64_INVALID);
  }
  try {
    const bytes = Buffer.from(payload, "base64");
    if (!bytes.length) {
      throw new Error(ERROR_MESSAGES.IMAGE_BASE64_INVALID);
    }
    return bytes;
  } catch {
    throw new Error(ERROR_MESSAGES.IMAGE_BASE64_INVALID);
  }
}

function validateImageBytes(
  imageBytes: Buffer,
): PictureTranslateToolFailure | undefined {
  if (!imageBytes.length) {
    return fail(ERROR_MESSAGES.IMAGE_FORMAT_INVALID);
  }
  if (imageBytes.length > MAX_IMAGE_BYTES) {
    return fail(ERROR_MESSAGES.IMAGE_TOO_LARGE);
  }
  if (detectImageFormat(imageBytes) == null) {
    return fail(ERROR_MESSAGES.IMAGE_FORMAT_INVALID);
  }
  return undefined;
}

function mapPipelineFailureToUserError(
  reason: string,
  detail?: string,
): string {
  if (reason === "language_pair_not_supported") {
    return ERROR_MESSAGES.LANGUAGE_PAIR_NOT_SUPPORTED;
  }
  if (reason === "auto_requires_explicit_source") {
    return ERROR_MESSAGES.AUTO_SOURCE_REQUIRES_EXPLICIT;
  }
  if (reason === "image_fetch_failed") {
    return ERROR_MESSAGES.IMAGE_URL_INVALID;
  }
  if (reason === "image_format_invalid") {
    return ERROR_MESSAGES.IMAGE_FORMAT_INVALID;
  }
  if (reason === "blob_upload_failed") {
    return ERROR_MESSAGES.BLOB_UPLOAD_FAILED;
  }
  if (reason === "volc_failed") {
    if (detail?.includes("volc_credentials_missing")) {
      return ERROR_MESSAGES.VOLC_CREDENTIALS_MISSING;
    }
    if (detail && /(timeout|timed out|aborted|abort)/i.test(detail)) {
      return ERROR_MESSAGES.VOLC_TIMEOUT;
    }
    if (
      detail?.includes("volc_response_parse_failed") ||
      detail?.includes("volc_empty_image")
    ) {
      return ERROR_MESSAGES.VOLC_RESPONSE_INVALID;
    }
    return ERROR_MESSAGES.VOLC_API_FAILED;
  }
  if (reason === "aidge_failed") {
    if (detail?.includes("aidge_credentials_missing")) {
      return ERROR_MESSAGES.AIDGE_CREDENTIALS_MISSING;
    }
    if (detail && /(timeout|timed out|aborted|abort)/i.test(detail)) {
      return ERROR_MESSAGES.AIDGE_TIMEOUT;
    }
    if (
      detail?.includes("aidge_empty_image") ||
      detail?.includes("aidge_response")
    ) {
      return ERROR_MESSAGES.AIDGE_RESPONSE_INVALID;
    }
    return ERROR_MESSAGES.AIDGE_API_FAILED;
  }
  return ERROR_MESSAGES.TOOL_EXECUTION_FAILED;
}

function logToolError(params: {
  requestId: string;
  inputSummary: PictureTranslateInputSummary;
  message: string;
  error: unknown;
}): void {
  const stack =
    params.error instanceof Error
      ? (params.error.stack ?? params.error.message)
      : String(params.error);
  console.error(
    `${PICTURE_TRANSLATE_TOOL_ERROR_LOG_PREFIX} requestId=${params.requestId} toolName=${PICTURE_TRANSLATE_TOOL_NAME} input=${JSON.stringify(
      params.inputSummary,
    )} message=${params.message} stack=${stack}`,
  );
  logDetailedError(
    `${PICTURE_TRANSLATE_TOOL_ERROR_LOG_PREFIX} requestId=${params.requestId}`,
    params.message,
    params.error,
  );
}

async function resolveImageBytes(
  input: PictureTranslateResolvedInput,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  if (input.imageUrl) {
    const fetched = await fetchSourceImageBytes(input.imageUrl);
    if (!fetched.ok) {
      console.info(
        `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} fetch source failed reasonCode=${fetched.reasonCode} detail=${fetched.detail ?? "n/a"}`,
      );
      return { ok: false, error: ERROR_MESSAGES.IMAGE_URL_INVALID };
    }
    return { ok: true, bytes: fetched.bytes };
  }

  if (!input.imageBase64) {
    return { ok: false, error: ERROR_MESSAGES.IMAGE_REQUIRED };
  }

  try {
    const bytes = decodeImageBase64ToBytes(input.imageBase64);
    return { ok: true, bytes };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : ERROR_MESSAGES.IMAGE_BASE64_INVALID;
    return { ok: false, error: message };
  }
}

export async function executePictureTranslateTool(
  params: ExecutePictureTranslateParams,
): Promise<PictureTranslateToolResult> {
  const { requestId, shop, input } = params;
  const inputSummary = buildInputSummary(input);
  console.info(
    `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} start requestId=${requestId} toolName=${PICTURE_TRANSLATE_TOOL_NAME}`,
  );
  console.info(
    `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} validate input requestId=${requestId} toolName=${PICTURE_TRANSLATE_TOOL_NAME} input=${JSON.stringify(
      inputSummary,
    )}`,
  );

  const resolvedImage = await resolveImageBytes(input);
  if (!resolvedImage.ok) {
    return fail(resolvedImage.error);
  }

  const imageValidationError = validateImageBytes(resolvedImage.bytes);
  if (imageValidationError) {
    return imageValidationError;
  }

  console.info(
    `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} pipeline requestId=${requestId} bytes=${resolvedImage.bytes.length}`,
  );

  const pipeline = await executePictureTranslatePipeline({
    requestId,
    shop,
    imageUrl: input.imageUrl,
    imageBytes: resolvedImage.bytes,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
  });

  if (!pipeline.ok) {
    const userError = mapPipelineFailureToUserError(
      pipeline.reason,
      pipeline.detail,
    );
    console.info(
      `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} pipeline failed requestId=${requestId} reason=${pipeline.reason} provider=${pipeline.provider ?? "n/a"} userError=${userError}`,
    );
    return fail(userError);
  }

  console.info(
    `${PICTURE_TRANSLATE_TOOL_LOG_PREFIX} response success requestId=${requestId} provider=${pipeline.provider}`,
  );
  await persistPictureTranslateSuccess({
    requestId,
    shop,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    pipeline,
    extraMetadata: {
      channel: "ai_tool",
      imageUrlHost: inputSummary.imageUrlHost,
    },
  });
  await recordVisualToolTokenUsage({
    shop,
    appName: getAppEntry(),
    items: [buildPictureTranslateBillingItem(pipeline.provider)],
  });
  return ok(pipeline.imageUrl);
}

export async function safeExecutePictureTranslateTool(
  params: ExecutePictureTranslateParams,
): Promise<PictureTranslateToolResult> {
  try {
    return await executePictureTranslateTool(params);
  } catch (error) {
    const inputSummary = buildInputSummary(params.input);
    logToolError({
      requestId: params.requestId,
      inputSummary,
      message: ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
      error,
    });
    return fail(ERROR_MESSAGES.TOOL_EXECUTION_FAILED);
  }
}
