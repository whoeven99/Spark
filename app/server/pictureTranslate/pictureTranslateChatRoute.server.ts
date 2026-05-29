import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../../shopify.server";
import { logDetailedError } from "../productImprove/generateDescriptionLog.server";
import { safeExecutePictureTranslateTool } from "../ai/skills/pictureTranslate/service";
import { resolvePictureTranslateInput } from "../ai/skills/pictureTranslate/schema";
import type { PictureTranslateToolResult } from "../ai/skills/pictureTranslate/types";

const LOG_PREFIX = "[PictureTranslateChat]";

const requestBodySchema = z.object({
  imageUrl: z.string().trim().optional(),
  imageBase64: z.string().trim().optional(),
  sourceLanguage: z.string().trim().optional(),
  targetLanguage: z.string().trim().min(1, "targetLanguage 必填"),
});

type ResponseBody =
  | { success: true; translatedImage: string; requestId: string }
  | { success: false; error: string; requestId: string };

function toJson(body: ResponseBody, status: number): Response {
  return Response.json(body, { status });
}

function safeHost(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function summarizeInput(input: {
  imageUrl?: string;
  imageBase64?: string;
  sourceLanguage?: string;
  targetLanguage: string;
}): Record<string, unknown> {
  return {
    hasImageUrl: Boolean(input.imageUrl?.trim()),
    imageUrlHost: safeHost(input.imageUrl),
    hasImageBase64: Boolean(input.imageBase64?.trim()),
    imageBase64Length: input.imageBase64?.length ?? 0,
    sourceLanguage: input.sourceLanguage?.trim() || "auto",
    targetLanguage: input.targetLanguage.trim(),
  };
}

function resultToResponseBody(
  result: PictureTranslateToolResult,
  requestId: string,
): ResponseBody {
  if (result.success) {
    return {
      success: true,
      translatedImage: result.translatedImage,
      requestId,
    };
  }
  return {
    success: false,
    error: result.error,
    requestId,
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  console.info(`${LOG_PREFIX} start requestId=${requestId} method=${request.method}`);

  if (request.method !== "POST") {
    return toJson(
      { success: false, error: "仅支持 POST", requestId },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch (error) {
    logDetailedError(`${LOG_PREFIX} requestId=${requestId}`, "request.json failed", error);
    return toJson(
      { success: false, error: "请求体不是合法 JSON", requestId },
      400,
    );
  }

  const parsed = requestBodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("；") || "请求体校验失败";
    console.info(`${LOG_PREFIX} parse failed requestId=${requestId} message=${message}`);
    return toJson({ success: false, error: message, requestId }, 400);
  }

  try {
    const { session } = await authenticate.admin(request);
    const resolvedInput = resolvePictureTranslateInput(parsed.data);
    const inputSummary = summarizeInput(resolvedInput);
    console.info(
      `${LOG_PREFIX} submit requestId=${requestId} shop=${session.shop} input=${JSON.stringify(inputSummary)}`,
    );

    const result = await safeExecutePictureTranslateTool({
      requestId,
      shop: session.shop,
      input: resolvedInput,
    });
    const durationMs = Date.now() - startedAt;
    const body = resultToResponseBody(result, requestId);
    console.info(
      `${LOG_PREFIX} done requestId=${requestId} success=${String(result.success)} durationMs=${durationMs}`,
    );
    return toJson(body, result.success ? 200 : 400);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "auth_or_server_error",
      error,
    );
    console.error(
      `${LOG_PREFIX} error requestId=${requestId} durationMs=${durationMs} message=${error instanceof Error ? error.message : String(error)}`,
    );
    return toJson({ success: false, error: "请求处理失败", requestId }, 500);
  }
};
