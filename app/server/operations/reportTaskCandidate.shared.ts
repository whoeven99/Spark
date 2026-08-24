export type ReportTaskPriority = "P0" | "P1" | "P2";
export type ReportTaskQuadrant = "q1" | "q2" | "q3" | "q4";
export type ReportTaskDueWindow = "today" | "48h" | "this_week" | "backlog";
export type ReportTaskSourceType = "rule" | "hybrid";
export type ReportTaskConfidence = "high" | "medium" | "low";

/**
 * Shared report-task payload used when legacy report findings are materialized
 * into operation tasks.
 */
export type ReportTaskCandidate = {
  problemKey: string;
  sourceType: ReportTaskSourceType;
  priority: ReportTaskPriority;
  quadrant: ReportTaskQuadrant;
  dueWindow: ReportTaskDueWindow;
  ownerRole: string;
  objective: string;
  impactMetrics: string[];
  estimatedLift?: string;
  confidence: ReportTaskConfidence;
  riskEnvironment: string;
  whyNow: string;
  roiImpactSummary: string;
  action: string;
  dedupeKey: string;
  primaryObjectId?: string;
  primaryObjectType?: string;
  aiExecutionPrompt: string;
};
