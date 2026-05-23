import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import {
  executePictureTranslateRequest,
  parsePictureTranslateBody,
} from "./pictureTranslateHttp.server";
import { logDetailedError } from "../productImprove/generateDescriptionLog.server";
import type { PictureTranslateResponse } from "./pictureTranslateTypes.server";

const LOG_PREFIX = "[PictureTranslate][Route]";

function jsonResponse(body: PictureTranslateResponse, status: number): Response {
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
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "request.json failed",
      e,
    );
    return jsonResponse(
      {
        success: false,
        errorCode: 40000,
        errorMsg: "请求体不是合法 JSON",
      },
      400,
    );
  }

  const parsed = parsePictureTranslateBody(raw);
  if (!parsed.ok) {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} parse failed: ${parsed.errorMsg}`,
    );
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
    const { status, body } = await executePictureTranslateRequest({
      requestId,
      sessionShop: session.shop,
      parsed: parsed.data,
    });

    console.info(
      `${LOG_PREFIX} requestId=${requestId} totalMs=${Date.now() - routeStart} status=${status}`,
    );
    return jsonResponse(body, status);
  } catch (error) {
    const durationMs = Date.now() - routeStart;
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "auth_or_server_error",
      error,
    );
    console.info(
      JSON.stringify({
        event: "pictureTranslate",
        outcome: "auth_or_server_error",
        requestId,
        durationMs,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    const message = error instanceof Error ? error.message : "请求处理失败";
    return jsonResponse(
      {
        success: false,
        errorCode: 50001,
        errorMsg: message,
      },
      500,
    );
  }
};
