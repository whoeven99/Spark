import { z } from "zod";
import { executeImageGeneration } from "./imageGenerationExecutor.server";
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

export async function executeImageGenerationRequest(params: {
  requestId: string;
  sessionShop: string;
  prompt: string;
}): Promise<{ status: number; body: ImageGenerationHttpResponse }> {
  const result = await executeImageGeneration({
    requestId: params.requestId,
    shop: params.sessionShop,
    prompt: params.prompt,
  });

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
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      imageUrl: result.imageUrl,
      requestId: result.requestId,
    },
  };
}
