import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { isCosmosSparkOpsConfigured } from "../server/cosmos/cosmosSparkOps.server";
import {
  queryScheduleLogsByTask,
  queryScheduleLogsByShop,
  queryScheduleLogSummary,
} from "../server/translation/scheduleLogCosmos.server";

const DEFAULT_AGENT_BASE = "https://agent-task-0qi3.onrender.com";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);

    const queryType = url.searchParams.get("queryType")?.trim() || "task";
    const taskId = url.searchParams.get("taskId")?.trim() ?? "";
    const shopName = url.searchParams.get("shopName")?.trim() ?? session.shop;
    const startTime = url.searchParams.get("startTime") ? Number(url.searchParams.get("startTime")) : undefined;
    const endTime = url.searchParams.get("endTime") ? Number(url.searchParams.get("endTime")) : undefined;
    const limit = url.searchParams.get("limit") ? Math.max(Math.min(Number(url.searchParams.get("limit")), 500), 10) : 100;

    // If Cosmos ops container is configured, read logs directly from Cosmos instead of proxying to AgentTask.
    if (isCosmosSparkOpsConfigured()) {
      if (queryType === "shop") {
        const logs = await queryScheduleLogsByShop(shopName || session.shop, startTime, endTime, limit);
        return Response.json({ success: true, response: { logs, total: Array.isArray(logs) ? logs.length : 0, shopName } });
      }
      if (queryType === "summary") {
        const summary = await queryScheduleLogSummary(taskId);
        return Response.json({ success: true, response: { summary } });
      }
      // default: task
      const logs = await queryScheduleLogsByTask(taskId, limit);
      return Response.json({ success: true, response: { logs, total: Array.isArray(logs) ? logs.length : 0 } });
    }

    let agentUrl: URL;

    if (queryType === "shop") {
      agentUrl = new URL(`${getAgentBaseUrl()}/translate/v3/schedule-logs/shop`);
      agentUrl.searchParams.set("shopName", shopName || session.shop);
      if (startTime) agentUrl.searchParams.set("startTime", String(startTime));
      if (endTime) agentUrl.searchParams.set("endTime", String(endTime));
      agentUrl.searchParams.set("limit", String(limit));
    } else if (queryType === "summary") {
      agentUrl = new URL(`${getAgentBaseUrl()}/translate/v3/schedule-logs/summary`);
      agentUrl.searchParams.set("taskId", taskId);
    } else {
      // default: task
      agentUrl = new URL(`${getAgentBaseUrl()}/translate/v3/schedule-logs/task`);
      agentUrl.searchParams.set("taskId", taskId);
      agentUrl.searchParams.set("limit", String(limit));
    }

    const response = await fetch(agentUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          errorCode: response.status || 500,
          errorMsg: data.errorMsg || "Failed to fetch schedule logs from agent",
          response: null,
        },
        { status: response.status || 500 }
      );
    }

    return Response.json({
      success: data.success !== false,
      errorCode: data.errorCode || 0,
      errorMsg: data.errorMsg || "",
      response: data.response || data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch schedule logs";
    return Response.json(
      {
        success: false,
        errorCode: 500,
        errorMsg: message,
        response: null,
      },
      { status: 500 }
    );
  }
};

function getAgentBaseUrl(): string {
  const baseRaw = process.env.AGENT_TASK_BASE_URL?.trim() || DEFAULT_AGENT_BASE;
  return baseRaw.replace(/\/+$/, "");
}
