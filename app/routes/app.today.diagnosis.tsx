import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import {
  ensureDailySnapshot,
  type OperationTaskView,
} from "../server/operations/dailyInspection.server";

function isClosedOperationTaskStatus(status: OperationTaskView["status"]) {
  return status === "done" || status === "ignored" || status === "auto_closed";
}

function resolveHealthMonitorFromDiagnosis(url: URL) {
  const riskTab =
    (url.searchParams.get("riskTab") as "environment" | "insights" | "health" | null) ?? null;
  const environmentKey = url.searchParams.get("environmentKey")?.trim() || null;
  const insightKey = url.searchParams.get("insightKey")?.trim() || null;

  const monitorByEnvironment: Record<string, string> = {
    inventory: "inventory-health",
    fulfillment: "fulfillment-health",
    "after-sales": "refund-health",
    conversion: "conversion-health",
    "new-arrivals": "product-readiness-health",
    payments: "payment-health",
    "risk-control": "risk-control-health",
  };

  const monitorByInsight: Record<string, string> = {
    sales_trend: "revenue-health",
    traffic_anomaly: "traffic-health",
    conversion_health: "conversion-health",
    product_operations: "product-readiness-health",
    fulfillment_health: "fulfillment-health",
    logistics_anomaly: "fulfillment-health",
    refund_health: "refund-health",
    inventory_health: "inventory-health",
  };

  if (riskTab === "health") {
    return { view: "run" as const, monitor: null };
  }
  if (riskTab === "insights" && insightKey) {
    return {
      view: "detail" as const,
      monitor: monitorByInsight[insightKey] ?? "conversion-health",
    };
  }
  if (environmentKey) {
    return {
      view: "detail" as const,
      monitor: monitorByEnvironment[environmentKey] ?? "conversion-health",
    };
  }
  return { view: "run" as const, monitor: null };
}

function buildHealthMonitorPath(params: {
  view: "overview" | "run" | "detail";
  monitor?: string | null;
  returnTo?: string | null;
}) {
  const next = new URLSearchParams();
  next.set("view", params.view);
  if (params.monitor) next.set("monitor", params.monitor);
  if (params.returnTo) next.set("returnTo", params.returnTo);
  const query = next.toString();
  return `/app/health-monitor${query ? `?${query}` : ""}`;
}

function buildTodayRoiValuePath(params: {
  valueTab?: "framework" | "customers" | "channels" | "cost" | null;
  returnTo?: string | null;
}) {
  const next = new URLSearchParams();
  if (params.valueTab) next.set("valueTab", params.valueTab);
  if (params.returnTo) next.set("returnTo", params.returnTo);
  const query = next.toString();
  return `/app/today/roi${query ? `?${query}` : ""}`;
}

function buildTaskCenterPath(params: {
  taskId: string | null;
  returnTo?: string | null;
  task?: OperationTaskView | null;
}) {
  const next = new URLSearchParams();
  if (params.taskId) next.set("taskId", params.taskId);
  if (params.returnTo) next.set("returnTo", params.returnTo);
  if (params.task && isClosedOperationTaskStatus(params.task.status)) {
    next.set("unifiedView", "history");
  }
  const query = next.toString();
  return `/app/tasks${query ? `?${query}` : ""}`;
}

/**
 * Legacy diagnosis route is compatibility-only.
 * All formal destinations now live in Today, Health Monitor, or Tasks.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const detail = url.searchParams.get("detail");
  const returnTo = url.searchParams.get("returnTo")?.trim() || null;

  if (!detail) {
    throw redirect(`/app/health-monitor${url.search}`);
  }

  if (detail === "performance") {
    throw redirect(`/app/today${url.search}`);
  }

  if (detail === "risk") {
    const healthMonitor = resolveHealthMonitorFromDiagnosis(url);
    throw redirect(
      buildHealthMonitorPath({
        view: healthMonitor.view,
        monitor: healthMonitor.monitor,
        returnTo,
      }),
    );
  }

  if (detail === "value") {
    throw redirect(
      buildTodayRoiValuePath({
        valueTab:
          (url.searchParams.get("valueTab") as
            | "framework"
            | "customers"
            | "channels"
            | "cost"
            | null) ?? null,
        returnTo,
      }),
    );
  }

  if (detail === "task") {
    let result: Awaited<ReturnType<typeof ensureDailySnapshot>> | null = null;
    try {
      result = await ensureDailySnapshot(session.shop);
    } catch (error) {
      console.error("[app.today.diagnosis] failed to load daily snapshot, redirecting to task center without task lookup:", error);
    }
    const taskId = url.searchParams.get("taskId")?.trim() || null;
    const task = taskId
      ? result?.tasks.find((item) => item.id === taskId) ?? null
      : null;
    throw redirect(
      buildTaskCenterPath({
        taskId,
        returnTo,
        task,
      }),
    );
  }

  throw redirect(`/app/health-monitor${url.search}`);
};

export default function AppTodayDiagnosisCompatibilityRoute() {
  return null;
}
