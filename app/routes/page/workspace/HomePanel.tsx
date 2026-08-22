/** 工作台首页 — 对齐 Spark 首页实装预览：问候、AI 输入、店铺概览、任务监控。 */
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import type {
  AutomationOverview,
  AutomationOverviewResponse,
  PlaybookSurfaceItem,
} from "../../../lib/automationOverviewTypes";
import type { WorkspaceDashboardSnapshot } from "../../../lib/workspaceDashboardTypes";
import type { ContextTool } from "./types";
import {
  metricDeltaStyle,
  metricLabelStyle,
  metricValueStyle,
  mutedMetaStyle,
  panelStackStyle,
  sectionTextStyle,
  sectionTitleSmallStyle,
  shopifyUi,
  surfaceCardStyle,
  textButtonStyle,
} from "./styles";

function greetingForHour(
  hour: number,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (hour < 6) return t("workspace.home.greeting.lateNight");
  if (hour < 12) return t("workspace.home.greeting.morning");
  if (hour < 18) return t("workspace.home.greeting.afternoon");
  return t("workspace.home.greeting.evening");
}

function formatHomeDate(
  now: Date,
  locale: string,
): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(now);
  if (locale.startsWith("zh")) {
    return `${weekday} · ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  }
  return `${weekday} · ${now.getMonth() + 1}/${now.getDate()}`;
}

function formatInspectionTime(
  iso: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (!iso) return t("workspace.home.today");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("workspace.home.today");
  return t("workspace.home.inspectionAt", {
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  });
}

function alertToneLabel(
  tone: "warning" | "info" | "critical",
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (tone === "critical") return t("workspace.home.alertTone.critical");
  if (tone === "warning") return t("workspace.home.alertTone.warning");
  return t("workspace.home.alertTone.info");
}

function localizeDashboardMetricLabel(
  label: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const map: Record<string, string> = {
    "销售额": "workspace.dashboard.metrics.sales",
    "订单数": "workspace.dashboard.metrics.orders",
    "转化率": "workspace.dashboard.metrics.conversionRate",
    "客单价": "workspace.dashboard.metrics.aov",
    "退款率": "workspace.dashboard.metrics.refundRate",
    "库存风险 SKU": "workspace.dashboard.metrics.riskSku",
  };
  const key = map[label];
  return key ? t(key) : label;
}

function localizeDashboardText(
  text: string,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const exactMap: Record<string, string> = {
    "暂无订单数据，无法生成诊断。新订单会自动同步，历史订单请先在补录页执行回填。":
      t("workspace.dashboard.empty.orders"),
    "暂无可用经营数据": t("workspace.home.command.noData"),
    "完成数据回补后会生成今日经营摘要": t("workspace.home.command.snapshotPending"),
    "当前未发现紧急风险，可在健康度监测查看完整诊断，并到任务中心跟进待办。":
      t("workspace.home.command.noUrgentRisk"),
    "需 Shopify 弃购或 Analytics": t("workspace.dashboard.metrics.pendingSource"),
    "无上期数据": t("workspace.dashboard.metrics.noPreviousData"),
    "暂无需要优先处理的风险。": t("workspace.home.command.noPriorityRisk"),
    "暂无经营数据。": t("workspace.home.command.noBusinessData"),
  };
  if (exactMap[text]) {
    return exactMap[text];
  }

  const watchSkuMatch = text.match(/^关注 SKU (\d+)$/);
  if (watchSkuMatch) {
    return t("workspace.dashboard.metrics.watchSku", { count: Number(watchSkuMatch[1]) });
  }

  return text
    .replace(/^执行中/, t("workspace.dashboard.taskStatus.running"))
    .replace(/^已完成/, t("workspace.dashboard.taskStatus.succeeded"))
    .replace(/^失败/, t("workspace.dashboard.taskStatus.failed"))
    .replace(/^已取消/, t("workspace.dashboard.taskStatus.cancelled"))
    .replace(/^待审核/, t("workspace.dashboard.taskStatus.pendingReview"))
    .replace(/^已应用/, t("workspace.dashboard.taskStatus.applied"))
    .replace(/^已评分/, t("workspace.dashboard.taskStatus.scored"))
    .replace(/(\d+) 个商品/g, (_, count: string) =>
      t("workspace.dashboard.count.products", { count: Number(count) }),
    );
}

function localizeDashboardSnapshot(
  snapshot: WorkspaceDashboardSnapshot,
  t: ReturnType<typeof useTranslation>["t"],
): WorkspaceDashboardSnapshot {
  return {
    ...snapshot,
    emptyMessage: snapshot.emptyMessage
      ? localizeDashboardText(snapshot.emptyMessage, t)
      : snapshot.emptyMessage,
    metrics: snapshot.metrics.map((metric) => ({
      ...metric,
      label: localizeDashboardMetricLabel(metric.label, t),
      delta: localizeDashboardText(metric.delta, t),
    })),
    suggestions: snapshot.suggestions.map((item) => localizeDashboardText(item, t)),
    recentTaskSummaries: snapshot.recentTaskSummaries.map((task) => ({
      ...task,
      result: localizeDashboardText(task.result, t),
    })),
  };
}

function alertToneStyle(tone: "warning" | "info" | "critical") {
  const map = {
    critical: { color: "#d82c0d", background: "#fff0ee", border: "#f4b3a7" },
    warning: { color: "#9a5b00", background: "#fff7e0", border: "#f0d48a" },
    info: { color: "#2c4fc4", background: "rgba(64,112,244,0.1)", border: "#c8d7ff" },
  };
  return map[tone];
}

const homeStyles = {
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap" as const,
  },
  greetingTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: shopifyUi.text,
    letterSpacing: "-0.02em",
  },
  greetingDate: {
    marginTop: 6,
    fontSize: 13,
    color: shopifyUi.textMuted,
  },
  statusPill: (attention: boolean) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      color: attention ? "#9a5b00" : "#0f5132",
      background: attention ? "#fff7e0" : "#e9f7ef",
      border: `1px solid ${attention ? "#f0d48a" : "#b8e6c8"}`,
      whiteSpace: "nowrap" as const,
    }) as const,
  statusDot: (attention: boolean) =>
    ({
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: attention ? "#f0a01d" : shopifyUi.primary,
      flexShrink: 0,
    }) as const,
  assistantCard: {
    ...surfaceCardStyle,
    padding: "18px 20px 18px",
    border: `1px solid ${shopifyUi.border}`,
    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  },
  assistantBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: shopifyUi.primary,
    marginBottom: 10,
  },
  assistantTitle: {
    margin: "0 0 12px",
    fontSize: 16,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  composerShell: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 14,
    background: shopifyUi.surfaceSubtle,
    padding: "14px 14px 12px",
  },
  composerInput: {
    width: "100%",
    minHeight: 74,
    border: "none",
    outline: "none",
    resize: "none" as const,
    background: "transparent",
    fontSize: 14,
    lineHeight: 1.55,
    color: shopifyUi.text,
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  composerFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
    flexWrap: "wrap" as const,
  },
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  contextChip: {
    border: `1px solid ${shopifyUi.borderStrong}`,
    borderRadius: 999,
    background: shopifyUi.surface,
    color: shopifyUi.textSecondary,
    padding: "5px 11px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sendButton: (disabled: boolean) =>
    ({
      width: 36,
      height: 36,
      borderRadius: "50%",
      border: "none",
      background: disabled ? "#c9cccf" : shopifyUi.primary,
      color: "#ffffff",
      fontSize: 16,
      fontWeight: 700,
      cursor: disabled ? "default" : "pointer",
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    }) as const,
  quickPillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 14,
  },
  quickPill: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 999,
    background: shopifyUi.surface,
    color: shopifyUi.textSecondary,
    padding: "7px 13px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  playbookSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: `1px solid ${shopifyUi.border}`,
    display: "grid",
    gap: 10,
  },
  playbookHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  playbookTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  playbookMeta: {
    fontSize: 12,
    color: shopifyUi.textMuted,
  },
  playbookGrid: (mobile: boolean) =>
    ({
      display: "grid",
      gridTemplateColumns: mobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
      gap: 10,
    }) as const,
  playbookCard: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 12,
    background: shopifyUi.surface,
    padding: "12px 12px 11px",
    display: "grid",
    gap: 8,
    textAlign: "left" as const,
  },
  playbookCardTop: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  playbookIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: `1px solid ${shopifyUi.border}`,
    background: shopifyUi.surfaceSubtle,
    color: shopifyUi.textSecondary,
    display: "grid",
    placeItems: "center",
    fontSize: 10,
    fontWeight: 800,
    flexShrink: 0,
  },
  playbookName: {
    fontSize: 13,
    fontWeight: 700,
    color: shopifyUi.text,
    lineHeight: 1.35,
  },
  playbookSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: shopifyUi.textSecondary,
    lineHeight: 1.4,
  },
  evidenceRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
  },
  evidenceChip: {
    borderRadius: 999,
    background: "#f1f2f3",
    color: "#5c6066",
    padding: "2px 7px",
    fontSize: 11,
    fontWeight: 600,
  },
  playbookButton: {
    border: `1px solid ${shopifyUi.borderStrong}`,
    borderRadius: 10,
    background: shopifyUi.surfaceSubtle,
    color: shopifyUi.text,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  sectionCard: {
    ...surfaceCardStyle,
    padding: "20px 22px",
    border: `1px solid ${shopifyUi.border}`,
  },
  commandGrid: (mobile: boolean) =>
    ({
      display: "grid",
      gridTemplateColumns: mobile ? "1fr" : "minmax(0, 1.55fr) minmax(320px, 0.95fr)",
      gap: 14,
      alignItems: "stretch",
    }) as const,
  commandMain: {
    ...surfaceCardStyle,
    padding: "20px 22px",
    border: `1px solid ${shopifyUi.border}`,
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  },
  commandSide: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  commandEyebrow: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.08em",
    color: shopifyUi.textMuted,
  },
  commandTitle: {
    margin: "3px 0 0",
    fontSize: 20,
    fontWeight: 750,
    color: shopifyUi.text,
    lineHeight: 1.25,
  },
  commandMeta: {
    marginTop: 5,
    fontSize: 12,
    color: shopifyUi.textMuted,
  },
  summaryGrid: (mobile: boolean) =>
    ({
      display: "grid",
      gridTemplateColumns: mobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
      gap: 10,
    }) as const,
  summaryMetric: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 12,
    background: shopifyUi.surfaceSubtle,
    padding: "12px 12px 10px",
    minHeight: 84,
  },
  alertList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 9,
  },
  alertItem: (tone: "warning" | "info" | "critical") => {
    const s = alertToneStyle(tone);
    return {
      border: `1px solid ${s.border}`,
      borderRadius: 12,
      background: s.background,
      padding: "11px 12px",
      display: "grid",
      gap: 5,
    } as const;
  },
  alertBadge: (tone: "warning" | "info" | "critical") => {
    const s = alertToneStyle(tone);
    return {
      width: "fit-content",
      borderRadius: 999,
      color: s.color,
      background: "#ffffff",
      border: `1px solid ${s.border}`,
      padding: "1px 7px",
      fontSize: 11,
      fontWeight: 750,
    } as const;
  },
  actionList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  actionButton: {
    width: "100%",
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 10,
    background: shopifyUi.surface,
    color: shopifyUi.text,
    padding: "9px 10px",
    fontSize: 12,
    fontWeight: 700,
    textAlign: "left" as const,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1.35,
  },
  taskList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 9,
  },
  taskItem: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 10,
    background: shopifyUi.surfaceSubtle,
    padding: "9px 10px",
    display: "grid",
    gap: 3,
  },
  sectionHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: shopifyUi.text,
  },
  metricsGrid: (columns: number) =>
    ({
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 12,
    }) as const,
  metricTile: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 12,
    background: shopifyUi.surfaceSubtle,
    padding: "14px 14px 12px",
  },
  pendingBadge: {
    display: "inline-block",
    marginLeft: 6,
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
    borderRadius: 999,
    color: "#6d7175",
    background: "#f1f2f3",
  },
  alertBar: {
    marginTop: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 10,
    background: "#fff7e0",
    border: "1px solid #f0d48a",
    fontSize: 13,
    color: "#7a4d00",
  },
  monitorGrid: (columns: number) =>
    ({
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 12,
    }) as const,
  monitorTile: {
    border: `1px solid ${shopifyUi.border}`,
    borderRadius: 12,
    background: shopifyUi.surfaceSubtle,
    padding: "14px 14px 12px",
    minHeight: 132,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  monitorBadge: (tone: "warning" | "info" | "neutral") => {
    const map = {
      warning: { color: "#9a5b00", background: "#fff7e0" },
      info: { color: "#2c4fc4", background: "rgba(64,112,244,0.12)" },
      neutral: { color: "#6d7175", background: "#f1f2f3" },
    };
    const s = map[tone];
    return {
      alignSelf: "flex-start" as const,
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 999,
      color: s.color,
      background: s.background,
    };
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "#e1e3e5",
    overflow: "hidden" as const,
  },
  progressFill: (percent: number, color: string) =>
    ({
      height: "100%",
      width: `${percent}%`,
      borderRadius: 999,
      background: color,
      transition: "width 0.4s ease",
    }) as const,
  activityList: {
    margin: "16px 0 0",
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  activityItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 13,
    color: shopifyUi.textSecondary,
    lineHeight: 1.5,
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: shopifyUi.primary,
    marginTop: 7,
    flexShrink: 0,
  },
};

export function HomePanel({
  displayName,
  snapshot,
  runningTaskCount,
  initialRenderTimeIso,
  onSubmitPrompt,
  onOpenContextTool,
  onMoreContext,
  onOpenDashboard,
  onOpenDailyOps,
  onOpenTasks,
}: {
  displayName: string;
  snapshot: WorkspaceDashboardSnapshot;
  runningTaskCount: number;
  initialRenderTimeIso?: string;
  onSubmitPrompt: (prompt: string) => void;
  onOpenContextTool: (tool: ContextTool) => void;
  onMoreContext: () => void;
  onOpenDashboard: () => void;
  onOpenDailyOps: () => void;
  onOpenTasks: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [draft, setDraft] = useState("");
  const [automationOverview, setAutomationOverview] =
    useState<AutomationOverview | null>(null);
  const now = useMemo(() => {
    if (!initialRenderTimeIso) return new Date();
    const parsed = new Date(initialRenderTimeIso);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [initialRenderTimeIso]);
  const localizedSnapshot = useMemo(
    () => localizeDashboardSnapshot(snapshot, t),
    [snapshot, t],
  );
  const needsAttention = localizedSnapshot.automation?.status === "attention";
  const suggestionItems = localizedSnapshot.suggestions.slice(0, 3);
  const topMetrics = localizedSnapshot.metrics.slice(0, 5);
  const topAlerts = localizedSnapshot.alerts.slice(0, 3);
  const recentTasks = localizedSnapshot.recentTaskSummaries.slice(0, 3);
  const recommendedPlaybooks = automationOverview?.recommendedPlaybooks ?? [];
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const quickPrompts = useMemo(
    () => [
      {
        label: t("workspace.home.quickPrompts.diagnoseWeek.label"),
        prompt: t("workspace.home.quickPrompts.diagnoseWeek.prompt"),
      },
      {
        label: t("workspace.home.quickPrompts.handleRisks.label"),
        prompt: t("workspace.home.quickPrompts.handleRisks.prompt"),
      },
      {
        label: t("workspace.home.quickPrompts.optimizeCopy.label"),
        prompt: t("workspace.home.quickPrompts.optimizeCopy.prompt"),
      },
      {
        label: t("workspace.home.quickPrompts.reviewOrders.label"),
        prompt: t("workspace.home.quickPrompts.reviewOrders.prompt"),
      },
    ],
    [t],
  );
  const contextChips = useMemo(
    () => [
      { tool: "product" as const, label: t("workspace.home.context.product"), icon: "◫" },
      { tool: "order" as const, label: t("workspace.home.context.order"), icon: "◎" },
      { tool: "file" as const, label: t("workspace.home.context.file"), icon: "↑" },
    ],
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    fetch(`/api/automation-overview${authQuery}`)
      .then((res) => res.json() as Promise<AutomationOverviewResponse>)
      .then((json) => {
        if (cancelled) return;
        if (json.ok) setAutomationOverview(json.overview);
      })
      .catch(() => {
        if (!cancelled) setAutomationOverview(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    onSubmitPrompt(text);
    setDraft("");
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitDraft();
    }
  };

  return (
    <div style={panelStackStyle}>
      <header style={homeStyles.pageHeader}>
        <div>
          <h1 style={homeStyles.greetingTitle}>
            {t("workspace.home.greeting.title", {
              greeting: greetingForHour(now.getHours(), t),
              name: displayName,
            })}
          </h1>
          <div style={homeStyles.greetingDate}>{formatHomeDate(now, locale)}</div>
        </div>
        {snapshot.hasData || needsAttention ? (
          <div style={homeStyles.statusPill(needsAttention)}>
            <span style={homeStyles.statusDot(needsAttention)} aria-hidden="true" />
            {needsAttention
              ? t("workspace.home.status.needsAttention")
              : t("workspace.home.status.healthy")}
          </div>
        ) : null}
      </header>

      <CommandCenter
        snapshot={localizedSnapshot}
        topMetrics={topMetrics}
        topAlerts={topAlerts}
        suggestionItems={suggestionItems}
        recentTasks={recentTasks}
        recommendedPlaybooks={recommendedPlaybooks}
        runningTaskCount={runningTaskCount}
        needsAttention={needsAttention}
        isMobile={isMobile}
        onSubmitPrompt={onSubmitPrompt}
        onOpenDashboard={onOpenDashboard}
        onOpenDailyOps={onOpenDailyOps}
        onOpenTasks={onOpenTasks}
      />

      <section style={homeStyles.assistantCard}>
        <div style={homeStyles.assistantBadge}>
          <span aria-hidden="true">■</span>
          <span>{t("workspace.home.askSpark")}</span>
        </div>
        <h2 style={homeStyles.assistantTitle}>{t("workspace.home.assistantTitle")}</h2>
        <div style={homeStyles.composerShell}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={t("workspace.home.composerPlaceholder")}
            style={homeStyles.composerInput}
          />
          <div style={homeStyles.composerFooter}>
            <div style={homeStyles.chipRow}>
              {contextChips.map((chip) => (
                <button
                  key={chip.tool}
                  type="button"
                  style={homeStyles.contextChip}
                  onClick={() => onOpenContextTool(chip.tool)}
                >
                  {chip.icon} {chip.label}
                </button>
              ))}
              <button type="button" style={homeStyles.contextChip} onClick={onMoreContext}>
                + {t("workspace.home.moreContext")}
              </button>
            </div>
            <button
              type="button"
              style={homeStyles.sendButton(!draft.trim())}
              disabled={!draft.trim()}
              onClick={submitDraft}
              aria-label={t("workspace.home.send")}
            >
              ↑
            </button>
          </div>
        </div>
        <div style={homeStyles.quickPillRow}>
          {quickPrompts.map((item) => (
            <button
              key={item.label}
              type="button"
              style={homeStyles.quickPill}
              onClick={() => onSubmitPrompt(item.prompt)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CommandCenter({
  snapshot,
  topMetrics,
  topAlerts,
  suggestionItems,
  recentTasks,
  recommendedPlaybooks,
  runningTaskCount,
  needsAttention,
  isMobile,
  onSubmitPrompt,
  onOpenDashboard,
  onOpenDailyOps,
  onOpenTasks,
}: {
  snapshot: WorkspaceDashboardSnapshot;
  topMetrics: WorkspaceDashboardSnapshot["metrics"];
  topAlerts: WorkspaceDashboardSnapshot["alerts"];
  suggestionItems: string[];
  recentTasks: WorkspaceDashboardSnapshot["recentTaskSummaries"];
  recommendedPlaybooks: PlaybookSurfaceItem[];
  runningTaskCount: number;
  needsAttention: boolean;
  isMobile: boolean;
  onSubmitPrompt: (prompt: string) => void;
  onOpenDashboard: () => void;
  onOpenDailyOps: () => void;
  onOpenTasks: () => void;
}) {
  const { t } = useTranslation();
  const statusCopy = snapshot.hasData
    ? needsAttention
      ? t("workspace.home.command.needsAttention")
      : t("workspace.home.command.healthy")
    : snapshot.emptyMessage ?? t("workspace.home.command.noData");
  const metaCopy = snapshot.generatedAt
    ? t("workspace.home.command.updatedAt", {
        time: formatInspectionTime(snapshot.generatedAt, t),
      })
    : snapshot.snapshotDate
      ? t("workspace.home.command.snapshotDate", { date: snapshot.snapshotDate })
      : t("workspace.home.command.snapshotPending");
  const fallbackActions = [
    t("workspace.home.fallbackActions.report"),
    t("workspace.home.fallbackActions.sync"),
    t("workspace.home.fallbackActions.actions"),
  ];
  const actionItems =
    recommendedPlaybooks.length > 0
      ? recommendedPlaybooks.map((item) => ({
          key: item.id,
          label: item.title,
          detail: item.recommendationReason ?? item.entrySubtitle ?? item.detail,
          prompt: item.defaultPrompt,
        }))
      : fallbackActions.map((prompt) => ({
          key: prompt,
          label: prompt,
          detail: "",
          prompt,
        }));
  const metricColumns = isMobile ? 2 : 3;

  return (
    <section style={panelStackStyle}>
      <div style={homeStyles.commandMain}>
        <div style={homeStyles.sectionHead}>
          <div>
            <div style={homeStyles.commandEyebrow}>{t("workspace.home.command.eyebrow")}</div>
            <h2 style={homeStyles.commandTitle}>{statusCopy}</h2>
            <div style={homeStyles.commandMeta}>{metaCopy}</div>
          </div>
          <button type="button" style={textButtonStyle} onClick={onOpenDashboard}>
            {t("workspace.home.links.dashboard")} →
          </button>
        </div>
      </div>

      <div style={homeStyles.metricsGrid(isMobile ? 1 : 3)}>
        <section style={homeStyles.sectionCard}>
          <div style={homeStyles.sectionHead}>
            <div>
              <h3 style={homeStyles.sectionTitle}>
                {t("workspace.home.sections.businessMetrics")}
              </h3>
              <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
                {t("workspace.home.sections.businessMetricsHint")}
              </div>
            </div>
            <button type="button" style={textButtonStyle} onClick={onOpenDashboard}>
              {t("workspace.home.links.dashboard")} →
            </button>
          </div>
          <div style={homeStyles.metricsGrid(metricColumns)}>
            {topMetrics.map((metric) => (
              <div key={metric.label} style={homeStyles.summaryMetric}>
                <div style={metricLabelStyle}>
                  {metric.label}
                  {metric.pendingIntegration ? (
                    <span style={homeStyles.pendingBadge}>
                      {t("workspace.home.pendingIntegration")}
                    </span>
                  ) : null}
                </div>
                <div style={{ ...metricValueStyle, fontSize: 22, marginTop: 8 }}>{metric.value}</div>
                <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={homeStyles.sectionCard}>
          <div style={homeStyles.sectionHead}>
            <div>
              <h3 style={homeStyles.sectionTitle}>{t("workspace.home.sections.topRisks")}</h3>
              <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
                {t("workspace.home.sections.topRisksHint")}
              </div>
            </div>
            <button type="button" style={textButtonStyle} onClick={onOpenDailyOps}>
              {t("workspace.home.links.dailyOps")} →
            </button>
          </div>
          <div style={homeStyles.alertList}>
            {topAlerts.length > 0 ? (
              topAlerts.map((alert) => (
                <button
                  key={`${alert.title}-${alert.detail}`}
                  type="button"
                  style={{
                    ...homeStyles.alertItem(alert.tone),
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  onClick={onOpenDailyOps}
                >
                  <span style={homeStyles.alertBadge(alert.tone)}>
                    {alertToneLabel(alert.tone, t)}
                  </span>
                  <span style={sectionTitleSmallStyle}>{alert.title}</span>
                  <span style={sectionTextStyle}>{alert.detail}</span>
                </button>
              ))
            ) : (
              <div style={{ ...homeStyles.alertItem("info"), color: shopifyUi.textSecondary }}>
                {snapshot.hasData
                  ? t("workspace.home.command.noPriorityRisk")
                  : snapshot.emptyMessage ?? t("workspace.home.command.noBusinessData")}
              </div>
            )}
          </div>
          <div style={homeStyles.actionList}>
            {actionItems.slice(0, 3).map((item) => (
              <button
                key={item.key}
                type="button"
                style={homeStyles.actionButton}
                onClick={() => onSubmitPrompt(item.prompt)}
              >
                {item.label}
                {item.detail ? (
                  <span
                    style={{
                      display: "block",
                      marginTop: 3,
                      color: shopifyUi.textSecondary,
                      fontWeight: 500,
                    }}
                  >
                    {item.detail}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {suggestionItems.length > 0 ? (
            <ul style={homeStyles.activityList}>
              {suggestionItems.slice(0, 2).map((item) => (
                <li key={item} style={homeStyles.activityItem}>
                  <span style={homeStyles.activityDot} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section style={homeStyles.sectionCard}>
          <div style={homeStyles.sectionHead}>
            <div>
              <h3 style={homeStyles.sectionTitle}>{t("workspace.home.sections.recentTasks")}</h3>
              <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
                {runningTaskCount > 0
                  ? t("workspace.home.sections.runningTasks", { count: runningTaskCount })
                  : t("workspace.home.sections.noRunningTasks")}
              </div>
            </div>
            <button type="button" style={textButtonStyle} onClick={onOpenTasks}>
              {t("workspace.home.links.tasks")} →
            </button>
          </div>
          {snapshot.automation ? (
            <div style={{ ...homeStyles.taskItem, marginBottom: 10 }}>
              <span style={sectionTitleSmallStyle}>{snapshot.automation.title}</span>
              <span style={sectionTextStyle}>{snapshot.automation.detail}</span>
              {snapshot.automation.lastRunAt ? (
                <span style={mutedMetaStyle}>
                  {formatInspectionTime(snapshot.automation.lastRunAt, t)}
                </span>
              ) : null}
            </div>
          ) : null}
          <div style={homeStyles.taskList}>
            {recentTasks.length > 0 ? (
              recentTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  style={{
                    ...homeStyles.taskItem,
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  onClick={onOpenTasks}
                >
                  <span style={sectionTitleSmallStyle}>{task.title}</span>
                  <span style={sectionTextStyle}>{task.result}</span>
                </button>
              ))
            ) : (
              <div style={homeStyles.taskItem}>
                <span style={sectionTextStyle}>{t("workspace.home.sections.noRecentTasks")}</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
