import type { TodayAnalysisTodo } from "./todayReportTypes";
import { buildWorkspaceChatPrefillPath } from "./workspaceChatPrefill";

export function buildTodayAnalysisTodoHref(todo: TodayAnalysisTodo): string {
  switch (todo.actionType) {
    case "open_report":
      return todo.payload.path;
    case "open_health_monitor": {
      const params = new URLSearchParams();
      if (todo.payload.view) params.set("view", todo.payload.view);
      if (todo.payload.monitor) params.set("monitor", todo.payload.monitor);
      const query = params.toString();
      return `/app/health-monitor${query ? `?${query}` : ""}`;
    }
    case "open_ads_insights": {
      const platform = todo.payload.platform ?? "all";
      if (platform === "all") return "/app/insights/performance";
      return `/app/insights/performance?platform=${platform}`;
    }
    case "open_task_center": {
      const params = new URLSearchParams();
      if (todo.payload.taskId) params.set("taskId", todo.payload.taskId);
      if (todo.payload.view && todo.payload.view !== "current") {
        params.set("unifiedView", todo.payload.view);
      }
      if (todo.payload.typeFilter && todo.payload.typeFilter !== "all") {
        params.set("unifiedType", todo.payload.typeFilter);
      }
      if (todo.payload.statusFilter && todo.payload.statusFilter !== "all") {
        params.set("unifiedStatus", todo.payload.statusFilter);
      }
      if (todo.payload.operationSourceFilter && todo.payload.operationSourceFilter.length > 0) {
        params.set("unifiedOperationSource", todo.payload.operationSourceFilter.join(","));
      }
      const query = params.toString();
      return `/app/tasks${query ? `?${query}` : ""}`;
    }
    case "open_assistant":
      return buildWorkspaceChatPrefillPath({
        prompt: todo.payload.prompt,
        openContextTool: todo.payload.openContextTool,
        managedAiContext: todo.payload.managedAiContext,
      });
  }
}

export function getTodayAnalysisTodoActionTone(actionType: TodayAnalysisTodo["actionType"]): "blue" | "green" | "orange" | "neutral" {
  switch (actionType) {
    case "open_report":
      return "blue";
    case "open_health_monitor":
      return "orange";
    case "open_ads_insights":
      return "green";
    case "open_task_center":
      return "neutral";
    case "open_assistant":
      return "blue";
  }
}

export function getTodayAnalysisTodoActionLabel(actionType: TodayAnalysisTodo["actionType"]): string {
  switch (actionType) {
    case "open_report":
      return "报告";
    case "open_health_monitor":
      return "健康度";
    case "open_ads_insights":
      return "广告";
    case "open_task_center":
      return "任务";
    case "open_assistant":
      return "AI";
  }
}
