import type { OperationTaskView } from "../server/operations/dailyInspection.server";

export type OperationTaskPresentationEffect =
  | "revenue"
  | "conversion"
  | "retention"
  | "efficiency";

export type OperationTaskPresentation = {
  objective: string;
  impactMetric: string;
  estimatedLift: string;
  roiImpact: string;
  effect: OperationTaskPresentationEffect;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ReportTaskMetadata = {
  objective?: string;
  impactMetrics?: string[];
  estimatedLift?: string | null;
  roiImpactSummary?: string;
  effect?: OperationTaskPresentationEffect;
};

function getReportTaskMetadata(relatedObjects: unknown): ReportTaskMetadata | null {
  if (!relatedObjects || typeof relatedObjects !== "object" || Array.isArray(relatedObjects)) {
    return null;
  }
  const reportTask = (relatedObjects as Record<string, unknown>).reportTask;
  if (!reportTask || typeof reportTask !== "object" || Array.isArray(reportTask)) {
    return null;
  }
  return reportTask as ReportTaskMetadata;
}

export function inferOperationTaskPresentation(
  task: OperationTaskView,
  t: Translate,
): OperationTaskPresentation {
  const reportTask = getReportTaskMetadata(task.relatedObjects);
  if (reportTask?.objective && reportTask?.roiImpactSummary) {
    const impactMetric =
      reportTask.impactMetrics?.filter((metric): metric is string => Boolean(metric)).join(" / ") ||
      t("dailyOps.taskMetricTraffic");
    return {
      objective: reportTask.objective,
      impactMetric,
      estimatedLift: reportTask.estimatedLift?.trim() || "—",
      roiImpact: reportTask.roiImpactSummary,
      effect: reportTask.effect ?? "conversion",
    };
  }

  if (
    task.sourceKey === "fulfillment_overdue" ||
    task.sourceKey === "logistics_stale" ||
    task.sourceKey === "routine_shipping"
  ) {
    return {
      objective: t("dailyOps.taskObjectiveFulfillment"),
      impactMetric: t("dailyOps.taskMetricFulfillment"),
      estimatedLift: t("dailyOps.taskLiftFulfillment"),
      roiImpact: t("dailyOps.taskRoiFulfillment"),
      effect: "efficiency",
    };
  }

  if (task.sourceKey === "refund_spike") {
    return {
      objective: t("dailyOps.taskObjectiveRefund"),
      impactMetric: t("dailyOps.taskMetricRefund"),
      estimatedLift: t("dailyOps.taskLiftRefund"),
      roiImpact: t("dailyOps.taskRoiRefund"),
      effect: "retention",
    };
  }

  if (task.sourceKey === "inventory_risk" || task.sourceKey === "inventory_replenish_plan") {
    return {
      objective: t("dailyOps.taskObjectiveInventory"),
      impactMetric: t("dailyOps.taskMetricInventory"),
      estimatedLift: t("dailyOps.taskLiftInventory"),
      roiImpact: t("dailyOps.taskRoiInventory"),
      effect: "revenue",
    };
  }

  return {
    objective: t("dailyOps.taskObjectiveTraffic"),
    impactMetric: t("dailyOps.taskMetricTraffic"),
    estimatedLift: t("dailyOps.taskLiftTraffic"),
    roiImpact: t("dailyOps.taskRoiTraffic"),
    effect: task.sourceKey === "sales_decline" ? "revenue" : "conversion",
  };
}

export function buildOperationTaskPrompt(
  task: OperationTaskView,
  presentation: OperationTaskPresentation,
  options: {
    taskStatusText: string;
    dueWindowText: string;
    t: Translate;
  },
) {
  const { taskStatusText, dueWindowText, t } = options;
  const actionLines =
    task.suggestedActions.length > 0
      ? task.suggestedActions.map((action) => `- ${action}`).join("\n")
      : `- ${t("dailyOps.taskNoSuggestedActions")}`;

  return [
    t("dailyOps.taskPromptHeader"),
    `${t("dailyOps.taskPromptTitle")}：${task.title}`,
    `${t("dailyOps.taskPromptStatus")}：${taskStatusText}`,
    `${t("dailyOps.taskPromptReason")}：${task.triggerReason}`,
    `${t("dailyOps.taskPromptObjective")}：${presentation.objective}`,
    `${t("dailyOps.taskPromptMetric")}：${presentation.impactMetric}`,
    `${t("dailyOps.taskPromptLift")}：${presentation.estimatedLift}`,
    `${t("dailyOps.taskPromptRoi")}：${presentation.roiImpact}`,
    `${t("dailyOps.taskPromptDue")}：${dueWindowText}`,
    task.ownerRole
      ? `${t("dailyOps.taskPromptOwner")}：${task.ownerRole}`
      : `${t("dailyOps.taskPromptOwner")}：${t("dailyOps.taskPromptOwnerUnknown")}`,
    `${t("dailyOps.taskPromptActions")}：\n${actionLines}`,
    "",
    t("dailyOps.taskPromptInstruction"),
  ].join("\n");
}
