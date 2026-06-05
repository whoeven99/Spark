import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import {
  executeGenerateDescriptionRequest,
  parseGenerateDescriptionBody,
} from "./generateDescriptionHttp.server";
import { logDetailedError } from "./generateDescriptionLog.server";
import { detectRequestLocale, readShopifySessionLocale } from "../../i18n/detector.server";
import { initI18n } from "../../i18n";

const LOG_PREFIX = "[GenerateDescriptionRoute]";

function translateGenerateDescriptionErrorMessage(
  rawMessage: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const normalized = rawMessage.trim();
  if (!normalized) {
    return t("productImproveStage1.serverRequestFailed");
  }
  if (normalized === "productId 必填") {
    return t("generate.validationSelectProductId");
  }
  if (normalized === "targetLanguage 必填") {
    return t("generate.validationSelectTargetLanguage");
  }
  if (normalized === "请求体不是合法 JSON") {
    return t("productImproveStage1.serverInvalidJson");
  }
  if (normalized === "shop 与当前会话店铺不一致") {
    return t("productImproveStage1.updateShopMismatch");
  }
  if (normalized === "需要订阅或购买积分") {
    return t("productImproveStage1.billingAccessRequired");
  }
  if (normalized === "请求处理失败") {
    return t("productImproveStage1.serverRequestFailed");
  }
  return rawMessage;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(body, { status });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const routeStart = Date.now();
  const requestId = crypto.randomUUID();
  const initialLocale = detectRequestLocale(request);
  const initialI18n = initI18n(initialLocale);
  const initialT = initialI18n.t.bind(initialI18n);
  console.info(
    `${LOG_PREFIX} [GenerateDescription] action start requestId=${requestId} method=${request.method}`,
  );

  if (request.method !== "POST") {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} totalMs=${Date.now() - routeStart} non-POST`,
    );
    return jsonResponse(
      {
        success: false,
        errorCode: 405,
        errorMsg: initialT("productImproveStage1.serverMethodNotAllowed"),
        response: null,
      },
      405,
    );
  }

  let raw: unknown;
  try {
    raw = await request.json() as unknown;
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
        errorMsg: initialT("productImproveStage1.serverInvalidJson"),
        response: null,
      },
      400,
    );
  }

  const parsed = parseGenerateDescriptionBody(raw);
  if (!parsed.ok) {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} parse failed: ${parsed.errorMsg}`,
    );
    return jsonResponse(
      {
        success: false,
        errorCode: 400,
        errorMsg: translateGenerateDescriptionErrorMessage(parsed.errorMsg, initialT),
        response: null,
      },
      400,
    );
  }

  try {
    console.info(
      `${LOG_PREFIX} requestId=${requestId} before authenticate.admin`,
    );
    const { admin, session } = await authenticate.admin(request);
    const locale = detectRequestLocale(request, {
      sessionLocale: readShopifySessionLocale(session),
    });
    const i18n = initI18n(locale);
    const t = i18n.t.bind(i18n);
    console.info(
      `${LOG_PREFIX} requestId=${requestId} after authenticate shop=${session.shop}`,
    );

    const { status, body } = await executeGenerateDescriptionRequest({
      requestId,
      admin,
      sessionShop: session.shop,
      parsed: parsed.data,
    });

    console.info(
      `${LOG_PREFIX} requestId=${requestId} totalMs=${Date.now() - routeStart} status=${status}`,
    );
    return jsonResponse(
      {
        ...(body as Record<string, unknown>),
        errorMsg:
          typeof (body as { errorMsg?: unknown }).errorMsg === "string"
            ? translateGenerateDescriptionErrorMessage(
                (body as { errorMsg: string }).errorMsg,
                t,
              )
            : (body as { errorMsg?: unknown }).errorMsg,
      },
      status,
    );
  } catch (error) {
    const durationMs = Date.now() - routeStart;
    logDetailedError(
      `${LOG_PREFIX} requestId=${requestId}`,
      "auth_or_server_error",
      error,
    );
    console.info(
      JSON.stringify({
        event: "generateDescription",
        outcome: "auth_or_server_error",
        requestId,
        durationMs,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    const message =
      error instanceof Error
        ? translateGenerateDescriptionErrorMessage(error.message, initialT)
        : initialT("productImproveStage1.serverRequestFailed");
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
