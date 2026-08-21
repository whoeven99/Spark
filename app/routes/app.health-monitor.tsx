import { useMemo, useState, type CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { resolveHealthMonitorDetail } from "../lib/healthMonitorAiDetail";
import { buildWorkspaceChatPrefillPath } from "../lib/workspaceChatPrefill";
import {
  HEALTH_MONITORS,
  getHealthMonitorGroups,
  getHealthMonitorSummary,
  type HealthMonitorRecord,
  type HealthMonitorStatus,
} from "../lib/healthMonitorData";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { DestinationPage, type DestinationActionCard } from "./component/shared/DestinationPage";
import {
  mobilePageContentStyle,
  pageContentStyle,
  pageHintTextStyle,
  pageColorTokens,
  PageSurface,
} from "./page/pageUiStyles";

type ViewMode = "overview" | "run" | "detail";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppHealthMonitor() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  useFeatureView("health-monitor");

  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>("conversion-health");

  const groupedMonitors = useMemo(() => getHealthMonitorGroups(), []);

  const selectedMonitor =
    HEALTH_MONITORS.find((item) => item.id === selectedMonitorId) ?? HEALTH_MONITORS[0];
  const selectedDetail = useMemo(() => resolveHealthMonitorDetail(selectedMonitor), [selectedMonitor]);

  const monitoringSummary = useMemo(() => getHealthMonitorSummary(), []);

  const actions: DestinationActionCard[] = [
    {
      key: "overview",
      title: "一级概览",
      detail: "先看可信度健康与目标健康的整体状态。",
      badge: "首页",
      active: viewMode === "overview",
      onClick: () => setViewMode("overview"),
    },
    {
      key: "run",
      title: "监测进度",
      detail: "查看本次监测进度与每个指标当前有没有问题。",
      badge: `${monitoringSummary.completed}/${monitoringSummary.total}`,
      active: viewMode === "run",
      onClick: () => setViewMode("run"),
    },
    {
      key: "detail",
      title: "结论详情",
      detail: `${selectedMonitor.title} 的问题、论据、解决办法和 AI 入口。`,
      badge: statusLabel(selectedMonitor.status),
      active: viewMode === "detail",
      onClick: () => setViewMode("detail"),
    },
  ];

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("nav.healthMonitor")}
        subtitle="Health Monitor 只回答两件事：这些结果是否可信，以及这些关键指标是否达标。"
        titleBarTitle={t("nav.healthMonitor")}
        backLabel="返回首页"
        fallbackPath="/app"
        isMobile={isMobile}
        actions={actions}
      >
        {viewMode === "overview" ? (
          <OverviewSection
            groups={groupedMonitors}
            onOpenRun={() => setViewMode("run")}
            onOpenDetail={(monitorId) => {
              setSelectedMonitorId(monitorId);
              setViewMode("detail");
            }}
          />
        ) : null}

        {viewMode === "run" ? (
          <RunSection
            groups={groupedMonitors}
            summary={monitoringSummary}
            onBackToOverview={() => setViewMode("overview")}
            onOpenDetail={(monitorId) => {
              setSelectedMonitorId(monitorId);
              setViewMode("detail");
            }}
          />
        ) : null}

        {viewMode === "detail" ? (
          <DetailSection
            monitor={selectedMonitor}
            detail={selectedDetail}
            onBackToRun={() => setViewMode("run")}
            onOpenAi={() =>
              navigate(
                buildWorkspaceChatPrefillPath({
                  prompt: selectedDetail.result.aiChatPrompt,
                  constraints: [
                    `当前 AI 语境：Health Monitor / ${selectedMonitor.title}`,
                    "只回答可信度、达标性、异常原因和处理优先级，不切回经营总览语境。",
                  ],
                }),
              )
            }
          />
        ) : null}
      </DestinationPage>
    </div>
  );
}

function OverviewSection({
  groups,
  onOpenRun,
  onOpenDetail,
}: {
  groups: Array<{ title: string; items: HealthMonitorRecord[] }>;
  onOpenRun: () => void;
  onOpenDetail: (monitorId: string) => void;
}) {
  return (
    <PageSurface
      title="今日健康度概览"
      subtitle="一级页面只保留两类摘要：可信度健康与目标健康。每项只展示当前状态、关键数据和受影响经营模块。"
    >
      <div style={stackStyle}>
        {groups.map((group) => (
          <section key={group.title} style={groupCardStyle}>
            <div style={groupHeaderStyle}>
              <h3 style={groupTitleStyle}>{group.title}</h3>
              <span style={pageHintTextStyle}>{group.items.length} 个监测项</span>
            </div>
            <div style={monitorListStyle}>
              {group.items.map((item) => (
                <div key={item.id} style={dashboardRowStyle}>
                  <div>
                    <div style={dashboardTitleStyle}>{item.title}</div>
                    <div style={dashboardMetaStyle}>影响模块：{item.relatedModule}</div>
                  </div>
                  <div style={dashboardValueStyle}>{item.value}</div>
                  <span style={statusBadgeStyle(item.status)}>{statusLabel(item.status)}</span>
                  <button
                    type="button"
                    style={linkButtonStyle}
                    onClick={() => onOpenDetail(item.id)}
                  >
                    查看结论
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
        <div style={buttonRowStyle}>
          <button type="button" style={primaryButtonStyle} onClick={onOpenRun}>
            进入健康度监测
          </button>
        </div>
      </div>
    </PageSurface>
  );
}

function RunSection({
  groups,
  summary,
  onBackToOverview,
  onOpenDetail,
}: {
  groups: Array<{ title: string; items: HealthMonitorRecord[] }>;
  summary: {
    total: number;
    completed: number;
    progress: number;
    riskCount: number;
    watchCount: number;
    goodCount: number;
  };
  onBackToOverview: () => void;
  onOpenDetail: (monitorId: string) => void;
}) {
  return (
    <div style={stackStyle}>
      <PageSurface
        title="本次健康度监测"
        subtitle="二级页面按健康判定来读：先看本次运行进度，再看每项监测当前是否可信、是否达标。"
      >
        <div style={summaryGridStyle}>
          <div style={summaryTileStyle}>
            <span style={summaryTileLabelStyle}>监测进度</span>
            <strong style={summaryTileValueStyle}>{summary.progress}%</strong>
          </div>
          <div style={summaryTileStyle}>
            <span style={summaryTileLabelStyle}>风险项</span>
            <strong style={summaryTileValueStyle}>{summary.riskCount}</strong>
          </div>
          <div style={summaryTileStyle}>
            <span style={summaryTileLabelStyle}>关注项</span>
            <strong style={summaryTileValueStyle}>{summary.watchCount}</strong>
          </div>
          <div style={summaryTileStyle}>
            <span style={summaryTileLabelStyle}>正常项</span>
            <strong style={summaryTileValueStyle}>{summary.goodCount}</strong>
          </div>
        </div>
        <div style={progressTrackStyle}>
          <div style={{ ...progressFillStyle, width: `${summary.progress}%` }} />
        </div>
        <div style={buttonRowStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={onBackToOverview}>
            返回一级概览
          </button>
        </div>
      </PageSurface>

      {groups.map((group) => (
        <PageSurface
          key={group.title}
          title={group.title}
          subtitle="每个健康项都可以点进去，进入固定的四段式诊断详情页。"
        >
          <div style={monitorCardGridStyle}>
            {group.items.map((item) => (
              <article key={item.id} style={monitorCardStyle}>
                <div style={monitorCardHeaderStyle}>
                  <div>
                    <h3 style={monitorCardTitleStyle}>{item.title}</h3>
                    <p style={monitorCardValueStyle}>{item.value}</p>
                    <p style={monitorCardMetaStyle}>影响模块：{item.relatedModule}</p>
                  </div>
                  <span style={statusBadgeStyle(item.status)}>{statusLabel(item.status)}</span>
                </div>
                <p style={monitorCardSummaryStyle}>{item.summary}</p>
                <button
                  type="button"
                  style={linkButtonStyle}
                  onClick={() => onOpenDetail(item.id)}
                >
                  查看结论结果
                </button>
              </article>
            ))}
          </div>
        </PageSurface>
      ))}
    </div>
  );
}

function DetailSection({
  monitor,
  detail,
  onBackToRun,
  onOpenAi,
}: {
  monitor: HealthMonitorRecord;
  detail: ReturnType<typeof resolveHealthMonitorDetail>;
  onBackToRun: () => void;
  onOpenAi: () => void;
}) {
  return (
    <div style={stackStyle}>
      <PageSurface
        title={monitor.title}
        subtitle="三级页面固定为四段式：问题是什么、数据论据、解决办法、和 AI 聊聊。这里回答的是健康判断，不是经营总览。"
      >
        <div style={detailHeroStyle}>
          <span style={statusBadgeStyle(monitor.status)}>{statusLabel(monitor.status)}</span>
          <div style={detailHeroMainStyle}>
            <div style={detailMetaStyle}>{monitor.group}</div>
            <h3 style={detailIssueTitleStyle}>{detail.result.problem}</h3>
            <div style={detailValueStyle}>当前关键数据：{monitor.value}</div>
            <div style={detailMetaStyle}>影响经营模块：{monitor.relatedModule}</div>
            <div style={detailMetaStyle}>
              已走通链路：Input {"->"} Prompt {"->"} Result
            </div>
          </div>
        </div>
        <div style={buttonRowStyle}>
          <button type="button" style={secondaryButtonStyle} onClick={onBackToRun}>
            返回监测进度
          </button>
        </div>
      </PageSurface>

      <PageSurface title="问题是什么" subtitle="只保留一句判断，让用户先知道结论。">
        <p style={detailLeadStyle}>{detail.result.problem}</p>
      </PageSurface>

      <PageSurface title="数据论据" subtitle="用结构化证据支撑结论，而不是铺解释性散文。">
        <div style={evidenceListStyle}>
          {detail.result.evidenceSummary.map((entry) => (
            <div key={entry.label} style={evidenceItemStyle}>
              <strong style={evidenceLabelStyle}>{entry.label}</strong>
              <span style={evidenceValueStyle}>{entry.summary}</span>
            </div>
          ))}
        </div>
      </PageSurface>

      <PageSurface title="解决办法" subtitle="每条动作都应该可以进一步转进现有 Tasks。">
        <div style={actionListStyle}>
          {detail.result.actions.map((action) => (
            <div key={action.title} style={actionItemStyle}>
              <strong style={actionTitleStyle}>
                {action.title}
                <span style={actionPriorityStyle}>{action.priority}</span>
              </strong>
              <span style={actionDetailStyle}>{action.detail}</span>
            </div>
          ))}
        </div>
      </PageSurface>

      <PageSurface title="和 AI 聊聊" subtitle="这里的 AI 只负责继续诊断这个健康项：为什么异常、影响什么、先修哪里。">
        <div style={aiPanelStyle}>
          <div style={aiMetaPanelStyle}>
            <strong style={evidenceLabelStyle}>MonitorDetailInput</strong>
            <pre style={aiPromptStyle}>{JSON.stringify(detail.input, null, 2)}</pre>
          </div>
          <div style={aiMetaPanelStyle}>
            <strong style={evidenceLabelStyle}>Prompt Preview</strong>
            <pre style={aiPromptStyle}>{detail.prompt.user}</pre>
          </div>
          <div style={aiMetaPanelStyle}>
            <strong style={evidenceLabelStyle}>AI Chat Prompt</strong>
            <pre style={aiPromptStyle}>{detail.result.aiChatPrompt}</pre>
          </div>
          <div style={buttonRowStyle}>
            <button type="button" style={primaryButtonStyle} onClick={onOpenAi}>
              带着这个健康项去和 AI 聊
            </button>
          </div>
        </div>
      </PageSurface>
    </div>
  );
}

function statusLabel(status: HealthMonitorStatus): string {
  if (status === "risk") return "风险";
  if (status === "watch") return "关注";
  return "正常";
}

function statusBadgeStyle(status: HealthMonitorStatus): CSSProperties {
  if (status === "risk") {
    return {
      ...baseStatusBadgeStyle,
      color: pageColorTokens.criticalText,
      background: pageColorTokens.criticalBg,
      border: `1px solid ${pageColorTokens.criticalBg}`,
    };
  }
  if (status === "watch") {
    return {
      ...baseStatusBadgeStyle,
      color: "#8a6500",
      background: pageColorTokens.warningBg,
      border: `1px solid ${pageColorTokens.warningBg}`,
    };
  }
  return {
    ...baseStatusBadgeStyle,
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: `1px solid ${pageColorTokens.brandGreenGlow}`,
  };
}

const stackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const groupCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "1rem",
  display: "grid",
  gap: "0.85rem",
};

const groupHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const groupTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const monitorListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const dashboardRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(110px, 0.6fr) auto auto",
  gap: "0.75rem",
  alignItems: "center",
  padding: "0.85rem 0",
  borderBottom: `1px dashed ${pageColorTokens.border}`,
};

const dashboardTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const dashboardMetaStyle: CSSProperties = {
  marginTop: "0.2rem",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const dashboardValueStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: pageColorTokens.textSecondary,
  textAlign: "right",
};

const baseStatusBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 56,
  padding: "0.28rem 0.6rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 760,
  whiteSpace: "nowrap",
};

const monitorCardMetaStyle: CSSProperties = {
  margin: "0.25rem 0 0",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
};

const primaryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.brandBlue,
  color: "#ffffff",
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.7rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.7rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
};

const linkButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandBlue,
  padding: 0,
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.75rem",
};

const summaryTileStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.9rem",
  background: pageColorTokens.surfaceMuted,
  display: "grid",
  gap: "0.35rem",
};

const summaryTileLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const summaryTileValueStyle: CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const progressTrackStyle: CSSProperties = {
  width: "100%",
  height: 10,
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  overflow: "hidden",
  marginTop: "1rem",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  background: pageColorTokens.brandBlue,
  borderRadius: 999,
};

const monitorCardGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const monitorCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "1rem",
  background: pageColorTokens.surface,
  display: "grid",
  gap: "0.75rem",
};

const monitorCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.75rem",
};

const monitorCardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const monitorCardValueStyle: CSSProperties = {
  margin: "0.35rem 0 0",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
};

const monitorCardSummaryStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  lineHeight: 1.55,
  color: pageColorTokens.textBody,
};

const detailHeroStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.9rem",
  flexWrap: "wrap",
};

const detailHeroMainStyle: CSSProperties = {
  flex: "1 1 18rem",
  minWidth: 0,
  display: "grid",
  gap: "0.45rem",
};

const detailMetaStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const detailIssueTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.35,
};

const detailValueStyle: CSSProperties = {
  fontSize: "0.875rem",
  color: pageColorTokens.textBody,
};

const detailLeadStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  lineHeight: 1.7,
  color: pageColorTokens.textBody,
};

const evidenceListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const evidenceItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.3rem",
  padding: "0.85rem 0.95rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
};

const evidenceLabelStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
};

const evidenceValueStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
  lineHeight: 1.55,
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const actionItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
};

const actionTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
};

const actionPriorityStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.12rem 0.38rem",
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  color: pageColorTokens.textSecondary,
  fontSize: "0.7rem",
  fontWeight: 700,
};

const actionDetailStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.55,
};

const aiPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
};

const aiMetaPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.4rem",
};

const aiPromptStyle: CSSProperties = {
  margin: 0,
  padding: "1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textBody,
  fontSize: "0.84rem",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  fontFamily: "inherit",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
