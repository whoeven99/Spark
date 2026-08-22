import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { buildTodayAiDrilldownContext } from "../../lib/todayMetricAiDetail";
import { useFeatureView } from "../../lib/featureTrack";
import type { TodayMetricDetail, TodayMetricStatus } from "../../lib/todayMetricModules";
import { buildWorkspaceChatPrefillPath } from "../../lib/workspaceChatPrefill";
import {
  mobilePageContentStyle,
  pageAccentBadgeStyle,
  pageColorTokens,
  pageContentStyle,
  pageIntroBannerStyle,
  pageMetaTextStyle,
  pageMetricLabelStyle,
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  pageSectionHeaderRowStyle,
  pageSectionMajorTitleStyle,
  pageStatusCardStyle,
} from "./pageUiStyles";

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.65rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "0.65rem 0.5rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
};

function resolveStatusTone(status: TodayMetricStatus["status"]): "success" | "warning" | "critical" {
  if (status === "healthy") return "success";
  if (status === "watch") return "warning";
  return "critical";
}

function resolveStatusLabel(status: TodayMetricStatus["status"]): string {
  if (status === "healthy") return "正常";
  if (status === "watch") return "关注";
  return "风险";
}

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}

function SurfaceButton({
  label,
  onClick,
  tone = "primary",
}: {
  label: string;
  onClick: () => void;
  tone?: "primary" | "subtle";
}) {
  const style: CSSProperties =
    tone === "primary"
      ? {
          border: `1px solid ${pageColorTokens.brandBlue}`,
          background: pageColorTokens.brandBlue,
          color: "#ffffff",
        }
      : {
          border: `1px solid ${pageColorTokens.border}`,
          background: pageColorTokens.surface,
          color: pageColorTokens.textBody,
        };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 36,
        padding: "0.55rem 0.9rem",
        borderRadius: pageColorTokens.radiusControl,
        fontSize: "0.8125rem",
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function TodayMetricDetailPage({
  data,
  backLabel = "返回经营",
  fallbackPath = "/app/today",
  returnTo,
  topSection,
  extraSections,
}: {
  data: TodayMetricDetail;
  backLabel?: string;
  fallbackPath?: string;
  returnTo?: string;
  topSection?: ReactNode;
  extraSections?: ReactNode;
}) {
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  useFeatureView("today");
  const aiContext = buildTodayAiDrilldownContext(data);
  const [trendTable, objectTable, ...extraTables] = data.tables;
  const aiChatPath = useMemo(
    () =>
      buildWorkspaceChatPrefillPath({
        prompt: aiContext.chatPrompt,
        constraints: [
          `当前 AI 语境：Today / ${data.title}`,
          "只回答和赚钱结果相关的问题，不切回通用助手语境。",
        ],
      }),
    [aiContext.chatPrompt, data.title],
  );

  return (
    <>
      <div style={pageIntroBannerStyle({ marginBottom: "1.5rem" })}>{data.intro}</div>

      <div style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}>
        <PageHeaderNav
          title={data.title}
          subtitle={data.subtitle}
          titleBarTitle={data.title}
          backLabel={backLabel}
          fallbackPath={fallbackPath}
          returnTo={returnTo}
        />

        {topSection ?? null}

        <PageSurface
          title="经营报告"
          subtitle="Today 详情页统一按一份报告来读：先看今天要回答什么，再看支撑赚钱结果的指标、趋势、对象和建议动作。"
        >
          <section style={reportSectionStyle}>
            <div
              style={
                isMobile
                  ? { ...pageSectionHeaderRowStyle, flexDirection: "column", alignItems: "flex-start", gap: "0.65rem" }
                  : pageSectionHeaderRowStyle
              }
            >
              <h2 style={pageSectionMajorTitleStyle}>报告结论</h2>
              <span style={pageAccentBadgeStyle}>{data.accent}</span>
            </div>
            <p style={{ ...pageMetaTextStyle, marginTop: 0 }}>{data.primaryQuestion}</p>
            <div style={reportStatusListStyle}>
              {data.statuses.map((item) => (
                <div key={item.label} style={pageStatusCardStyle}>
                  <s-stack direction={isMobile ? "block" : "inline"} gap="base" alignItems="center">
                    <s-badge tone={resolveStatusTone(item.status)}>
                      {item.label}：{resolveStatusLabel(item.status)}
                    </s-badge>
                    <s-paragraph>{item.detail}</s-paragraph>
                  </s-stack>
                </div>
              ))}
            </div>
            <s-unordered-list>
              {data.conclusions.map((line) => (
                <s-list-item key={line}>{line}</s-list-item>
              ))}
            </s-unordered-list>
          </section>

          <div style={reportBlockStyle}>
            <div style={reportBlockTitleStyle}>关键指标</div>
            <PageMetricCard metrics={data.metrics} footer={data.chartHint} />
          </div>

          {trendTable ? (
            <div style={reportBlockStyle}>
              <div style={reportBlockTitleStyle}>趋势拆解</div>
              <TableWrap>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {trendTable.columns.map((column) => (
                        <th key={column} style={thStyle}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trendTable.rows.map((row, rowIndex) => (
                      <tr key={`${trendTable.title}-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${trendTable.title}-${rowIndex}-${cellIndex}`} style={tdStyle}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          ) : null}

          {objectTable ? (
            <div style={reportBlockStyle}>
              <div style={reportBlockTitleStyle}>关键对象</div>
              <TableWrap>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {objectTable.columns.map((column) => (
                        <th key={column} style={thStyle}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {objectTable.rows.map((row, rowIndex) => (
                      <tr key={`${objectTable.title}-${rowIndex}`}>
                        {row.map((cell, cellIndex) => (
                          <td key={`${objectTable.title}-${rowIndex}-${cellIndex}`} style={tdStyle}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {extraTables.map((table) => (
                <div key={table.title} style={reportSubtableStyle}>
                  <div style={reportSubtableTitleStyle}>{table.title}</div>
                  <TableWrap>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          {table.columns.map((column) => (
                            <th key={column} style={thStyle}>
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={`${table.title}-${rowIndex}`}>
                            {row.map((cell, cellIndex) => (
                              <td key={`${table.title}-${rowIndex}-${cellIndex}`} style={tdStyle}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </div>
              ))}
            </div>
          ) : null}

          <div style={reportBlockStyle}>
            <div style={reportBlockTitleStyle}>建议动作</div>
            <div style={actionListStyle}>
              {data.actions.map((action) => (
                <div key={action.title} style={actionItemStyle}>
                  <div style={actionHeaderStyle(isMobile)}>
                    <strong style={actionTitleStyle}>
                      {action.title}
                      <span style={actionPriorityStyle}>{action.priority}</span>
                    </strong>
                  </div>
                  <span style={actionDetailStyle}>{action.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={reportBlockStyle}>
            <div style={reportBlockTitleStyle}>报告操作</div>
            <div style={reportAiPanelStyle}>
              <div style={aiMetaPanelStyle}>
                <strong style={pageMetricLabelStyle}>和 AI 聊聊</strong>
                <p style={aiSummaryTextStyle}>
                  AI 会自动带上这份经营报告里的结论、关键指标、状态判断和建议动作，
                  继续帮你判断今天最值得优先处理的赚钱问题。
                </p>
              </div>
              <div style={chartActionRowStyle(isMobile)}>
                <SurfaceButton
                  label="带着这份报告去和 AI 聊"
                  onClick={() => navigate(aiChatPath)}
                />
              </div>
            </div>
          </div>
        </PageSurface>

        {extraSections ? (
          <section style={appendixSectionStyle}>
            <div style={appendixHeaderStyle}>
              <h2 style={pageSectionMajorTitleStyle}>补充分析</h2>
              <p style={appendixSubtitleStyle}>
                这里放补充判断和更细的经营拆解，作为这份报告的附录，不和主报告混在一起。
              </p>
            </div>
            {extraSections}
          </section>
        ) : null}
      </div>
    </>
  );
}

function chartActionRowStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: "0.75rem",
    alignItems: isMobile ? "stretch" : "center",
  };
}

const reportSectionStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const reportBlockStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  marginTop: "1rem",
};

const reportBlockTitleStyle: CSSProperties = {
  fontSize: "0.88rem",
  fontWeight: 760,
  color: pageColorTokens.textBody,
};

const reportSubtableStyle: CSSProperties = {
  marginTop: "1rem",
};

const reportSubtableTitleStyle: CSSProperties = {
  ...pageMetricLabelStyle,
  marginBottom: "0.5rem",
};

const reportStatusListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const actionListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

function actionHeaderStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: isMobile ? "flex-start" : "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexDirection: isMobile ? "column" : "row",
  };
}

const actionItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
};

const actionTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
  color: pageColorTokens.textBody,
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

const actionDetailStyle: CSSProperties = {
  color: pageColorTokens.textSecondary,
  lineHeight: 1.5,
};

const reportAiPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const aiMetaPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const aiSummaryTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.6,
};

const appendixSectionStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const appendixHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const appendixSubtitleStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.84rem",
  lineHeight: 1.5,
};
