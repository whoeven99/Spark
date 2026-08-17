import {
  PAGE_SPEED_CATEGORY_IDS,
  type PageSpeedAuditItem,
  type PageSpeedCategoryId,
  type PageSpeedCategoryReport,
  type PageSpeedMetric,
  type PageSpeedReport,
  type PageSpeedScoreBand,
  type PageSpeedStrategy,
} from "../../lib/pageSpeedTypes";

const METRIC_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
] as const;

type LighthouseAudit = {
  id?: string;
  title?: string;
  description?: string;
  displayValue?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
  };
};

type LighthouseCategory = {
  id?: string;
  title?: string;
  score?: number | null;
  auditRefs?: Array<{ id?: string; group?: string }>;
};

type PagespeedJson = {
  id?: string;
  analysisUTCTimestamp?: string;
  lighthouseResult?: {
    requestedUrl?: string;
    finalUrl?: string;
    fetchTime?: string;
    lighthouseVersion?: string;
    audits?: Record<string, LighthouseAudit>;
    categories?: Record<string, LighthouseCategory>;
  };
};

export function scoreToBand(score100: number | null): PageSpeedScoreBand | null {
  if (score100 == null || !Number.isFinite(score100)) return null;
  if (score100 >= 90) return "good";
  if (score100 >= 50) return "needs-improvement";
  return "poor";
}

export function lighthouseScoreTo100(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score)) return null;
  return Math.round(score * 100);
}

function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
}

function readAuditItem(audit: LighthouseAudit, id: string): PageSpeedAuditItem {
  const details = audit.details;
  return {
    id,
    title: audit.title?.trim() || id,
    description: stripMarkdownLinks(audit.description ?? ""),
    displayValue: audit.displayValue?.trim() || null,
    score: lighthouseScoreTo100(audit.score),
    savingsMs:
      typeof details?.overallSavingsMs === "number" ? details.overallSavingsMs : null,
    savingsBytes:
      typeof details?.overallSavingsBytes === "number" ? details.overallSavingsBytes : null,
  };
}

function isPassed(audit: LighthouseAudit): boolean {
  return audit.score === 1 || audit.scoreDisplayMode === "notApplicable";
}

function isManual(audit: LighthouseAudit): boolean {
  return audit.scoreDisplayMode === "manual";
}

function isOpportunity(audit: LighthouseAudit): boolean {
  const details = audit.details;
  if (details?.type === "opportunity") return true;
  return (
    typeof details?.overallSavingsMs === "number" ||
    typeof details?.overallSavingsBytes === "number"
  );
}

function emptyCategoryReport(
  id: PageSpeedCategoryId,
  title: string,
  score: number | null,
): PageSpeedCategoryReport {
  return {
    id,
    title,
    score,
    opportunities: [],
    diagnostics: [],
    failed: [],
    passed: [],
    manual: [],
    passedCount: 0,
    manualCount: 0,
  };
}

function classifyCategoryAudits(
  category: LighthouseCategory | undefined,
  audits: Record<string, LighthouseAudit>,
  id: PageSpeedCategoryId,
): PageSpeedCategoryReport {
  const score = lighthouseScoreTo100(category?.score);
  const report = emptyCategoryReport(id, category?.title?.trim() || id, score);
  for (const ref of category?.auditRefs ?? []) {
    const auditId = ref.id?.trim();
    if (!auditId || ref.group === "hidden" || ref.group === "metrics") continue;
    const audit = audits[auditId];
    if (!audit) continue;
    if (isManual(audit)) {
      report.manual.push(readAuditItem(audit, auditId));
      report.manualCount += 1;
      continue;
    }
    if (isPassed(audit)) {
      report.passed.push(readAuditItem(audit, auditId));
      report.passedCount += 1;
      continue;
    }
    const item = readAuditItem(audit, auditId);
    if (id === "performance" && isOpportunity(audit)) {
      report.opportunities.push(item);
    } else if (id === "performance") {
      report.diagnostics.push(item);
    } else {
      report.failed.push(item);
    }
  }
  return report;
}

function parseMetrics(audits: Record<string, LighthouseAudit>): PageSpeedMetric[] {
  return METRIC_IDS.flatMap((id) => {
    const audit = audits[id];
    if (!audit) return [];
    return [
      {
        id,
        title: audit.title?.trim() || id,
        displayValue: audit.displayValue?.trim() || "—",
        numericValue: typeof audit.numericValue === "number" ? audit.numericValue : null,
        band: scoreToBand(lighthouseScoreTo100(audit.score)),
      },
    ];
  });
}

export function parsePageSpeedResponse(
  json: unknown,
  strategy: PageSpeedStrategy,
  locale = "en",
): PageSpeedReport | null {
  if (!json || typeof json !== "object") return null;
  const payload = json as PagespeedJson;
  const lighthouse = payload.lighthouseResult;
  if (!lighthouse?.categories || !lighthouse.audits) return null;

  const reports = {} as Record<PageSpeedCategoryId, PageSpeedCategoryReport>;
  for (const id of PAGE_SPEED_CATEGORY_IDS) {
    reports[id] = classifyCategoryAudits(lighthouse.categories[id], lighthouse.audits, id);
  }

  return {
    requestedUrl: lighthouse.requestedUrl?.trim() || payload.id || "",
    finalUrl: lighthouse.finalUrl?.trim() || lighthouse.requestedUrl?.trim() || payload.id || "",
    strategy,
    locale,
    fetchTime: lighthouse.fetchTime ?? payload.analysisUTCTimestamp ?? null,
    lighthouseVersion: lighthouse.lighthouseVersion ?? null,
    categories: PAGE_SPEED_CATEGORY_IDS.map((id) => ({
      id,
      title: reports[id].title,
      score: reports[id].score,
      band: scoreToBand(reports[id].score),
    })),
    metrics: parseMetrics(lighthouse.audits),
    reports,
  };
}
