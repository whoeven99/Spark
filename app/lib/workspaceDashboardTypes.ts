export type WorkspaceDashboardMetricTone = "positive" | "negative" | "neutral";

export type WorkspaceDashboardMetric = {
  label: string;
  value: string;
  delta: string;
  tone: WorkspaceDashboardMetricTone;
};

export type WorkspaceDashboardAlertTone = "warning" | "info" | "critical";

export type WorkspaceDashboardAlert = {
  title: string;
  detail: string;
  tone: WorkspaceDashboardAlertTone;
};

export type WorkspaceDashboardSnapshot = {
  hasData: boolean;
  snapshotDate?: string;
  generatedAt?: string;
  emptyMessage?: string;
  metrics: WorkspaceDashboardMetric[];
  alerts: WorkspaceDashboardAlert[];
  suggestions: string[];
};
