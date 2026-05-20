import { z } from "zod";
import {
  isImageGenerationAsyncEnabled,
  startImageGenerationJob,
} from "./imageGenerationAsync.server";
import {
  executeImageGeneration,
  validateImageGenerationPrompt,
} from "./imageGenerationExecutor.server";
import { isImageGenerationConfigured } from "./imageGenerationConfig.server";
import {
  createPendingGeneratedImageJob,
  markGeneratedImageJobFailed,
  markGeneratedImageJobSucceeded,
} from "./imageGenerationJobStore.server";
import type { ImageGenerationHttpResponse } from "./types";

const bodySchema = z.object({
  prompt: z.string(),
});

export function parseImageGenerationBody(
  raw: unknown,
):
  | { ok: true; data: z.infer<typeof bodySchema> }
  | { ok: false; errorMsg: string } {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errorMsg: "请求体缺少 prompt 字段" };
  }
  return { ok: true, data: parsed.data };
}

async function persistSyncJobResult(params: {
  requestId: string;
  shop: string;
  prompt: string;
  result: Awaited<ReturnType<typeof executeImageGeneration>>;
}): Promise<void> {
  await createPendingGeneratedImageJob({
    requestId: params.requestId,
    shop: params.shop,
    prompt: params.prompt,
  });

  if (!params.result.ok) {
    await markGeneratedImageJobFailed({
      requestId: params.requestId,
      errorMsg: params.result.errorMsg,
    });
    return;
  }

  await markGeneratedImageJobSucceeded({
    requestId: params.requestId,
    blobPath: params.result.blobPath,
    provider: params.result.provider,
  });
}

function isImageGenerationEnabled(): boolean {
  const raw = process.env.IMAGE_GENERATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}

function precheckImageGenerationRequest(params: {
  requestId: string;
  prompt: string;
}):
  | { ok: true }
  | { ok: false; status: number; errorMsg: string; reason: string } {
  if (!isImageGenerationEnabled()) {
    return {
      ok: false,
      status: 503,
      errorMsg: "商品图片生成功能已关闭",
      reason: "disabled",
    };
  }
  if (!isImageGenerationConfigured()) {
    return {
      ok: false,
      status: 503,
      errorMsg:
        "未配置图片生成：请设置 OPENAI_IMAGE_API_KEY 与 OPENAI_IMAGE_BASE_URL（gpt-image-2），或 IMAGE_GEN_PROVIDER=volc 并配置 HUOSHAN_*",
      reason: "credentials_missing",
    };
  }
  const promptError = validateImageGenerationPrompt(params.prompt);
  if (promptError) {
    return {
      ok: false,
      status: 400,
      errorMsg: promptError,
      reason: "prompt_invalid",
    };
  }
  return { ok: true };
}

export async function executeImageGenerationRequest(params: {
  requestId: string;
  sessionShop: string;
  prompt: string;
}): Promise<{ status: number; body: ImageGenerationHttpResponse }> {
  const precheck = precheckImageGenerationRequest({
    requestId: params.requestId,
    prompt: params.prompt,
  });
  if (!precheck.ok) {
    return {
      status: precheck.status,
      body: {
        success: false,
        errorCode: precheck.status * 100,
        errorMsg: precheck.errorMsg,
        requestId: params.requestId,
        status: "failed",
      },
    };
  }

  if (isImageGenerationAsyncEnabled()) {
    await startImageGenerationJob({
      requestId: params.requestId,
      shop: params.sessionShop,
      prompt: params.prompt,
    });

    return {
      status: 202,
      body: {
        success: true,
        requestId: params.requestId,
        status: "pending",
      },
    };
  }

  const result = await executeImageGeneration({
    requestId: params.requestId,
    shop: params.sessionShop,
    prompt: params.prompt,
  });

  try {
    await persistSyncJobResult({
      requestId: params.requestId,
      shop: params.sessionShop,
      prompt: params.prompt,
      result,
    });
  } catch (e) {
    console.error(
      `[ImageGeneration] persist job failed requestId=${params.requestId}`,
      e,
    );
  }

  if (!result.ok) {
    const status =
      result.reason === "prompt_invalid"
        ? 400
        : result.reason === "credentials_missing" || result.reason === "disabled"
          ? 503
          : 502;
    return {
      status,
      body: {
        success: false,
        errorCode: status * 100,
        errorMsg: result.errorMsg,
        requestId: result.requestId,
        status: "failed",
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      requestId: result.requestId,
      status: "succeeded",
      imageUrl: result.imageUrl,
    },
  };
}
