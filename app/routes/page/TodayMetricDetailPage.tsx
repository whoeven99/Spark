import type { CSSProperties, ReactNode } from "react";
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
  pageHintTextStyle,
  pageIntroBannerStyle,
  pageMetaTextStyle,
  pageMetricLabelStyle,
  pageMetricValueStyle,
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
}: {
  data: TodayMetricDetail;
}) {
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  useFeatureView("today");
  const aiContext = buildTodayAiDrilldownContext(data);
  const [trendTable, objectTable, ...extraTables] = data.tables;
  const aiChatPath = buildWorkspaceChatPrefillPath({
    prompt: aiContext.chatPrompt,
    constraints: [
      `当前 AI 语境：Today / ${data.title}`,
      "只回答和赚钱结果相关的问题，不切回通用助手语境。",
    ],
  });

  return (
    <>
      <div style={pageIntroBannerStyle({ marginBottom: "1.5rem" })}>{data.intro}</div>

      <div style={{ ...pageContentStyle, ...(isMobile ? mobilePageContentStyle : null) }}>
        <PageHeaderNav
          title={data.title}
          subtitle={data.subtitle}
          titleBarTitle={data.title}
          backLabel="返回经营"
          fallbackPath="/app/today"
        />

        <section>
          <div
            style={
              isMobile
                ? { ...pageSectionHeaderRowStyle, flexDirection: "column", alignItems: "flex-start", gap: "0.65rem" }
                : pageSectionHeaderRowStyle
            }
          >
            <h2 style={pageSectionMajorTitleStyle}>结论</h2>
            <span style={pageAccentBadgeStyle}>{data.accent}</span>
          </div>
          <PageSurface
            title="今天先回答什么"
            subtitle="Today 详情页固定先给结论：这个模块今天对赚钱结果意味着什么。"
          >
            <p style={{ ...pageMetaTextStyle, marginTop: 0 }}>{data.primaryQuestion}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
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
          </PageSurface>
        </section>

        <PageSurface title="关键指标" subtitle="只保留支撑判断的关键指标，不把 Today 做回一个分散的数据入口。">
          <PageMetricCard metrics={data.metrics} footer={data.chartHint} />
        </PageSurface>

        {trendTable ? (
          <PageSurface
            title="趋势图表"
            subtitle="这里先用结构化表格收住趋势判断，后续继续补真实图表和更深的趋势分析。"
          >
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
          </PageSurface>
        ) : null}

        {objectTable ? (
          <PageSurface
            title="关键对象拆解"
            subtitle="这里聚焦最值得继续深挖的对象，而不是再铺一层泛化报表。"
          >
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
              <div key={table.title} style={{ marginTop: "1rem" }}>
                <div style={{ ...pageMetricLabelStyle, marginBottom: "0.5rem" }}>{table.title}</div>
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
          </PageSurface>
        ) : null}

        <PageSurface title="建议动作" subtitle="每条动作都应该能直接承接今天要先做什么。">
          <div style={actionListStyle}>
            {data.actions.map((action) => (
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

        <PageSurface
          title="和 AI 聊聊"
          subtitle="这里的 AI 只继续围绕当前 Today 模块分析赚钱结果，不跳回通用聊天语境。"
        >
          <div style={aiPanelStyle}>
            <div style={aiMetaPanelStyle}>
              <strong style={pageMetricLabelStyle}>AiDrilldownContext</strong>
              <pre style={aiPromptStyle}>{JSON.stringify(aiContext, null, 2)}</pre>
            </div>
            <div style={aiMetaPanelStyle}>
              <strong style={pageMetricLabelStyle}>AI Chat Prompt</strong>
              <pre style={aiPromptStyle}>{aiContext.chatPrompt}</pre>
            </div>
            <div style={chartEntryStyle}>
              <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
                <div style={pageMetricLabelStyle}>当前模块</div>
                <div style={pageMetricValueStyle}>{data.title}</div>
                <div style={pageHintTextStyle}>{data.chartHint}</div>
              </div>
              <div style={chartActionRowStyle(isMobile)}>
                <SurfaceButton label="带着这个模块去和 AI 聊" onClick={() => navigate(aiChatPath)} />
                <SurfaceButton label="返回经营首页" tone="subtle" onClick={() => navigate("/app/today")} />
              </div>
            </div>
          </div>
        </PageSurface>
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

const chartEntryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const actionListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

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

const aiPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const aiMetaPanelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const aiPromptStyle: CSSProperties = {
  margin: 0,
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
  color: pageColorTokens.textBody,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowX: "auto",
};
