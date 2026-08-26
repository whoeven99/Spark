import type { AiDrilldownAction, AiDrilldownMetric, AiDrilldownStatus } from "./aiDrilldownContext";
import type { ManagedAiLaunchContext } from "./managedAiLaunchContext";

export type TodayDecisionReportKey = "revenue" | "profit" | "roi" | "traffic" | "conversion";

export type TodayMetricTone = "positive" | "neutral" | "warning" | "negative";

export type TodayDataSource = "realized" | "estimated" | "predicted" | "pending";

export type TodayMetricStatus = AiDrilldownStatus;

export type TodayMetricAction = AiDrilldownAction;

export type TodaySummaryMetric = AiDrilldownMetric;

export type TodayHeader = {
  status: "healthy" | "watch" | "risk";
  statusLabel: string;
  summary: string;
  primaryBottleneck: string;
  biggestOpportunity: string;
  dataFreshness: string;
  dataConfidence: "high" | "medium" | "low";
  metrics: {
    revenue: string;
    estimatedProfit: string;
    estimatedProfitMargin: string;
    shortTermReturn: string;
  };
};

export type TodayMetricCard = {
  key: "revenue" | "cost" | "profit" | "profit_margin" | "orders" | "aov";
  label: string;
  value: string;
  delta: string;
  tone: TodayMetricTone;
  source: "realized" | "estimated";
  summary?: string;
  href: string;
};

export type TodayReasonCard = {
  key: string;
  title: string;
  value: string;
  label: string;
  meta: string;
  summary: string;
  tone: "blue" | "green" | "orange" | "red";
  href?: string;
};

export type TodayRoiSummaryCard = {
  key: "short_term" | "payback" | "lifetime";
  label: string;
  statusLabel: string;
  value: string;
  summary: string;
  dataQuality: TodayDataSource;
  confidence: "high" | "medium" | "low";
  href: string;
};

export type TodayRoiSummary = {
  cards: TodayRoiSummaryCard[];
};

export type TodayAnalysisTopicKey =
  | "product"
  | "ads"
  | "orders"
  | "after_sales"
  | "customer_value";

export type TodayAnalysisTodoActionType =
  | "open_report"
  | "open_health_monitor"
  | "open_ads_insights"
  | "open_task_center"
  | "open_assistant";

export type TodayAnalysisTodo =
  | {
      key: string;
      title: string;
      detail: string;
      actionLabel: string;
      actionType: "open_report";
      payload: {
        path: string;
      };
    }
  | {
      key: string;
      title: string;
      detail: string;
      actionLabel: string;
      actionType: "open_health_monitor";
      payload: {
        view?: "overview" | "run" | "detail";
        monitor?: string | null;
      };
    }
  | {
      key: string;
      title: string;
      detail: string;
      actionLabel: string;
      actionType: "open_ads_insights";
      payload: {
        platform?: "all" | "meta" | "google" | "tiktok";
      };
    }
  | {
      key: string;
      title: string;
      detail: string;
      actionLabel: string;
      actionType: "open_task_center";
      payload: {
        taskId?: string | null;
        view?: "current" | "history";
        typeFilter?:
          | "all"
          | "automation_task"
          | "operation_task"
          | "product_improve"
          | "image_generation"
          | "picture_translate";
        statusFilter?:
          | "all"
          | "running"
          | "open"
          | "in_progress"
          | "needs_review"
          | "failed"
          | "completed"
          | "ignored";
        operationSourceFilter?: string[];
      };
    }
  | {
      key: string;
      title: string;
      detail: string;
      actionLabel: string;
      actionType: "open_assistant";
      payload: {
        prompt: string;
        openContextTool?: string | null;
        managedAiContext?: ManagedAiLaunchContext | null;
      };
    };

export type TodayAnalysisEvidence = {
  label: string;
  value: string;
  change?: string;
};

export type TodayAnalysisCard = {
  key: string;
  title: string;
  question: string;
  conclusion: string;
  metricLabel: string;
  metricValue: string;
  evidence: TodayAnalysisEvidence[];
  ideas: string[];
  todos: TodayAnalysisTodo[];
};

export type TodayAnalysisPageReport = {
  key: TodayAnalysisTopicKey;
  title: string;
  subtitle: string;
  summary: string;
  principles: string[];
  cards: TodayAnalysisCard[];
};

export type TodayAnalysisOverviewCard = {
  key: TodayAnalysisTopicKey;
  title: string;
  question: string;
  conclusion: string;
  metricLabel: string;
  metricValue: string;
  todoCount: number;
  href: string;
};

export type TodayOverviewReport = {
  header: TodayHeader;
  metricCards: TodayMetricCard[];
  reasonCards: TodayReasonCard[];
  roiSummary: TodayRoiSummary;
};

export type TodayBreakdownRow = {
  label: string;
  value: string;
  meta: string;
  chartValue?: number;
};

export type TodayBreakdownBlock = {
  key: string;
  title: string;
  summary: string;
  rows: TodayBreakdownRow[];
  relatedGroupKeys: string[];
};

export type TodayObjectReport = {
  title: string;
  subtitle: string;
  headlineMetrics: TodaySummaryMetric[];
  conclusion: string;
  analysisPoints: string[];
  actions: TodayMetricAction[];
};

export type TodayObjectCard = {
  id: string;
  title: string;
  objectType: "product" | "order" | "channel" | "page";
  metrics: TodaySummaryMetric[];
  summary: string;
  primaryActionLabel: string;
  report: TodayObjectReport;
};

export type TodayEvidenceGroup = {
  key: string;
  title: string;
  tone: "positive" | "warning" | "negative" | "neutral";
  summary: string;
  items: TodayObjectCard[];
};

export type TodayDecisionReport = {
  key: TodayDecisionReportKey;
  title: string;
  subtitle: string;
  accent: string;
  primaryQuestion: string;
  summary: string;
  conclusionPoints?: string[];
  statuses: TodayMetricStatus[];
  summaryMetrics: TodaySummaryMetric[];
  breakdowns: TodayBreakdownBlock[];
  groups: TodayEvidenceGroup[];
  supplementaryGroups?: TodayEvidenceGroup[];
  actions: TodayMetricAction[];
};
