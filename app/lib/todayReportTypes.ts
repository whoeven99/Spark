import type { AiDrilldownAction, AiDrilldownMetric, AiDrilldownStatus } from "./aiDrilldownContext";

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
