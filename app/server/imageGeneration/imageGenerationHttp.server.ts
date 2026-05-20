import { z } from "zod";
import { getAppEntry } from "../../config/appEntry.server";
import { billingErrorToResponse } from "../billing/index.server";
import {
  buildImageGenerateBillingItem,
  buildImagePromptBillingItem,
  normalizeBillingModelKey,
  parseUsageMetadata,
  recordVisualToolTokenUsage,
  requireVisualToolBillingAccess,
  resolveImageGenerationProvider,
  type BilledTokenUsageItem,
  type ParsedTokenUsage,
} from "../tokenUsage/index.server";
import {
  isImageGenerationAsyncEnabled,
  startImageGenerationJob,
} from "./imageGenerationAsync.server";
import {
  executeImageGeneration,
  validateImageGenerationPrompt,
} from "./imageGenerationExecutor.server";
import { isImageGenerationConfigured } from "./imageGenerationConfig.server";
import { generateImagePromptFromDescription } from "./generateImagePromptFromDescription.server";
import { persistSyncImageGenerationJob } from "./imageGenerationJobStore.server";
import type { ImageGenerationHttpResponse } from "./types";

const bodySchema = z
  .object({
    prompt: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasPrompt = Boolean(data.prompt?.trim());
    const hasDescription = Boolean(data.description?.trim());
    if (!hasPrompt && !hasDescription) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请求体需包含 description 或 prompt",
      });
    }
  });

export type ImageGenerationRequestBody = z.infer<typeof bodySchema>;

export function parseImageGenerationBody(
  raw: unknown,
):
  | { ok: true; data: ImageGenerationRequestBody }
  | { ok: false; errorMsg: string } {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message;
    return { ok: false, errorMsg: msg || "请求体格式无效" };
  }
  return { ok: true, data: parsed.data };
}

async function resolveImageGenerationPrompt(params: {
  requestId: string;
  prompt?: string;
  description?: string;
}): Promise<
  | {
      ok: true;
      prompt: string;
      description?: string;
      promptModelKey?: string;
      promptTokenUsage?: ParsedTokenUsage;
    }
  | { ok: false; errorMsg: string }
> {
  const trimmedPrompt = params.prompt?.trim() ?? "";
  if (trimmedPrompt) {
    const promptError = validateImageGenerationPrompt(trimmedPrompt);
    if (promptError) {
      return { ok: false, errorMsg: promptError };
    }
    const description = params.description?.trim() || undefined;
    return { ok: true, prompt: trimmedPrompt, description };
  }

  const description = params.description?.trim() ?? "";
  if (!description) {
    return { ok: false, errorMsg: "请求体需包含 description 或 prompt" };
  }

  const promptResult = await generateImagePromptFromDescription({
    requestId: params.requestId,
    description,
  });
  if (!promptResult.ok) {
    return { ok: false, errorMsg: promptResult.errorMsg };
  }

  const promptTokenUsage = parseUsageMetadata(promptResult.usageMeta);
  return {
    ok: true,
    prompt: promptResult.prompt,
    description,
    promptModelKey: normalizeBillingModelKey(promptResult.modelLabel),
    ...(promptTokenUsage.totalTokens > 0 ? { promptTokenUsage } : {}),
  };
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

async function recordImageGenerationSuccessUsage(params: {
  shop: string;
  promptModelKey?: string;
  promptTokenUsage?: ParsedTokenUsage;
  imageProvider: "openai" | "volc";
}): Promise<void> {
  const items: BilledTokenUsageItem[] = [
    buildImageGenerateBillingItem(params.imageProvider),
  ];
  if (
    params.promptTokenUsage &&
    params.promptTokenUsage.totalTokens > 0 &&
    params.promptModelKey
  ) {
    items.unshift(
      buildImagePromptBillingItem(
        params.promptModelKey,
        params.promptTokenUsage,
      ),
    );
  }
  await recordVisualToolTokenUsage({
    shop: params.shop,
    appName: getAppEntry(),
    items,
  });
}

export async function executeImageGenerationRequest(params: {
  requestId: string;
  sessionShop: string;
  prompt?: string;
  description?: string;
}): Promise<{ status: number; body: ImageGenerationHttpResponse }> {
  try {
    await requireVisualToolBillingAccess(params.sessionShop);
  } catch (error) {
    const billingResponse = billingErrorToResponse(error);
    if (billingResponse) {
      const body = (await billingResponse.json()) as {
        errorMsg?: string;
      };
      return {
        status: 402,
        body: {
          success: false,
          errorCode: 40200,
          errorMsg: body.errorMsg ?? "Token 余额不足或尚未订阅，请前往套餐页开通",
          requestId: params.requestId,
          status: "failed",
        },
      };
    }
    throw error;
  }

  const resolved = await resolveImageGenerationPrompt({
    requestId: params.requestId,
    prompt: params.prompt,
    description: params.description,
  });
  if (!resolved.ok) {
    const isValidation =
      resolved.errorMsg.includes("至少") || resolved.errorMsg.includes("不能超过");
    return {
      status: isValidation ? 400 : 502,
      body: {
        success: false,
        errorCode: isValidation ? 40000 : 50200,
        errorMsg: resolved.errorMsg,
        requestId: params.requestId,
        status: "failed",
      },
    };
  }

  const { prompt, description, promptModelKey, promptTokenUsage } = resolved;
  const imageProvider = resolveImageGenerationProvider() ?? "openai";

  const precheck = precheckImageGenerationRequest({
    requestId: params.requestId,
    prompt,
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
      prompt,
      description,
      promptModelKey,
      promptTokenUsage,
      imageProvider,
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
    prompt,
  });

  try {
    await persistSyncImageGenerationJob({
      requestId: params.requestId,
      shop: params.sessionShop,
      prompt,
      description,
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

  await recordImageGenerationSuccessUsage({
    shop: params.sessionShop,
    promptModelKey,
    promptTokenUsage,
    imageProvider: result.provider,
  });

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
