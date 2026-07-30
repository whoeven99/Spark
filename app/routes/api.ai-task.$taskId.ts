import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  deleteTaskForShop,
  getTaskForShop,
  listTaskLogs,
} from "../server/aiTask/aiTaskStore.server";
import { cleanupTaskBlobs } from "../server/aiTask/aiTaskBlobCleanup.server";
import type { AITaskDeleteResponse } from "../lib/aiTaskTypes";

export const loader = async ({ request, params }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const taskId = params.taskId;

  if (!taskId) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }

  const task = await getTaskForShop({ taskId, shop: session.shop });
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const logs = await listTaskLogs(taskId);
  return Response.json({ task, logs });
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs): Promise<Response> => {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const taskId = params.taskId;
  if (!taskId) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }

  const result = await deleteTaskForShop({ taskId, shop: session.shop });
  if (!result.ok) {
    const response: AITaskDeleteResponse = {
      success: false,
      errorCode: result.status,
      errorMsg: result.errorMsg,
    };
    return Response.json(response, { status: result.status });
  }

  await cleanupTaskBlobs(result.taskType, result.result);

  const response: AITaskDeleteResponse = {
    success: true,
    taskId,
  };
  return Response.json(response);
};
