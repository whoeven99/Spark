import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useFeatureView } from "../../lib/featureTrack";
import { buildTodayPageAiDrilldownContext } from "../../lib/todayReportAi";
import type { TodayDecisionReport, TodayEvidenceGroup, TodayObjectCard } from "../../lib/todayReportTypes";
import { buildWorkspaceChatPrefillPath } from "../../lib/workspaceChatPrefill";
import { TodayObjectReportDialog } from "../component/today/TodayObjectReportDialog";
import {
  mobilePageContentStyle,
  pageAccentBadgeStyle,
  pageColorTokens,
  pageContentStyle,
  pageMetricLabelStyle,
  pageMetricValueStyle,
  PageHeaderNav,
  PageSurface,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageStatusCardStyle,
} from "./pageUiStyles";

function resolveStatusTone(status: TodayDecisionReport["statuses"][number]["status"]): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

function resolveGroupToneStyle(tone: TodayEvidenceGroup["tone"]): CSSProperties {
  if (tone === "negative") {
    return {
      color: pageColorTokens.criticalText,
      background: pageColorTokens.criticalBg,
      border: "1px solid #f2b8ae",
    };
  }
  if (tone === "warning") {
    return {
      color: "#9a5b00",
      background: pageColorTokens.warningBg,
      border: "1px solid #f1d58d",
    };
  }
  if (tone === "positive") {
    return {
      color: pageColorTokens.brandGreenDark,
      background: pageColorTokens.brandGreenLight,
      border: "1px solid rgba(0, 128, 96, 0.2)",
    };
  }
  return {
    color: pageColorTokens.brandBlueDark,
    background: pageColorTokens.brandBlueLight,
    border: "1px solid rgba(0, 91, 211, 0.2)",
  };
}

export function TodayMetricReportPage({
  report,
  backLabel = "返回经营",
  fallbackPath = "/app/today",
  returnTo,
  topSection,
  extraSections,
}: {
  report: TodayDecisionReport;
  backLabel?: string;
  fallbackPath?: string;
  returnTo?: string;
  topSection?: ReactNode;
  extraSections?: ReactNode;
}) {
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const [activeObject, setActiveObject] = useState<TodayObjectCard | null>(null);
  useFeatureView("today");
  const aiContext = useMemo(() => buildTodayPageAiDrilldownContext(report), [report]);
  const aiChatPath = useMemo(
    () =>
      buildWorkspaceChatPrefillPath({
        prompt: aiContext.chatPrompt,
        constraints: [`当前 AI 语境：Today / ${report.title}`, "只回答当前页面的赚钱结果问题。"],
      }),
    [aiContext.chatPrompt, report.title],
  );

  const findGroup = (groupKey: string) => report.groups.find((group) => group.key === groupKey) ?? null;

  return (
    <>
      <div style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}>
        <PageHeaderNav
          title={report.title}
          subtitle={report.subtitle}
          titleBarTitle={report.title}
          backLabel={backLabel}
          fallbackPath={fallbackPath}
          returnTo={returnTo}
        />

        {topSection ?? null}

        <PageSurface>
          <section style={sectionStackStyle}>
            <div
              style={
                isMobile
                  ? { ...pageSectionHeaderRowStyle, flexDirection: "column", alignItems: "flex-start", gap: "0.65rem" }
                  : pageSectionHeaderRowStyle
              }
            >
              <div style={{ display: "grid", gap: "0.4rem" }}>
                <h2 style={pageSectionMajorTitleStyle}>{report.primaryQuestion}</h2>
                <p style={summaryTextStyle}>{report.summary}</p>
              </div>
              <span style={pageAccentBadgeStyle}>{report.accent}</span>
            </div>

            <div style={statusListStyle}>
              {report.statuses.map((item) => (
                <div key={item.label} style={pageStatusCardStyle}>
                  <div style={statusItemStyle(isMobile)}>
                    <span style={statusBadgeStyle(resolveStatusTone(item.status))}>{item.label}</span>
                    <span style={summaryTextStyle}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </PageSurface>

        <PageSurface title="摘要指标">
          <div style={summaryMetricGridStyle}>
            {report.summaryMetrics.map((metric) => (
              <div key={metric.label} style={summaryMetricTileStyle}>
                <div style={pageMetricLabelStyle}>{metric.label}</div>
                <div style={pageMetricValueStyle}>{metric.value}</div>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="指标拆解与对象证据">
          <div style={breakdownStackStyle}>
            {report.breakdowns.map((block) => (
              <section key={block.key} style={breakdownSectionStyle(isMobile)}>
                <div style={breakdownCardStyle}>
                  <div style={{ display: "grid", gap: "0.4rem" }}>
                    <strong style={breakdownTitleStyle}>{block.title}</strong>
                    <p style={summaryTextStyle}>{block.summary}</p>
                  </div>
                  <div style={breakdownRowListStyle}>
                    {block.rows.map((row) => (
                      <div key={row.label} style={breakdownRowStyle}>
                        <div style={{ display: "grid", gap: "0.25rem" }}>
                          <strong style={rowTitleStyle}>{row.label}</strong>
                          <span style={rowMetaStyle}>{row.meta}</span>
                        </div>
                        <div style={rowValueStyle}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={evidenceGroupStackStyle}>
                  {block.relatedGroupKeys
                    .map(findGroup)
                    .filter((group): group is TodayEvidenceGroup => Boolean(group))
                    .map((group) => (
                      <section key={group.key} style={groupSectionStyle}>
                        <div style={groupHeaderStyle}>
                          <span style={{ ...groupToneBadgeStyle, ...resolveGroupToneStyle(group.tone) }}>
                            {group.title}
                          </span>
                          <p style={summaryTextStyle}>{group.summary}</p>
                        </div>
                        <div style={objectCardListStyle}>
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              style={objectCardButtonStyle}
                              onClick={() => setActiveObject(item)}
                            >
                              <div style={objectCardHeaderStyle}>
                                <strong style={objectTitleStyle}>{item.title}</strong>
                                <span style={objectActionHintStyle}>查看详情</span>
                              </div>
                              <div style={objectMetricGridStyle}>
                                {item.metrics.map((metric) => (
                                  <div key={metric.label} style={objectMetricStyle}>
                                    <span style={objectMetricLabelStyle}>{metric.label}</span>
                                    <strong style={objectMetricValueStyle}>{metric.value}</strong>
                                  </div>
                                ))}
                              </div>
                              <div style={summaryTextStyle}>{item.summary}</div>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </PageSurface>

        {report.supplementaryGroups && report.supplementaryGroups.length > 0 ? (
          <PageSurface title="补充对象组">
            <div style={evidenceGroupStackStyle}>
              {report.supplementaryGroups.map((group) => (
                <section key={group.key} style={groupSectionStyle}>
                  <div style={groupHeaderStyle}>
                    <span style={{ ...groupToneBadgeStyle, ...resolveGroupToneStyle(group.tone) }}>
                      {group.title}
                    </span>
                    <p style={summaryTextStyle}>{group.summary}</p>
                  </div>
                  <div style={objectCardListStyle}>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        style={objectCardButtonStyle}
                        onClick={() => setActiveObject(item)}
                      >
                        <div style={objectCardHeaderStyle}>
                          <strong style={objectTitleStyle}>{item.title}</strong>
                          <span style={objectActionHintStyle}>查看详情</span>
                        </div>
                        <div style={objectMetricGridStyle}>
                          {item.metrics.map((metric) => (
                            <div key={metric.label} style={objectMetricStyle}>
                              <span style={objectMetricLabelStyle}>{metric.label}</span>
                              <strong style={objectMetricValueStyle}>{metric.value}</strong>
                            </div>
                          ))}
                        </div>
                        <div style={summaryTextStyle}>{item.summary}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </PageSurface>
        ) : null}

        <PageSurface title="建议动作">
          <div style={actionListStyle}>
            {report.actions.map((action) => (
              <div key={action.title} style={actionItemStyle}>
                <strong style={actionTitleStyle}>
                  {action.title}
                  <span style={actionPriorityStyle}>{action.priority}</span>
                </strong>
                <span style={summaryTextStyle}>{action.detail}</span>
              </div>
            ))}
          </div>
        </PageSurface>

        <PageSurface title="报告操作">
          <div style={reportActionPanelStyle}>
            <p style={summaryTextStyle}>AI 会自动带上这份报告里的判断、指标、拆解和建议动作，继续帮你判断今天先动什么。</p>
            <button type="button" style={primaryButtonStyle} onClick={() => navigate(aiChatPath)}>
              带着这份报告去和 AI 聊
            </button>
          </div>
        </PageSurface>

        {extraSections ? <section style={sectionStackStyle}>{extraSections}</section> : null}
      </div>

      <TodayObjectReportDialog
        open={Boolean(activeObject)}
        onClose={() => setActiveObject(null)}
        report={report}
        objectCard={activeObject}
      />
    </>
  );
}

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const summaryTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.65,
};

const statusListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

function statusItemStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "flex-start" : "center",
    gap: "0.6rem",
  };
}

function statusBadgeStyle(tone: "success" | "warning" | "critical"): CSSProperties {
  return {
    display: "inline-flex",
    width: "fit-content",
    alignItems: "center",
    padding: "0.22rem 0.55rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 700,
    color:
      tone === "critical"
        ? pageColorTokens.criticalText
        : tone === "warning"
          ? "#9a5b00"
          : pageColorTokens.brandGreenDark,
    background:
      tone === "critical"
        ? pageColorTokens.criticalBg
        : tone === "warning"
          ? pageColorTokens.warningBg
          : pageColorTokens.brandGreenLight,
    border: `1px solid ${
      tone === "critical"
        ? "#f2b8ae"
        : tone === "warning"
          ? "#f1d58d"
          : "rgba(0, 128, 96, 0.2)"
    }`,
  };
}

const summaryMetricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem",
};

const summaryMetricTileStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.9rem",
};

function breakdownSectionStyle(isMobile: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.05fr) minmax(0, 0.95fr)",
    gap: "1rem",
    alignItems: "start",
  };
}

const breakdownStackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const breakdownCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
  padding: "1rem",
};

const breakdownTitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  color: pageColorTokens.textPrimary,
};

const breakdownRowListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const breakdownRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "0.75rem",
  paddingTop: "0.7rem",
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
};

const rowTitleStyle: CSSProperties = {
  fontSize: "0.85rem",
  color: pageColorTokens.textPrimary,
};

const rowMetaStyle: CSSProperties = {
  color: pageColorTokens.textSecondary,
  fontSize: "0.78rem",
  lineHeight: 1.55,
};

const rowValueStyle: CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
  whiteSpace: "nowrap",
};

const evidenceGroupStackStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
};

const groupSectionStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "0.9rem",
  display: "grid",
  gap: "0.8rem",
};

const groupHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
};

const groupToneBadgeStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  padding: "0.24rem 0.55rem",
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 700,
};

const objectCardListStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
};

const objectCardButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.85rem 0.9rem",
  textAlign: "left",
  display: "grid",
  gap: "0.75rem",
  cursor: "pointer",
};

const objectCardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.75rem",
};

const objectTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
};

const objectActionHintStyle: CSSProperties = {
  color: pageColorTokens.brandBlue,
  fontSize: "0.75rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const objectMetricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
  gap: "0.55rem",
};

const objectMetricStyle: CSSProperties = {
  display: "grid",
  gap: "0.15rem",
};

const objectMetricLabelStyle: CSSProperties = {
  color: pageColorTokens.textFootnote,
  fontSize: "0.72rem",
};

const objectMetricValueStyle: CSSProperties = {
  color: pageColorTokens.textPrimary,
  fontSize: "0.82rem",
};

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const actionItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.9rem 1rem",
};

const actionTitleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  color: pageColorTokens.textPrimary,
};

const actionPriorityStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 34,
  padding: "0.1rem 0.45rem",
  borderRadius: 999,
  background: "#edf3ff",
  color: pageColorTokens.brandBlue,
  fontSize: "0.75rem",
  fontWeight: 700,
};

const reportActionPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
};

const primaryButtonStyle: CSSProperties = {
  width: "fit-content",
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.brandBlue,
  color: "#ffffff",
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.55rem 0.9rem",
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
};
