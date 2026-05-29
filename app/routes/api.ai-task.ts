import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  deleteTaskForShop,
  markTaskApplied,
  getTaskForShop,
} from "../server/aiTask/aiTaskStore.server";
import { cleanupTaskBlobs } from "../server/aiTask/aiTaskBlobCleanup.server";
import type { AITaskDeleteResponse } from "../lib/aiTaskTypes";

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<Response> => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    taskId?: string;
  } | null;

  if (!body || !body.taskId) {
    return Response.json(
      { success: false, errorCode: 40000, errorMsg: "Invalid request body" },
      { status: 400 },
    );
  }

  if (body.action === "delete") {
    const result = await deleteTaskForShop({ taskId: body.taskId, shop });

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
      taskId: body.taskId,
    };
    return Response.json(response);
  }

  if (body.action === "apply") {
    const task = await getTaskForShop({ taskId: body.taskId, shop });
    if (!task) {
      return Response.json(
        { success: false, errorCode: 40401, errorMsg: "Task not found" },
        { status: 404 },
      );
    }
    if (task.status !== "pending_review") {
      return Response.json(
        { success: false, errorCode: 40002, errorMsg: "Task is not in pending_review state" },
        { status: 400 },
      );
    }
    await markTaskApplied(body.taskId);
    return Response.json({ success: true, taskId: body.taskId });
  }

  return Response.json(
    { success: false, errorCode: 40000, errorMsg: "Unknown action" },
    { status: 400 },
  );
};
