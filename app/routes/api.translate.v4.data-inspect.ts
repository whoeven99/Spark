import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildTranslationDataInspectEnvelope } from "../server/translation/translationDataInspect.server";
import {
  effectiveShopFromQuery,
  forbiddenIfShopMismatch,
} from "../server/translation/translateRouteHelpers.server";

/** GET /api/translate/v4/data-inspect — Spark 本机查 Cosmos + Blob（Init chunk / manifest） */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId")?.trim() ?? "";
    if (!taskId) {
      return Response.json(
        {
          success: false,
          errorCode: 10001,
          errorMsg: "Missing parameters: taskId",
          response: null,
        },
        { status: 200 },
      );
    }

    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const forbidden = forbiddenIfShopMismatch(
      shopNameParam,
      session.shop,
      "只能查询当前店铺的翻译任务",
    );
    if (forbidden) return forbidden;

    const effectiveShop = effectiveShopFromQuery(shopNameParam, session.shop);
    const includeManifest =
      url.searchParams.get("includeManifestPreview") !== "false";
    const maxPreviewBytesRaw = url.searchParams.get("maxPreviewBytes")?.trim();
    const maxPreviewBytes = maxPreviewBytesRaw
      ? Number(maxPreviewBytesRaw) || 8192
      : 8192;

    const envelope = await buildTranslationDataInspectEnvelope({
      taskId,
      shopName: effectiveShop,
      includeManifestPreview: includeManifest,
      maxPreviewBytes,
    });

    return Response.json(
      {
        success: envelope.success,
        errorCode: envelope.errorCode,
        errorMsg: envelope.errorMsg ?? "",
        response: envelope.response,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求处理失败";
    return Response.json(
      {
        success: false,
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      { status: 500 },
    );
  }
};
