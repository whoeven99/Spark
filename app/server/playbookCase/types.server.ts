export type PlaybookCaseStatus =
  | "open"
  | "adopted"
  | "ignored"
  | "later"
  | "inaccurate"
  | "closed";

export type PlaybookCaseSeverity = "info" | "watch" | "risk";

export type PlaybookCaseDiagnosis = {
  title: string;
  detail?: string;
  severity?: PlaybookCaseSeverity;
  metrics?: Record<string, unknown>;
};

export type PlaybookCaseEvidence = {
  label: string;
  value?: string | number | boolean | null;
  detail?: string;
  source?: string;
};

export type PlaybookCaseAction = {
  title: string;
  detail?: string;
  priority?: "P0" | "P1" | "P2" | "P3";
  ownerRole?: string;
  status?: "proposed" | "accepted" | "done" | "dismissed";
  relatedObjects?: Record<string, unknown>;
};

export type PlaybookCaseReviewMetric = {
  key: string;
  label: string;
  current?: string | number | boolean | null;
  target?: string | number | boolean | null;
  direction?: "increase" | "decrease" | "stable";
};

export type PlaybookCaseFollowUp = {
  title: string;
  detail?: string;
  dueAt?: string;
};

export type PlaybookStructuredResult = {
  diagnosis: PlaybookCaseDiagnosis[];
  evidence: PlaybookCaseEvidence[];
  actions: PlaybookCaseAction[];
  reviewMetrics: PlaybookCaseReviewMetric[];
  followUps: PlaybookCaseFollowUp[];
};

export type PlaybookCaseDraft = {
  title: string;
  severity: PlaybookCaseSeverity;
  reviewDueAt?: string;
};

export type PlaybookCaseRefs = {
  agentRunId?: string;
  conversationId?: string;
  messageId?: string;
  diagnosisSnapshotId?: string;
};

export type PlaybookCaseFeedback = {
  action: Exclude<PlaybookCaseStatus, "open" | "closed">;
  note?: string;
  createdAt: string;
};

export type PlaybookCaseDoc = {
  id: string;
  shop: string;
  appName: "spark";
  playbookName: string;
  playbookDisplayName: string;
  title: string;
  status: PlaybookCaseStatus;
  severity: PlaybookCaseSeverity;
  goal: string;
  constraints?: string;
  summary: string;
  structuredResult: PlaybookStructuredResult;
  snapshotDate?: string;
  refs: PlaybookCaseRefs;
  feedback?: PlaybookCaseFeedback;
  createdAt: string;
  updatedAt: string;
  reviewDueAt?: string;
};
