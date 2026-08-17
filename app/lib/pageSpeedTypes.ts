export const PAGE_SPEED_STRATEGIES = ["mobile", "desktop"] as const;
export type PageSpeedStrategy = (typeof PAGE_SPEED_STRATEGIES)[number];

export const PAGE_SPEED_CATEGORY_IDS = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;
export type PageSpeedCategoryId = (typeof PAGE_SPEED_CATEGORY_IDS)[number];

export type PageSpeedScoreBand = "good" | "needs-improvement" | "poor";

export type PageSpeedErrorCode =
  | "invalid_url"
  | "timeout"
  | "rate_limited"
  | "upstream"
  | "unreachable";

export type PageSpeedCategoryScore = {
  id: PageSpeedCategoryId;
  title: string;
  score: number | null;
  band: PageSpeedScoreBand | null;
};

export type PageSpeedMetric = {
  id: string;
  title: string;
  displayValue: string;
  numericValue: number | null;
  band: PageSpeedScoreBand | null;
};

export type PageSpeedAuditItem = {
  id: string;
  title: string;
  description: string;
  displayValue: string | null;
  score: number | null;
  savingsMs: number | null;
  savingsBytes: number | null;
};

export type PageSpeedCategoryReport = {
  id: PageSpeedCategoryId;
  title: string;
  score: number | null;
  opportunities: PageSpeedAuditItem[];
  diagnostics: PageSpeedAuditItem[];
  failed: PageSpeedAuditItem[];
  passed: PageSpeedAuditItem[];
  manual: PageSpeedAuditItem[];
  passedCount: number;
  manualCount: number;
};

export type PageSpeedReport = {
  requestedUrl: string;
  finalUrl: string;
  strategy: PageSpeedStrategy;
  locale: string;
  fetchTime: string | null;
  lighthouseVersion: string | null;
  categories: PageSpeedCategoryScore[];
  metrics: PageSpeedMetric[];
  reports: Record<PageSpeedCategoryId, PageSpeedCategoryReport>;
};

export type PageSpeedOkResponse = {
  ok: true;
  report: PageSpeedReport;
};

export type PageSpeedErrorResponse = {
  ok: false;
  errorCode: PageSpeedErrorCode;
  error: string;
};

export type PageSpeedResponse = PageSpeedOkResponse | PageSpeedErrorResponse;
