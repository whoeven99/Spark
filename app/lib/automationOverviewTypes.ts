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

export type AutomationTemplateItem = {
  id: string;
  title: string;
  detail: string;
  /** Playbook 步骤标签（用于展示执行流程） */
  steps: string[];
};

export type AutomationOverview = {
  configured: AutomationConfiguredItem[];
  history: AutomationHistoryItem[];
  templates: AutomationTemplateItem[];
};

export type AutomationOverviewResponse =
  | { ok: true; overview: AutomationOverview }
  | { ok: false; error: string };
