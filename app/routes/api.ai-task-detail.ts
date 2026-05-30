import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTaskForShop,
  listTaskLogs,
} from "../server/aiTask/aiTaskStore.server";

export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");

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
