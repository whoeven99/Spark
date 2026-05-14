import { z } from "zod";
import type { ShopifyAdminGraphqlClient } from "../ai/tool/shopifyShopInfoTool";
import type { UpdateProductDescriptionApiResponse } from "../../lib/updateProductDescriptionTypes";
import { logDetailedError } from "./generateDescriptionLog.server";
import { updateProductTitleAndDescriptionHtml } from "./services/updateProductDescriptionService";

const LOG_PREFIX = "[UpdateProductDescription][HTTP]";

const requestBodySchema = z.object({
  shop: z.string().min(1).optional(),
  productId: z.string().min(1, "productId 必填"),
  title: z.string().min(1, "标题不能为空"),
  descriptionPlain: z.string().min(1, "描述不能为空"),
});

export type ParsedUpdateProductDescriptionBody = z.infer<
  typeof requestBodySchema
>;

export function parseUpdateProductDescriptionBody(
  raw: unknown,
):
  | { ok: true; data: ParsedUpdateProductDescriptionBody }
  | { ok: false; errorMsg: string } {
  try {
    const data = requestBodySchema.parse(raw);
    return { ok: true, data };
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? e.issues.map((i) => i.message).join("；")
        : "请求体校验失败";
    return { ok: false, errorMsg: msg };
  }
}

function jsonBody(
  body: UpdateProductDescriptionApiResponse,
  status: number,
): { status: number; body: UpdateProductDescriptionApiResponse } {
  return { status, body };
}

/**
 * 鉴权完成后执行写回逻辑，供 API route 使用。
 */
export async function executeUpdateProductDescriptionRequest(params: {
  requestId: string;
  admin: ShopifyAdminGraphqlClient;
  sessionShop: string;
  parsed: ParsedUpdateProductDescriptionBody;
}): Promise<{ status: number; body: UpdateProductDescriptionApiResponse }> {
  const { requestId, admin, sessionShop, parsed } = params;
  const routeStart = Date.now();

  console.info(
    `${LOG_PREFIX} requestId=${requestId} start shop=${sessionShop} productId=${parsed.productId}`,
  );

  const shopParam = parsed.shop?.trim();
  if (shopParam && shopParam !== sessionShop) {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} shop mismatch session=${sessionShop} param=${shopParam}`,
    );
    return jsonBody(
      {
        success: false,
        errorCode: 403,
        errorMsg: "shop 与当前会话店铺不一致",
        response: null,
      },
      403,
    );
  }

  const titleTrimmed = parsed.title.trim();
  const descTrimmed = parsed.descriptionPlain.trim();
  if (!titleTrimmed) {
    return jsonBody(
      {
        success: false,
        errorCode: 400,
        errorMsg: "标题不能为空",
        response: null,
      },
      400,
    );
  }
  if (!descTrimmed) {
    return jsonBody(
      {
        success: false,
        errorCode: 400,
        errorMsg: "描述不能为空",
        response: null,
      },
      400,
    );
  }

  try {
    const result = await updateProductTitleAndDescriptionHtml({
      admin,
      productId: parsed.productId,
      title: titleTrimmed,
      descriptionPlain: descTrimmed,
      requestId,
    });

    const durationMs = Date.now() - routeStart;

    if (!result.ok) {
      const status =
        result.errorCode === 42202 ? 422 : result.errorCode === 40002 ? 400 : 502;
      console.info(
        JSON.stringify({
          event: "updateProductDescription",
          outcome: "error",
          requestId,
          shop: sessionShop,
          productId: parsed.productId,
          errorCode: result.errorCode,
          durationMs,
        }),
      );
      return jsonBody(
        {
          success: false,
          errorCode: result.errorCode,
          errorMsg: result.errorMsg,
          response: null,
        },
        status,
      );
    }

    console.info(
      JSON.stringify({
        event: "updateProductDescription",
        outcome: "ok",
        requestId,
        shop: sessionShop,
        productId: parsed.productId,
        durationMs,
      }),
    );

    return jsonBody(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: {
          id: result.data.id,
          title: result.data.title,
        },
      },
      200,
    );
  } catch (error) {
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "executeUpdateProductDescriptionRequest unexpected",
      error,
    );
    const message = error instanceof Error ? error.message : "请求处理失败";
    return jsonBody(
      {
        success: false,
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      500,
    );
  }
}
