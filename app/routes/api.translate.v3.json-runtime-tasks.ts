import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listJsonRuntimeTasksForShop } from "../server/translation/cosmosJobStore.server";

function normalizeShop(value: string) {
  return value.trim().toLowerCase();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const effectiveShop = shopNameParam || session.shop;
    if (
      shopNameParam &&
      normalizeShop(shopNameParam) !== normalizeShop(session.shop)
    ) {
      return Response.json(
        {
          success: false,
          errorCode: 403,
          errorMsg: "只能查询当前店铺的 JSON Runtime 任务列表",
          response: null,
        },
        { status: 403 },
      );
    }

    const tasks = await listJsonRuntimeTasksForShop(effectiveShop);
    return Response.json({
      success: true,
      errorCode: 0,
      errorMsg: "",
      response: {
        shopName: effectiveShop,
        total: tasks.length,
        tasks,
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
