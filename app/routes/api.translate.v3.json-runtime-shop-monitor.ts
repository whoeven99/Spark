import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildShopTranslationMonitor } from "../server/translation/jsonRuntimeShopMonitor.server";
import {
  effectiveShopFromQuery,
  forbiddenIfShopMismatch,
} from "../server/translation/translateRouteHelpers.server";

/** 任务监控：Cosmos 按店列任务 + 每条任务查 Redis（不经 AgentTask）。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const forbidden = forbiddenIfShopMismatch(
      shopNameParam,
      session.shop,
      "只能查询当前店铺的翻译任务监控",
    );
    if (forbidden) return forbidden;

    const effectiveShop = effectiveShopFromQuery(shopNameParam, session.shop);
    const maxTasksRaw = url.searchParams.get("maxTasks")?.trim();
    const maxTasks = maxTasksRaw ? Math.min(Math.max(Number(maxTasksRaw) || 20, 1), 30) : 20;

    const payload = await buildShopTranslationMonitor(effectiveShop, maxTasks);
    return Response.json({
      success: true,
      errorCode: 0,
      errorMsg: "",
      response: payload,
    });
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
