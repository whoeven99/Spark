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
      t("taskWorkbench.taskMetricTraffic");
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
      objective: t("taskWorkbench.taskObjectiveFulfillment"),
      impactMetric: t("taskWorkbench.taskMetricFulfillment"),
      estimatedLift: t("taskWorkbench.taskLiftFulfillment"),
      roiImpact: t("taskWorkbench.taskRoiFulfillment"),
      effect: "efficiency",
    };
  }

  if (
    task.sourceKey === "refund_spike" ||
    task.sourceKey === "after_sales_timeout"
  ) {
    return {
      objective: t("taskWorkbench.taskObjectiveRefund"),
      impactMetric: t("taskWorkbench.taskMetricRefund"),
      estimatedLift: t("taskWorkbench.taskLiftRefund"),
      roiImpact: t("taskWorkbench.taskRoiRefund"),
      effect: "retention",
    };
  }

  if (task.sourceKey === "inventory_risk" || task.sourceKey === "inventory_replenish_plan") {
    return {
      objective: t("taskWorkbench.taskObjectiveInventory"),
      impactMetric: t("taskWorkbench.taskMetricInventory"),
      estimatedLift: t("taskWorkbench.taskLiftInventory"),
      roiImpact: t("taskWorkbench.taskRoiInventory"),
      effect: "revenue",
    };
  }

  return {
    objective: t("taskWorkbench.taskObjectiveTraffic"),
    impactMetric: t("taskWorkbench.taskMetricTraffic"),
    estimatedLift: t("taskWorkbench.taskLiftTraffic"),
    roiImpact: t("taskWorkbench.taskRoiTraffic"),
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
      : `- ${t("taskWorkbench.taskNoSuggestedActions")}`;

  return [
    t("taskWorkbench.taskPromptHeader"),
    `${t("taskWorkbench.taskPromptTitle")}：${task.title}`,
    `${t("taskWorkbench.taskPromptStatus")}：${taskStatusText}`,
    `${t("taskWorkbench.taskPromptReason")}：${task.triggerReason}`,
    `${t("taskWorkbench.taskPromptObjective")}：${presentation.objective}`,
    `${t("taskWorkbench.taskPromptMetric")}：${presentation.impactMetric}`,
    `${t("taskWorkbench.taskPromptLift")}：${presentation.estimatedLift}`,
    `${t("taskWorkbench.taskPromptRoi")}：${presentation.roiImpact}`,
    `${t("taskWorkbench.taskPromptDue")}：${dueWindowText}`,
    task.ownerRole
      ? `${t("taskWorkbench.taskPromptOwner")}：${task.ownerRole}`
      : `${t("taskWorkbench.taskPromptOwner")}：${t("taskWorkbench.taskPromptOwnerUnknown")}`,
    `${t("taskWorkbench.taskPromptActions")}：\n${actionLines}`,
    "",
    t("taskWorkbench.taskPromptInstruction"),
  ].join("\n");
}
