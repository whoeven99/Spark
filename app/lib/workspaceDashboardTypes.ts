export type WorkspaceDashboardMetricTone = "positive" | "negative" | "neutral";

export type WorkspaceDashboardMetric = {
  label: string;
  value: string;
  delta: string;
  tone: WorkspaceDashboardMetricTone;
  /** 尚未接入真实数据源，标题展示「待接入」 */
  pendingIntegration?: boolean;
};

export type WorkspaceDashboardAlertTone = "warning" | "info" | "critical";

export type WorkspaceDashboardAlert = {
  title: string;
  detail: string;
  tone: WorkspaceDashboardAlertTone;
};

export type WorkspaceDashboardTaskSummary = {
  id: string;
  title: string;
  result: string;
};

export type WorkspaceDashboardSnapshot = {
  hasData: boolean;
  snapshotDate?: string;
  generatedAt?: string;
  emptyMessage?: string;
  metrics: WorkspaceDashboardMetric[];
  alerts: WorkspaceDashboardAlert[];
  suggestions: string[];
  /** 任务列表（AI 任务 + 翻译 V4）最近几条摘要 */
  recentTaskSummaries: WorkspaceDashboardTaskSummary[];
};
