/** 自动化面板（已配置 / 执行历史 / 任务模板）的共享类型，客户端与 /api/automation-overview 共用。 */

export type AutomationConfiguredItem = {
  id: string;
  title: string;
  schedule: string;
  /** 最近执行时间（ISO），从未执行为 null */
  lastRun: string | null;
  status: "healthy" | "attention";
  outcome: string;
};

export type AutomationHistoryItem = {
  id: string;
  title: string;
  detail: string;
};

export type PlaybookSurfaceItem = {
  id: string;
  title: string;
  detail: string;
  category: string;
  /** Playbook 步骤标签（用于展示执行流程） */
  steps: string[];
  icon?: string;
  entrySubtitle?: string;
  defaultPrompt: string;
  ctaLabel: string;
  evidence: string[];
  recommendationReason?: string;
  recommended?: boolean;
};

export type AutomationTemplateItem = PlaybookSurfaceItem;

export type AutomationOverview = {
  configured: AutomationConfiguredItem[];
  history: AutomationHistoryItem[];
  recommendedPlaybooks: PlaybookSurfaceItem[];
  templates: AutomationTemplateItem[];
};

export type AutomationOverviewResponse =
  | { ok: true; overview: AutomationOverview }
  | { ok: false; error: string };
