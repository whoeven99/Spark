import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listTranslationTasksForShop } from "../server/translation/cosmosJobStore.server";
import {
  DEFAULT_TRANSLATION_TASK_LIST_TYPES,
  parseTaskTypeQueryParam,
} from "../server/translation/translationTaskTypes.server";
import {
  effectiveShopFromQuery,
  forbiddenIfShopMismatch,
} from "../server/translation/translateRouteHelpers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const taskTypeParam = url.searchParams.get("taskType");

    const forbidden = forbiddenIfShopMismatch(
      shopNameParam,
      session.shop,
      "只能查询当前店铺的翻译任务列表",
    );
    if (forbidden) return forbidden;

    const effectiveShop = effectiveShopFromQuery(shopNameParam, session.shop);
    const parsedTypes = parseTaskTypeQueryParam(taskTypeParam);
    const taskTypes =
      parsedTypes.length > 0 ? parsedTypes : [...DEFAULT_TRANSLATION_TASK_LIST_TYPES];

    const tasks = await listTranslationTasksForShop(effectiveShop, taskTypes);
    return Response.json({
      success: true,
      errorCode: 0,
      errorMsg: "",
      response: {
        shopName: effectiveShop,
        taskType: taskTypes.join(","),
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
