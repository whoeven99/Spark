import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { logDetailedError } from "../generateDescription/generateDescriptionLog.server";
import { getImageGenerationStatusResponse } from "./imageGenerationStatusHttp.server";
import type { ImageGenerationStatusHttpResponse } from "./types";

const LOG_PREFIX = "[ImageGeneration][Status]";

function jsonResponse(body: ImageGenerationStatusHttpResponse, status: number): Response {
  return Response.json(body, { status });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestId = new URL(request.url).searchParams.get("requestId")?.trim();
  if (!requestId) {
    return jsonResponse(
      {
        success: false,
        errorCode: 40000,
        errorMsg: "缺少 requestId 参数",
      },
      400,
    );
  }

  try {
    const { session } = await authenticate.admin(request);
    const { status, body } = await getImageGenerationStatusResponse({
      requestId,
      sessionShop: session.shop,
    });
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
