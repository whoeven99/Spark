import { getAppEntry } from "../../../../config/appEntry.server";
import { executeImageGeneration } from "../../../imageGeneration/imageGenerationExecutor.server";
import { logDetailedError } from "../../../productImprove/generateDescriptionLog.server";
import {
  buildImageGenerateBillingItem,
  recordVisualToolTokenUsage,
} from "../../../tokenUsage/index.server";
import {
  GENERATE_PRODUCT_IMAGE_TOOL_NAME,
  IMAGE_GENERATION_TOOL_LOG_PREFIX,
} from "./constants";
import type { GenerateProductImageToolResult } from "./types";

type ExecuteGenerateProductImageParams = {
  requestId: string;
  shop: string;
  prompt: string;
};

function ok(imageUrl: string, requestId: string): GenerateProductImageToolResult {
  return { success: true, imageUrl, requestId };
}

function fail(error: string, requestId: string): GenerateProductImageToolResult {
  return { success: false, error, requestId };
}

export async function executeGenerateProductImageTool(
  params: ExecuteGenerateProductImageParams,
): Promise<GenerateProductImageToolResult> {
  const result = await executeImageGeneration({
    requestId: params.requestId,
    shop: params.shop,
    prompt: params.prompt,
  });

  if (!result.ok) {
    return fail(result.errorMsg, result.requestId);
  }

  await recordVisualToolTokenUsage({
    shop: params.shop,
    appName: getAppEntry(),
    items: [buildImageGenerateBillingItem(result.provider)],
  });

  return ok(result.imageUrl, result.requestId);
}

export async function safeExecuteGenerateProductImageTool(
  params: ExecuteGenerateProductImageParams,
): Promise<GenerateProductImageToolResult> {
  try {
    return await executeGenerateProductImageTool(params);
  } catch (error) {
    logDetailedError(
      `${IMAGE_GENERATION_TOOL_LOG_PREFIX} requestId=${params.requestId}`,
      `${GENERATE_PRODUCT_IMAGE_TOOL_NAME} unexpected`,
      error,
    );
    const message = error instanceof Error ? error.message : "图片生成失败，请稍后重试";
    return fail(message, params.requestId);
  }
}
