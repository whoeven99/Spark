import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useFeatureView } from "../../lib/featureTrack";
import type { ObservationWindowView } from "../../lib/observationWindow";
import { buildTodayPageAiDrilldownContext } from "../../lib/todayReportAi";
import type { TodayDecisionReport, TodayEvidenceGroup, TodayObjectCard } from "../../lib/todayReportTypes";
import { buildWorkspaceChatPrefillPath } from "../../lib/workspaceChatPrefill";
import { useObservationWindowLabel } from "../component/shared/useObservationWindowLabel";
import { TodayObjectGroupDialog } from "../component/today/TodayObjectGroupDialog";
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

const BREAKDOWN_CHART_COLORS = ["#0f62fe", "#7c3aed", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

function buildBreakdownChartRows(rows: TodayDecisionReport["breakdowns"][number]["rows"]) {
  const hasRealChart =
    rows.length > 0 &&
    rows.every((row) => typeof row.chartValue === "number" && Number.isFinite(row.chartValue) && row.chartValue >= 0) &&
    rows.some((row) => (row.chartValue ?? 0) > 0);

  const total = hasRealChart
    ? rows.reduce((sum, row) => sum + (row.chartValue ?? 0), 0)
    : rows.length;

  return rows.map((row, index) => {
    const weight = hasRealChart ? (row.chartValue ?? 0) : 1;
    const ratio = total > 0 ? weight / total : 0;
    return {
      ...row,
      color: BREAKDOWN_CHART_COLORS[index % BREAKDOWN_CHART_COLORS.length],
      ratio,
      shareLabel: `${(ratio * 100).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}%`,
    };
  });
}

function buildBreakdownChartGradient(chartRows: ReturnType<typeof buildBreakdownChartRows>): string {
  let offset = 0;
  const segments = chartRows.map((row) => {
    const start = Number((offset * 100).toFixed(4));
    offset += row.ratio;
    const end = Number((offset * 100).toFixed(4));
    return `${row.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

export function TodayMetricReportPage({
  report,
  observationWindow,
  backLabel = "返回经营",
  fallbackPath = "/app/today",
  returnTo,
  topSection,
  extraSections,
}: {
  report: TodayDecisionReport;
  observationWindow?: ObservationWindowView;
  backLabel?: string;
  fallbackPath?: string;
  returnTo?: string;
  topSection?: ReactNode;
  extraSections?: ReactNode;
}) {
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const windowLabel = useObservationWindowLabel(observationWindow);
  const [activeObject, setActiveObject] = useState<TodayObjectCard | null>(null);
  const [activeGroup, setActiveGroup] = useState<TodayEvidenceGroup | null>(null);
  useFeatureView("today");
  const aiContext = useMemo(() => buildTodayPageAiDrilldownContext(report), [report]);
  const aiChatPath = useMemo(
    () =>
      buildWorkspaceChatPrefillPath({
        prompt: aiContext.chatPrompt,
        managedAiContext:
          aiContext.promptRegistryKey && aiContext.promptContextSchemaKey && aiContext.promptOutputSchemaKey
            ? {
                version: "v1",
                registryKey: aiContext.promptRegistryKey,
                contextSchemaKey: aiContext.promptContextSchemaKey,
                outputSchemaKey: aiContext.promptOutputSchemaKey,
              }
            : null,
      }),
    [aiContext.chatPrompt, aiContext.promptContextSchemaKey, aiContext.promptOutputSchemaKey, aiContext.promptRegistryKey],
  );

  const findGroup = (groupKey: string) => report.groups.find((group) => group.key === groupKey) ?? null;
  const previewItems = (group: TodayEvidenceGroup) => group.items.slice(0, 3);
  const openObjectFromGroup = (objectCard: TodayObjectCard) => {
    setActiveGroup(null);
    setActiveObject(objectCard);
  };

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
              <div style={{ display: "grid", gap: "0.35rem", justifyItems: isMobile ? "start" : "end" }}>
                <span style={pageAccentBadgeStyle}>{report.accent}</span>
                {windowLabel ? (
                  <span style={{ color: pageColorTokens.textFootnote, fontSize: "0.78rem" }}>{windowLabel}</span>
                ) : null}
              </div>
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

            {report.conclusionPoints && report.conclusionPoints.length > 0 ? (
              <div style={conclusionPanelStyle}>
                <strong style={conclusionTitleStyle}>补充判断</strong>
                <ul style={conclusionListStyle}>
                  {report.conclusionPoints.map((item) => (
                    <li key={item} style={conclusionListItemStyle}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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
            {report.breakdowns.map((block) => {
              const relatedGroups = block.relatedGroupKeys
                .map(findGroup)
                .filter((group): group is TodayEvidenceGroup => Boolean(group));
              const chartRows = buildBreakdownChartRows(block.rows);
              const hasRealChart =
                block.rows.length > 0 &&
                block.rows.every(
                  (row) => typeof row.chartValue === "number" && Number.isFinite(row.chartValue) && row.chartValue >= 0,
                ) &&
                block.rows.some((row) => (row.chartValue ?? 0) > 0);

              return (
                <section key={block.key} style={breakdownSectionCardStyle}>
                  <div style={breakdownSectionHeaderStyle}>
                    <strong style={breakdownTitleStyle}>{block.title}</strong>
                    <p style={summaryTextStyle}>{block.summary}</p>
                  </div>

                  <div style={breakdownSectionStyle(isMobile)}>
                    <div style={breakdownCardStyle}>
                      <div style={breakdownChartShellStyle}>
                        <div style={breakdownChartWrapStyle}>
                          <div
                            style={{
                              ...breakdownDonutChartStyle,
                              background: buildBreakdownChartGradient(chartRows),
                            }}
                          >
                            <div style={breakdownDonutInnerStyle}>
                              <strong style={breakdownDonutValueStyle}>{block.rows.length}</strong>
                              <span style={breakdownDonutLabelStyle}>{hasRealChart ? "真实占比" : "结构图"}</span>
                            </div>
                          </div>
                        </div>

                        <div style={breakdownLegendListStyle}>
                          {chartRows.map((row) => (
                            <div key={row.label} style={breakdownLegendItemStyle}>
                              <span
                                style={{
                                  ...breakdownLegendDotStyle,
                                  background: row.color,
                                }}
                              />
                              <span style={breakdownLegendTextStyle}>{row.label}</span>
                              <span style={breakdownLegendShareStyle}>{row.shareLabel}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={breakdownInsightPanelStyle}>
                      {chartRows.map((row) => (
                        <div key={row.label} style={breakdownRowStyle}>
                          <div style={breakdownRowHeaderStyle}>
                            <div style={breakdownRowLabelWrapStyle}>
                              <span
                                style={{
                                  ...breakdownLegendDotStyle,
                                  background: row.color,
                                }}
                              />
                              <strong style={rowTitleStyle}>{row.label}</strong>
                            </div>
                            <div style={rowValueStyle}>{row.value}</div>
                          </div>
                          <span style={rowMetaStyle}>{row.meta}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {relatedGroups.length > 0 ? (
                    <div style={topEntrySectionStyle}>
                      <div style={topEntryHeaderStyle}>
                        <strong style={topEntryTitleStyle}>Top 数据入口</strong>
                        <span style={topEntryMetaStyle}>按对象组继续往下钻</span>
                      </div>
                      <div style={topEntryGridStyle(isMobile)}>
                        {relatedGroups.map((group) => (
                          <button
                            key={group.key}
                            type="button"
                            style={topEntryCardStyle}
                            onClick={() => setActiveGroup(group)}
                          >
                            <div style={topEntryCardHeaderStyle}>
                              <span style={{ ...groupToneBadgeStyle, ...resolveGroupToneStyle(group.tone) }}>
                                {group.title}
                              </span>
                              <span style={objectActionHintStyle}>查看 Top 数据</span>
                            </div>
                            <p style={summaryTextStyle}>{group.summary}</p>
                            <div style={topEntryPreviewWrapStyle}>
                              {previewItems(group).map((item) => (
                                <span key={item.id} style={topEntryPreviewPillStyle}>
                                  {item.title}
                                </span>
                              ))}
                            </div>
                            <span style={topEntryFootnoteStyle}>{group.items.length} 个对象</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </PageSurface>

        {report.supplementaryGroups && report.supplementaryGroups.length > 0 ? (
          <PageSurface title="补充对象组">
            <div style={evidenceGroupStackStyle}>
              {report.supplementaryGroups.map((group) => (
                <section key={group.key} style={groupSectionStyle}>
                  <div style={groupHeaderRowStyle}>
                    <div style={groupHeaderStyle}>
                      <span style={{ ...groupToneBadgeStyle, ...resolveGroupToneStyle(group.tone) }}>
                        {group.title}
                      </span>
                      <p style={summaryTextStyle}>{group.summary}</p>
                    </div>
                    <button type="button" style={groupLinkButtonStyle} onClick={() => setActiveGroup(group)}>
                      查看全部
                    </button>
                  </div>
                  <div style={objectCardListStyle}>
                    {previewItems(group).map((item) => (
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

        <PageSurface title="和 AI 聊聊">
          <div style={reportActionPanelStyle}>
            <p style={summaryTextStyle}>AI 会自动带上这份报告里的判断、指标和拆解，继续帮你判断今天先动什么。</p>
            <button type="button" style={primaryButtonStyle} onClick={() => navigate(aiChatPath)}>
              和 AI 聊聊
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
      <TodayObjectGroupDialog
        open={Boolean(activeGroup)}
        onClose={() => setActiveGroup(null)}
        report={report}
        group={activeGroup}
        onSelectObject={openObjectFromGroup}
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

const conclusionPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
};

const conclusionTitleStyle: CSSProperties = {
  color: pageColorTokens.textPrimary,
  fontSize: "0.9rem",
};

const conclusionListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  color: pageColorTokens.textSecondary,
  display: "grid",
  gap: "0.4rem",
};

const conclusionListItemStyle: CSSProperties = {
  lineHeight: 1.6,
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
    gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 0.92fr) minmax(0, 1.08fr)",
    gap: "1rem",
    alignItems: "start",
  };
}

const breakdownStackStyle: CSSProperties = {
  display: "grid",
  gap: "1.1rem",
};

const breakdownSectionCardStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
};

const breakdownSectionHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const breakdownCardStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "1rem",
};

const breakdownTitleStyle: CSSProperties = {
  fontSize: "0.95rem",
  color: pageColorTokens.textPrimary,
};

const breakdownChartShellStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  justifyItems: "center",
};

const breakdownChartWrapStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  placeItems: "center",
};

const breakdownDonutChartStyle: CSSProperties = {
  width: 188,
  height: 188,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.04)",
};

const breakdownDonutInnerStyle: CSSProperties = {
  width: 104,
  height: 104,
  borderRadius: "50%",
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: "0.1rem",
  textAlign: "center",
};

const breakdownDonutValueStyle: CSSProperties = {
  fontSize: "1.55rem",
  lineHeight: 1,
  color: pageColorTokens.textPrimary,
};

const breakdownDonutLabelStyle: CSSProperties = {
  fontSize: "0.72rem",
  color: pageColorTokens.textSecondary,
  fontWeight: 700,
};

const breakdownLegendListStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gap: "0.45rem",
};

const breakdownLegendItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
};

const breakdownLegendDotStyle: CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  flexShrink: 0,
};

const breakdownLegendTextStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: pageColorTokens.textBody,
};

const breakdownLegendShareStyle: CSSProperties = {
  marginLeft: "auto",
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  fontWeight: 700,
};

const breakdownInsightPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
};

const breakdownRowStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  padding: "0.85rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceSubtle,
};

const breakdownRowHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "0.75rem",
  alignItems: "start",
};

const breakdownRowLabelWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  minWidth: 0,
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

const topEntrySectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
};

const topEntryHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const topEntryTitleStyle: CSSProperties = {
  fontSize: "0.88rem",
  color: pageColorTokens.textPrimary,
};

const topEntryMetaStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: pageColorTokens.textSecondary,
};

function topEntryGridStyle(isMobile: boolean): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "0.75rem",
  };
}

const topEntryCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.9rem",
  display: "grid",
  gap: "0.7rem",
  textAlign: "left",
  cursor: "pointer",
};

const topEntryCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const topEntryPreviewWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const topEntryPreviewPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.3rem 0.55rem",
  borderRadius: 999,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  color: pageColorTokens.textSecondary,
  fontSize: "0.76rem",
};

const topEntryFootnoteStyle: CSSProperties = {
  fontSize: "0.76rem",
  color: pageColorTokens.textFootnote,
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

const groupHeaderRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.75rem",
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

const groupLinkButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.brandBlue,
  borderRadius: 999,
  padding: "0.35rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
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

const reportActionPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  alignItems: "start",
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
