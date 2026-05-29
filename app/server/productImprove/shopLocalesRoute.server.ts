import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import type { ShopLocalesApiResponse } from "../../lib/productImproveLocales";
import { fetchShopLocalesPayload } from "./shopLocalesFetcher.server";
import { logDetailedError } from "./generateDescriptionLog.server";

const LOG_PREFIX = "[ShopLocalesRoute]";

function json(body: ShopLocalesApiResponse, status: number): Response {
  return Response.json(body, { status });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestId = crypto.randomUUID();
  if (request.method !== "GET") {
    return json(
      {
        success: false,
        errorCode: 405,
        errorMsg: "仅支持 GET",
        response: null,
      },
      405,
    );
  }

  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop")?.trim();

  try {
    const { admin, session } = await authenticate.admin(request);

    if (shopParam && shopParam !== session.shop) {
      console.info(
        `${LOG_PREFIX} requestId=${requestId} shop mismatch session=${session.shop} param=${shopParam}`,
      );
      return json(
        {
          success: false,
          errorCode: 403,
          errorMsg: "shop 与当前会话店铺不一致",
          response: null,
        },
        403,
      );
    }

    const payload = await fetchShopLocalesPayload(
      admin,
      `requestId=${requestId} shop=${session.shop}`,
    );

    return json(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: payload,
      },
      200,
    );
  } catch (error) {
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "unexpected",
      error,
    );
    const message = error instanceof Error ? error.message : "请求处理失败";
    return json(
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
