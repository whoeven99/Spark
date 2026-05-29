import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getTaskForShop,
  listTaskLogs,
} from "../server/aiTask/aiTaskStore.server";
import {
  subscribeToTask,
} from "../server/aiTask/aiTaskEventBus.server";
import type { AITaskSSEEvent } from "../lib/aiTaskTypes";

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");

  if (!taskId) {
    return Response.json({ error: "Missing taskId" }, { status: 400 });
  }

  const task = await getTaskForShop({ taskId, shop });
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const existingLogs = await listTaskLogs(taskId);

  const encoder = new TextEncoder();

  function encode(event: AITaskSSEEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encode({ type: "connected", taskId, existingLogs }),
      );

      if (task.status !== "running") {
        controller.enqueue(
          encode({
            type: "status_change",
            taskId,
            status: task.status,
            result: task.result ?? undefined,
            errorMsg: task.errorMsg ?? undefined,
          }),
        );
        controller.close();
        return;
      }

      const unsubscribe = subscribeToTask(taskId, (event) => {
        try {
          controller.enqueue(encode(event));
          if (
            event.type === "status_change" &&
            event.status !== "running"
          ) {
            controller.close();
          }
        } catch {
          unsubscribe();
        }
      });

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
};
