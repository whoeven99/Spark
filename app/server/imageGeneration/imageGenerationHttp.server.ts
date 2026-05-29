import { z } from "zod";
import { billingErrorToResponse } from "../billing/index.server";
import { requireVisualToolBillingAccess } from "../tokenUsage/index.server";
import { resolveImageGenerationProvider, isImageGenerationConfigured } from "./imageGenerationConfig.server";
import { enqueueImageGenerationTask } from "./imageGenerationAsync.server";
import { validateImageGenerationPrompt } from "./imageGenerationExecutor.server";
import { createBatchWithTask } from "../aiTask/aiTaskStore.server";
import { getAppEntry } from "../../config/appEntry.server";
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

function isImageGenerationEnabled(): boolean {
  const raw = process.env.IMAGE_GENERATION_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
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
      const body = (await billingResponse.json()) as { errorMsg?: string };
      return {
        status: 402,
        body: {
          success: false,
          errorCode: 40200,
          errorMsg: body.errorMsg ?? "Token 余额不足或尚未订阅，请前往套餐页开通",
          status: "failed",
        },
      };
    }
    throw error;
  }

  if (!isImageGenerationEnabled()) {
    return {
      status: 503,
      body: { success: false, errorCode: 50300, errorMsg: "商品图片生成功能已关闭", status: "failed" },
    };
  }
  if (!isImageGenerationConfigured()) {
    return {
      status: 503,
      body: {
        success: false,
        errorCode: 50301,
        errorMsg: "未配置图片生成：请设置 OPENAI_IMAGE_API_KEY 与 OPENAI_IMAGE_BASE_URL（gpt-image-2），或 IMAGE_GEN_PROVIDER=volc 并配置 HUOSHAN_*",
        status: "failed",
      },
    };
  }

  // If direct prompt provided, validate length eagerly before creating the task
  const trimmedPrompt = params.prompt?.trim();
  if (trimmedPrompt) {
    const promptError = validateImageGenerationPrompt(trimmedPrompt);
    if (promptError) {
      return {
        status: 400,
        body: { success: false, errorCode: 40000, errorMsg: promptError, status: "failed" },
      };
    }
  }

  const description = params.description?.trim() || undefined;
  const imageProvider = resolveImageGenerationProvider() ?? "openai";
  const appName = getAppEntry();

  const { taskId, batchId } = await createBatchWithTask({
    shop: params.sessionShop,
    appName,
    taskType: "image_generation",
    batchConfig: { description, prompt: trimmedPrompt, imageProvider },
    taskConfig: { description, prompt: trimmedPrompt, imageProvider },
  });

  enqueueImageGenerationTask({
    taskId,
    shop: params.sessionShop,
    prompt: trimmedPrompt,
    description,
    imageProvider,
  });

  return {
    status: 202,
    body: { success: true, taskId, batchId, status: "running" },
  };
}
