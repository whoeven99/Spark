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

/** 系统自动化（每日经营巡检）的最近执行摘要 */
export type WorkspaceDashboardAutomationSummary = {
  title: string;
  /** 最近执行时间（ISO） */
  lastRunAt: string | null;
  status: "healthy" | "attention";
  detail: string;
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
  /** 每日巡检自动化摘要（无快照时为空） */
  automation?: WorkspaceDashboardAutomationSummary;
};
