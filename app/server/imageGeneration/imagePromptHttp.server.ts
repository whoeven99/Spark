import { z } from "zod";
import { billingErrorToResponse } from "../billing/index.server";
import {
  buildImagePromptBillingItem,
  normalizeBillingModelKey,
  recordVisualToolTokenUsage,
  requireVisualToolBillingAccess,
} from "../tokenUsage/index.server";
import { generateImagePromptFromDescription } from "./generateImagePromptFromDescription.server";

const bodySchema = z.object({
  description: z.string(),
});

export type ImagePromptHttpResponse =
  | {
      success: true;
      prompt: string;
      requestId: string;
    }
  | {
      success: false;
      errorCode: number;
      errorMsg: string;
      requestId?: string;
    };

export function parseImagePromptBody(
  raw: unknown,
):
  | { ok: true; data: z.infer<typeof bodySchema> }
  | { ok: false; errorMsg: string } {
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errorMsg: "请求体缺少 description 字段" };
  }
  return { ok: true, data: parsed.data };
}

export async function executeImagePromptRequest(params: {
  requestId: string;
  sessionShop: string;
  description: string;
}): Promise<{ status: number; body: ImagePromptHttpResponse }> {
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
          requestId: params.requestId,
        },
      };
    }
    throw error;
  }

  const result = await generateImagePromptFromDescription({
    requestId: params.requestId,
    description: params.description,
  });

  if (!result.ok) {
    const isValidation =
      result.errorMsg.includes("至少") || result.errorMsg.includes("不能超过");
    return {
      status: isValidation ? 400 : 502,
      body: {
        success: false,
        errorCode: isValidation ? 40000 : 50200,
        errorMsg: result.errorMsg,
        requestId: params.requestId,
      },
    };
  }

  await recordVisualToolTokenUsage({
    shop: params.sessionShop,
    items: [
      buildImagePromptBillingItem(
        normalizeBillingModelKey(result.modelLabel),
        result.usageMeta,
      ),
    ],
  });

  return {
    status: 200,
    body: {
      success: true,
      prompt: result.prompt,
      requestId: params.requestId,
    },
  };
}
