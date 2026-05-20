import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { logDetailedError } from "../generateDescription/generateDescriptionLog.server";
import {
  executeImageGenerationRequest,
  parseImageGenerationBody,
} from "./imageGenerationHttp.server";
import type { ImageGenerationHttpResponse } from "./types";

const LOG_PREFIX = "[ImageGeneration][Route]";

function jsonResponse(body: ImageGenerationHttpResponse, status: number): Response {
  return Response.json(body, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const routeStart = Date.now();
  const requestId = crypto.randomUUID();
  console.info(
    `${LOG_PREFIX} action start requestId=${requestId} method=${request.method}`,
  );

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        errorCode: 40501,
        errorMsg: "仅支持 POST",
      },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch (e) {
    logDetailedError(`${LOG_PREFIX} requestId=${requestId}`, "request.json failed", e);
    return jsonResponse(
      {
        success: false,
        errorCode: 40000,
        errorMsg: "请求体不是合法 JSON",
      },
      400,
    );
  }

  const parsed = parseImageGenerationBody(raw);
  if (!parsed.ok) {
    return jsonResponse(
      {
        success: false,
        errorCode: 40000,
        errorMsg: parsed.errorMsg,
      },
      400,
    );
  }

  try {
    const { session } = await authenticate.admin(request);
    const { status, body } = await executeImageGenerationRequest({
      requestId,
      sessionShop: session.shop,
      prompt: parsed.data.prompt,
      description: parsed.data.description,
    });

    console.info(
      `${LOG_PREFIX} requestId=${requestId} totalMs=${Date.now() - routeStart} status=${status}`,
    );
    return jsonResponse(body, status);
  } catch (error) {
    logDetailedError(`${LOG_PREFIX} requestId=${requestId}`, "auth_or_server_error", error);
    const message = error instanceof Error ? error.message : "请求处理失败";
    return jsonResponse(
      {
        success: false,
        errorCode: 50001,
        errorMsg: message,
        requestId,
      },
      500,
    );
  }
};
