import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  BASE_RESPONSE_FAILED_CODE,
  buildSparkJsonRuntimeTaskProgressEnvelope,
} from "../server/translation/jsonRuntimeTaskDetail.server";

/**
 * 任务进度：Spark 进程内直接读 Cosmos（translation_jobs / shopName 分区）+ Redis，不转发 AgentTask。
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const taskId = url.searchParams.get("taskId")?.trim() ?? "";
    if (!taskId) {
      return Response.json(
        {
          success: false,
          errorCode: BASE_RESPONSE_FAILED_CODE,
          errorMsg: "Missing parameters: taskId",
          response: null,
        },
        { status: 200 },
      );
    }

    const shopNameParam = url.searchParams.get("shopName")?.trim();
    const effectiveShop = shopNameParam || session.shop;
    const redisPrefix = url.searchParams.get("redisPrefix")?.trim();

    const envelope = await buildSparkJsonRuntimeTaskProgressEnvelope({
      taskId,
      shopName: effectiveShop,
      redisPrefix,
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
