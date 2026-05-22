import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTranslationJobsCosmosLocation,
  listJsonRuntimeTasksForShop,
} from "../server/translation/cosmosJobStore.server";
import {
  effectiveShopFromQuery,
  forbiddenIfShopMismatch,
} from "../server/translation/translateRouteHelpers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const forbidden = forbiddenIfShopMismatch(
      shopNameParam,
      session.shop,
      "只能查询当前店铺的 JSON Runtime 任务列表",
    );
    if (forbidden) return forbidden;

    const effectiveShop = effectiveShopFromQuery(shopNameParam, session.shop);
    const tasks = await listJsonRuntimeTasksForShop(effectiveShop);
    return Response.json({
      success: true,
      errorCode: 0,
      errorMsg: "",
      response: {
        shopName: effectiveShop,
        total: tasks.length,
        tasks,
        cosmos: {
          ...getTranslationJobsCosmosLocation(),
          shop: effectiveShop,
        },
      },
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
