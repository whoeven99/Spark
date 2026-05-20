import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../../shopify.server";
import { logDetailedError } from "../generateDescription/generateDescriptionLog.server";
import type { ShopVisualJobDeleteResponse } from "../../lib/shopVisualJobTypes";
import { deleteShopVisualJobForShop } from "./shopVisualJobDelete.server";

const LOG_PREFIX = "[ShopVisualJob][DeleteRoute]";

const bodySchema = z.object({
  requestId: z.string().min(1),
});

function jsonResponse(body: ShopVisualJobDeleteResponse, status: number): Response {
  return Response.json(body, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const routeRequestId = crypto.randomUUID();
  console.info(`${LOG_PREFIX} start routeRequestId=${routeRequestId} method=${request.method}`);

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, errorCode: 40501, errorMsg: "仅支持 POST" },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch (e) {
    logDetailedError(`${LOG_PREFIX} routeRequestId=${routeRequestId}`, "json failed", e);
    return jsonResponse(
      { success: false, errorCode: 40000, errorMsg: "请求体不是合法 JSON" },
      400,
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { success: false, errorCode: 40000, errorMsg: "请求体缺少 requestId 字段" },
      400,
    );
  }

  const requestId = parsed.data.requestId.trim();

  try {
    const { session } = await authenticate.admin(request);
    const result = await deleteShopVisualJobForShop({
      requestId,
      shop: session.shop,
    });

    if (!result.ok) {
      return jsonResponse(
        {
          success: false,
          errorCode: result.status * 100,
          errorMsg: result.errorMsg,
          requestId,
        },
        result.status,
      );
    }

    return jsonResponse({ success: true, requestId }, 200);
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
