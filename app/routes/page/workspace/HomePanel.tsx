/** 工作台首页 — 对齐 Spark 首页实装预览：问候、AI 输入、店铺概览、任务监控。 */
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
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

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  { label: "诊断本周经营", prompt: "帮我诊断本周经营情况，找出需要优先处理的问题，并给出 3 条可执行建议。" },
  { label: "处理今日风险", prompt: "根据今日经营巡检结果，帮我按影响从高到低列出今天最该处理的 3 件事。" },
  { label: "优化商品文案", prompt: "帮我优化一批商品的标题与描述，风格偏 SEO 与转化。" },
  { label: "查看待处理订单", prompt: "帮我查看当前待处理、异常或高风险订单，并给出处理建议。" },
];

const CONTEXT_CHIPS: Array<{ tool: ContextTool; label: string; icon: string }> = [
  { tool: "product", label: "商品", icon: "◫" },
  { tool: "order", label: "订单", icon: "◎" },
  { tool: "file", label: "文件", icon: "↑" },
];

function greetingForHour(hour: number): string {
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatHomeDate(now: Date): string {
  return `${WEEKDAY_LABELS[now.getDay()]} · ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
}

function formatInspectionTime(iso: string | null | undefined): string {
  if (!iso) return "今日";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "今日";
  return `今日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function alertToneLabel(tone: "warning" | "info" | "critical"): string {
  if (tone === "critical") return "风险";
  if (tone === "warning") return "关注";
  return "提示";
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
  onSubmitPrompt: (prompt: string) => void;
  onOpenContextTool: (tool: ContextTool) => void;
  onMoreContext: () => void;
  onOpenDashboard: () => void;
  onOpenDailyOps: () => void;
  onOpenTasks: () => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const [draft, setDraft] = useState("");
  const [automationOverview, setAutomationOverview] =
    useState<AutomationOverview | null>(null);
  const now = useMemo(() => new Date(), []);
  const needsAttention = snapshot.automation?.status === "attention";
  const suggestionItems = snapshot.suggestions.slice(0, 3);
  const topMetrics = snapshot.metrics.slice(0, 5);
  const topAlerts = snapshot.alerts.slice(0, 3);
  const recentTasks = snapshot.recentTaskSummaries.slice(0, 3);
  const recommendedPlaybooks = automationOverview?.recommendedPlaybooks ?? [];

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
            {greetingForHour(now.getHours())}，{displayName}
          </h1>
          <div style={homeStyles.greetingDate}>{formatHomeDate(now)}</div>
        </div>
        {snapshot.hasData || needsAttention ? (
          <div style={homeStyles.statusPill(needsAttention)}>
            <span style={homeStyles.statusDot(needsAttention)} aria-hidden="true" />
            {needsAttention ? "今日巡检有需关注事项" : "今日巡检正常"}
          </div>
        ) : null}
      </header>

      <CommandCenter
        snapshot={snapshot}
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
          <span>ASK SPARK</span>
        </div>
        <h2 style={homeStyles.assistantTitle}>继续追问，或直接发起一个任务</h2>
        <div style={homeStyles.composerShell}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="例如：把上面的库存风险拆成可执行清单，并告诉我先处理哪 3 个 SKU…"
            style={homeStyles.composerInput}
          />
          <div style={homeStyles.composerFooter}>
            <div style={homeStyles.chipRow}>
              {CONTEXT_CHIPS.map((chip) => (
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
                + 更多
              </button>
            </div>
            <button
              type="button"
              style={homeStyles.sendButton(!draft.trim())}
              disabled={!draft.trim()}
              onClick={submitDraft}
              aria-label="发送"
            >
              ↑
            </button>
          </div>
        </div>
        <div style={homeStyles.quickPillRow}>
          {QUICK_PROMPTS.map((item) => (
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
  const statusCopy = snapshot.hasData
    ? needsAttention
      ? "今天有需要优先处理的经营风险"
      : "今日经营状态整体正常"
    : snapshot.emptyMessage ?? "暂无可用经营数据";
  const metaCopy = snapshot.generatedAt
    ? `数据更新于 ${formatInspectionTime(snapshot.generatedAt)}`
    : snapshot.snapshotDate
      ? `快照 ${snapshot.snapshotDate}`
      : "完成数据回补后会生成今日经营摘要";
  const fallbackActions = [
    "帮我生成今日经营体检报告",
    "帮我检查哪些数据还没有同步",
    "帮我列出今天最值得处理的运营动作",
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

  return (
    <section style={homeStyles.commandGrid(isMobile)}>
      <div style={homeStyles.commandMain}>
        <div style={homeStyles.sectionHead}>
          <div>
            <div style={homeStyles.commandEyebrow}>TODAY COMMAND CENTER</div>
            <h2 style={homeStyles.commandTitle}>{statusCopy}</h2>
            <div style={homeStyles.commandMeta}>{metaCopy}</div>
          </div>
          <button type="button" style={textButtonStyle} onClick={onOpenDashboard}>
            经营看板 →
          </button>
        </div>

        <div style={homeStyles.summaryGrid(isMobile)}>
          {topMetrics.map((metric) => (
            <div key={metric.label} style={homeStyles.summaryMetric}>
              <div style={metricLabelStyle}>
                {metric.label}
                {metric.pendingIntegration ? <span style={homeStyles.pendingBadge}>待接入</span> : null}
              </div>
              <div style={{ ...metricValueStyle, fontSize: 22, marginTop: 8 }}>{metric.value}</div>
              <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
            </div>
          ))}
        </div>

        <div>
          <div style={homeStyles.sectionHead}>
            <div>
              <h3 style={homeStyles.sectionTitle}>最重要的风险</h3>
              <div style={{ ...mutedMetaStyle, marginTop: 4 }}>最多展示 3 条，完整列表在每日待办里</div>
            </div>
            <button type="button" style={textButtonStyle} onClick={onOpenDailyOps}>
              每日待办 →
            </button>
          </div>
          <div style={homeStyles.alertList}>
            {topAlerts.length > 0 ? (
              topAlerts.map((alert) => (
                <button
                  key={`${alert.title}-${alert.detail}`}
                  type="button"
                  style={{ ...homeStyles.alertItem(alert.tone), textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                  onClick={onOpenDailyOps}
                >
                  <span style={homeStyles.alertBadge(alert.tone)}>{alertToneLabel(alert.tone)}</span>
                  <span style={sectionTitleSmallStyle}>{alert.title}</span>
                  <span style={sectionTextStyle}>{alert.detail}</span>
                </button>
              ))
            ) : (
              <div style={{ ...homeStyles.alertItem("info"), color: shopifyUi.textSecondary }}>
                {snapshot.hasData ? "暂无需要优先处理的风险。" : snapshot.emptyMessage ?? "暂无经营数据。"}
              </div>
            )}
          </div>
        </div>
      </div>

      <aside style={homeStyles.commandSide}>
        <section style={homeStyles.sectionCard}>
          <div style={homeStyles.sectionHead}>
            <div>
              <h3 style={homeStyles.sectionTitle}>推荐动作</h3>
              <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
                基于今日诊断直接进入下一步
              </div>
            </div>
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
                  <span style={{ display: "block", marginTop: 3, color: shopifyUi.textSecondary, fontWeight: 500 }}>
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
              <h3 style={homeStyles.sectionTitle}>最近任务</h3>
              <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
                {runningTaskCount > 0 ? `${runningTaskCount} 个任务进行中` : "当前没有进行中任务"}
              </div>
            </div>
            <button type="button" style={textButtonStyle} onClick={onOpenTasks}>
              任务中心 →
            </button>
          </div>
          <div style={homeStyles.taskList}>
            {recentTasks.length > 0 ? (
              recentTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  style={{ ...homeStyles.taskItem, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
                  onClick={onOpenTasks}
                >
                  <span style={sectionTitleSmallStyle}>{task.title}</span>
                  <span style={sectionTextStyle}>{task.result}</span>
                </button>
              ))
            ) : (
              <div style={homeStyles.taskItem}>
                <span style={sectionTextStyle}>暂无近期任务。创建文案或图片任务后会显示在这里。</span>
              </div>
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}
