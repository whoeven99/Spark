import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { logDetailedError } from "./generateDescriptionLog.server";
import {
  executeUpdateProductDescriptionRequest,
  parseUpdateProductDescriptionBody,
} from "./updateProductDescriptionHttp.server";

const LOG_PREFIX = "[UpdateProductDescriptionRoute]";

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
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
        errorCode: 405,
        errorMsg: "仅支持 POST",
        response: null,
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
        errorCode: 400,
        errorMsg: "请求体不是合法 JSON",
        response: null,
      },
      400,
    );
  }

  const parsed = parseUpdateProductDescriptionBody(raw);
  if (!parsed.ok) {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} parse failed: ${parsed.errorMsg}`,
    );
    return jsonResponse(
      {
        success: false,
        errorCode: 400,
        errorMsg: parsed.errorMsg,
        response: null,
      },
      400,
    );
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const { status, body } = await executeUpdateProductDescriptionRequest({
      requestId,
      admin,
      sessionShop: session.shop,
      parsed: parsed.data,
    });

    console.info(
      `${LOG_PREFIX} requestId=${requestId} totalMs=${Date.now() - routeStart} status=${status}`,
    );
    return jsonResponse(body as Record<string, unknown>, status);
  } catch (error) {
    const durationMs = Date.now() - routeStart;
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "auth_or_server_error",
      error,
    );
    console.info(
      JSON.stringify({
        event: "updateProductDescription",
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
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      500,
    );
  }
};
