import { z } from "zod";
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
  description: string;
}): Promise<{ status: number; body: ImagePromptHttpResponse }> {
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

  return {
    status: 200,
    body: {
      success: true,
      prompt: result.prompt,
      requestId: params.requestId,
    },
  };
}
