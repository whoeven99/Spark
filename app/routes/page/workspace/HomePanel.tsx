/** 工作台首页 — 对齐 Spark 首页实装预览：问候、AI 输入、店铺概览、任务监控。 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
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
  { label: "翻译商品到多语言", prompt: "帮我批量翻译商品内容到多个目标语言，并保留品牌术语。" },
  { label: "优化商品文案", prompt: "帮我优化一批商品的标题与描述，风格偏 SEO 与转化。" },
  { label: "生成营销图片", prompt: "帮我为近期主推商品生成营销场景图创意与文案。" },
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
    padding: "22px 24px 20px",
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
    margin: "0 0 16px",
    fontSize: 18,
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
    minHeight: 88,
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
  sectionCard: {
    ...surfaceCardStyle,
    padding: "20px 22px",
    border: `1px solid ${shopifyUi.border}`,
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
  onOpenTool,
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
  onOpenTool: (path: string) => void;
}) {
  const { isMobile } = useResponsiveLayout();
  const [draft, setDraft] = useState("");
  const now = useMemo(() => new Date(), []);
  const metrics = snapshot.metrics.slice(0, 4);
  const primaryAlert = snapshot.alerts[0];
  const needsAttention = snapshot.automation?.status === "attention";
  const suggestionItems = snapshot.suggestions.slice(0, 2);
  const metricColumns = isMobile ? 2 : 4;
  const monitorColumns = isMobile ? 1 : 3;

  const activityLines = useMemo(() => {
    const lines: string[] = [];
    if (snapshot.automation?.detail) {
      lines.push(`每日巡检 · ${snapshot.automation.detail}`);
    }
    for (const task of snapshot.recentTaskSummaries.slice(0, 3)) {
      lines.push(`${task.title} · ${task.result}`);
    }
    return lines.slice(0, 4);
  }, [snapshot.automation, snapshot.recentTaskSummaries]);

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

      <section style={homeStyles.assistantCard}>
        <div style={homeStyles.assistantBadge}>
          <span aria-hidden="true">■</span>
          <span>AI ASSISTANT</span>
        </div>
        <h2 style={homeStyles.assistantTitle}>今天想让 Spark 帮你做什么？</h2>
        <div style={homeStyles.composerShell}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="例如：分析本周转化率下降的原因，并给出 3 个可执行的改进建议…"
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

      <section style={homeStyles.sectionCard}>
        <div style={homeStyles.sectionHead}>
          <h3 style={homeStyles.sectionTitle}>店铺概览 · 最近 7 天</h3>
          <button type="button" style={textButtonStyle} onClick={onOpenDashboard}>
            查看完整看板 →
          </button>
        </div>
        {metrics.length > 0 ? (
          <div style={homeStyles.metricsGrid(metricColumns)}>
            {metrics.map((metric) => (
              <article key={metric.label} style={homeStyles.metricTile}>
                <div style={metricLabelStyle}>
                  {metric.label}
                  {metric.pendingIntegration ? (
                    <span style={homeStyles.pendingBadge}>待接入</span>
                  ) : null}
                </div>
                <div style={{ ...metricValueStyle, fontSize: 24 }}>{metric.value}</div>
                <div style={metricDeltaStyle(metric.tone)}>{metric.delta}</div>
              </article>
            ))}
          </div>
        ) : (
          <div style={sectionTextStyle}>
            {snapshot.emptyMessage ?? "暂无经营快照，完成每日巡检后将在此展示核心指标。"}
          </div>
        )}
        {primaryAlert ? (
          <div style={homeStyles.alertBar}>
            <span>
              <strong>需关注</strong>
              {" · "}
              {primaryAlert.title}
              {primaryAlert.detail ? ` · ${primaryAlert.detail}` : ""}
            </span>
            <button type="button" style={textButtonStyle} onClick={onOpenDailyOps}>
              去处理 →
            </button>
          </div>
        ) : null}
      </section>

      <section style={homeStyles.sectionCard}>
        <div style={homeStyles.sectionHead}>
          <div>
            <h3 style={homeStyles.sectionTitle}>AI 在为你盯着</h3>
            <div style={{ ...mutedMetaStyle, marginTop: 4 }}>
              每日巡检与正在执行的任务，无需你逐个跟进
            </div>
          </div>
          <button type="button" style={textButtonStyle} onClick={onOpenTasks}>
            查看任务列表 →
          </button>
        </div>

        <div style={homeStyles.monitorGrid(monitorColumns)}>
          <article style={homeStyles.monitorTile}>
            <span style={homeStyles.monitorBadge(needsAttention ? "warning" : "info")}>
              {needsAttention ? "需关注" : "正常"}
            </span>
            <div style={sectionTitleSmallStyle}>每日巡检</div>
            <div style={sectionTextStyle}>
              {snapshot.automation
                ? `${formatInspectionTime(snapshot.automation.lastRunAt)} · ${snapshot.automation.detail}`
                : "尚未生成今日巡检摘要，可前往每日经营待办触发。"}
            </div>
            <div style={homeStyles.progressTrack}>
              <div
                style={homeStyles.progressFill(
                  needsAttention ? 72 : 100,
                  needsAttention ? "#f0a01d" : shopifyUi.primary,
                )}
              />
            </div>
          </article>

          <article style={homeStyles.monitorTile}>
            <span style={homeStyles.monitorBadge(runningTaskCount > 0 ? "info" : "neutral")}>
              {runningTaskCount > 0 ? "进行中" : "空闲"}
            </span>
            <div style={sectionTitleSmallStyle}>进行中任务</div>
            <div style={sectionTextStyle}>
              {runningTaskCount > 0
                ? `${runningTaskCount} 个任务正在后台执行，完成后会通知你。`
                : "当前没有进行中的任务，可从上方输入框快速发起。"}
            </div>
            {runningTaskCount > 0 ? (
              <button type="button" style={{ ...textButtonStyle, marginTop: "auto" }} onClick={onOpenTasks}>
                查看任务列表 →
              </button>
            ) : null}
          </article>

          <article style={homeStyles.monitorTile}>
            <span style={homeStyles.monitorBadge(suggestionItems.length > 0 ? "warning" : "neutral")}>
              {suggestionItems.length > 0 ? `${suggestionItems.length} 条` : "暂无"}
            </span>
            <div style={sectionTitleSmallStyle}>待办建议</div>
            <div style={sectionTextStyle}>
              {suggestionItems.length > 0
                ? suggestionItems.join(" · ")
                : "暂无待办建议，完成巡检后会在此汇总。"}
            </div>
            {suggestionItems.length > 0 ? (
              <button type="button" style={{ ...textButtonStyle, marginTop: "auto" }} onClick={onOpenDailyOps}>
                逐条处理 →
              </button>
            ) : null}
          </article>
        </div>

        {activityLines.length > 0 ? (
          <>
            <div style={{ ...sectionTitleSmallStyle, marginTop: 18 }}>最近 AI 活动</div>
            <ul style={homeStyles.activityList}>
              {activityLines.map((line) => (
                <li key={line} style={homeStyles.activityItem}>
                  <span style={homeStyles.activityDot} aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
