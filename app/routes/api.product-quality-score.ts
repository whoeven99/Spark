import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { logDetailedError } from "../server/productImprove/generateDescriptionLog.server";
import { runProductQualityScore } from "../server/ai/skills/productOptimization/scoreProduct";
import {
  billingErrorToResponse,
  requireBillingAccess,
} from "../server/billing/index.server";
import { getAppEntry } from "../config/appEntry.server";
import type { ProductQualityScoreApiResponse } from "../lib/productQualityScoreTypes";

const LOG_PREFIX = "[ProductQualityScore][Route]";

const requestBodySchema = z.object({
  productId: z.string().min(1, "productId 必填"),
});

function jsonResponse(body: ProductQualityScoreApiResponse, status: number): Response {
  return Response.json(body, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const routeStart = Date.now();
  const requestId = crypto.randomUUID();
  console.info(`${LOG_PREFIX} start requestId=${requestId} method=${request.method}`);

  if (request.method !== "POST") {
    return jsonResponse(
      { success: false, errorCode: 405, errorMsg: "仅支持 POST", response: null },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch (e) {
    logDetailedError(`${LOG_PREFIX} requestId=${requestId}`, "request.json failed", e);
    return jsonResponse(
      { success: false, errorCode: 400, errorMsg: "请求体不是合法 JSON", response: null },
      400,
    );
  }

  const parseResult = requestBodySchema.safeParse(raw);
  if (!parseResult.success) {
    const msg = parseResult.error.issues.map((i) => i.message).join("；");
    return jsonResponse({ success: false, errorCode: 400, errorMsg: msg, response: null }, 400);
  }

  const { productId } = parseResult.data;

  try {
    const { admin, session } = await authenticate.admin(request);
    console.info(`${LOG_PREFIX} requestId=${requestId} shop=${session.shop} productId=${productId}`);

    await requireBillingAccess(session.shop, getAppEntry());

    const result = await runProductQualityScore({ admin, productId, requestId });

    const durationMs = Date.now() - routeStart;

    if (!result.ok) {
      const status = result.errorCode === "PRODUCT_NOT_FOUND" ? 404 : 503;
      console.info(
        JSON.stringify({
          event: "productQualityScore",
          outcome: "error",
          requestId,
          shop: session.shop,
          productId,
          errorCode: result.errorCode,
          durationMs,
        }),
      );
      return jsonResponse(
        { success: false, errorCode: result.errorCode, errorMsg: result.errorMsg, response: null },
        status,
      );
    }

    console.info(
      JSON.stringify({
        event: "productQualityScore",
        outcome: "ok",
        requestId,
        shop: session.shop,
        productId,
        score: result.score,
        durationMs,
      }),
    );

    const { productId: pid, title, score, dimensions, overallSuggestions } = result;
    return jsonResponse(
      {
        success: true,
        errorCode: 0,
        errorMsg: "",
        response: { productId: pid, title, score, dimensions, overallSuggestions },
      },
      200,
    );
  } catch (error) {
    const billingResponse = billingErrorToResponse(error);
    if (billingResponse) {
      const body = (await billingResponse.json()) as { errorMsg?: string };
      return jsonResponse(
        {
          success: false,
          errorCode: 402,
          errorMsg: body.errorMsg ?? "需要订阅或购买 Token",
          response: null,
        },
        402,
      );
    }

    logDetailedError(`${LOG_PREFIX} requestId=${requestId}`, "unexpected error", error);
    const message = error instanceof Error ? error.message : "请求处理失败";
    return jsonResponse(
      { success: false, errorCode: 500, errorMsg: message, response: null },
      500,
    );
  }
};
