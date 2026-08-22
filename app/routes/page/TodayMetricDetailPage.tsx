import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { buildTodayAiDrilldownContext } from "../../lib/todayMetricAiDetail";
import { useFeatureView } from "../../lib/featureTrack";
import type { TodayMetricAction, TodayMetricDetail, TodayMetricStatus } from "../../lib/todayMetricModules";
import { buildWorkspaceChatPrefillPath } from "../../lib/workspaceChatPrefill";
import { DialogShell } from "../component/shared/DialogShell";
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
  backLabel = "返回经营",
  fallbackPath = "/app/today",
  returnTo,
  extraSections,
}: {
  data: TodayMetricDetail;
  backLabel?: string;
  fallbackPath?: string;
  returnTo?: string;
  extraSections?: ReactNode;
}) {
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  useFeatureView("today");
  const aiContext = buildTodayAiDrilldownContext(data);
  const [trendTable, objectTable, ...extraTables] = data.tables;
  const [selectedAction, setSelectedAction] = useState<TodayMetricAction | null>(null);
  const aiDialogPrompt = useMemo(() => {
    if (!selectedAction) return aiContext.chatPrompt;
    return [
      aiContext.chatPrompt,
      "",
      "当前想继续展开的建议动作：",
      `- [${selectedAction.priority}] ${selectedAction.title}: ${selectedAction.detail}`,
      "",
      "请围绕这条动作继续拆解：先解释为什么它应该优先处理，再给出更具体的排查顺序、判断标准和下一步动作。",
    ].join("\n");
  }, [aiContext.chatPrompt, selectedAction]);
  const aiChatPath = useMemo(
    () =>
      buildWorkspaceChatPrefillPath({
        prompt: aiDialogPrompt,
        constraints: [
          `当前 AI 语境：Today / ${data.title}`,
          selectedAction ? `当前聚焦动作：${selectedAction.title}` : null,
          "只回答和赚钱结果相关的问题，不切回通用助手语境。",
        ],
      }),
    [aiDialogPrompt, data.title, selectedAction],
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

        {extraSections ?? null}

        <PageSurface title="建议动作" subtitle="每条动作都应该能直接承接今天要先做什么。">
          <div style={actionListStyle}>
            {data.actions.map((action) => (
              <div key={action.title} style={actionItemStyle}>
                <div style={actionHeaderStyle(isMobile)}>
                  <strong style={actionTitleStyle}>
                    {action.title}
                    <span style={actionPriorityStyle}>{action.priority}</span>
                  </strong>
                  <button
                    type="button"
                    onClick={() => setSelectedAction(action)}
                    style={actionAiButtonStyle}
                  >
                    和 AI 聊聊
                  </button>
                </div>
                <span style={actionDetailStyle}>{action.detail}</span>
              </div>
            ))}
          </div>
        </PageSurface>
      </div>

      <DialogShell
        open={Boolean(selectedAction)}
        onClose={() => setSelectedAction(null)}
        width={720}
        title="和 AI 聊聊"
        description={
          selectedAction
            ? `围绕「${selectedAction.title}」继续拆解优先级、排查顺序和下一步动作。`
            : "继续围绕当前 Today 模块分析赚钱结果。"
        }
        footer={
          <div style={chartActionRowStyle(isMobile)}>
            <SurfaceButton
              label="带着这条动作去和 AI 聊"
              onClick={() => {
                navigate(aiChatPath);
                setSelectedAction(null);
              }}
            />
            <SurfaceButton label="关闭" tone="subtle" onClick={() => setSelectedAction(null)} />
          </div>
        }
      >
        <div style={aiPanelStyle}>
          {selectedAction ? (
            <div style={aiMetaPanelStyle}>
              <strong style={pageMetricLabelStyle}>当前动作</strong>
              <div style={selectedActionCardStyle}>
                <strong style={actionTitleStyle}>
                  {selectedAction.title}
                  <span style={actionPriorityStyle}>{selectedAction.priority}</span>
                </strong>
                <span style={actionDetailStyle}>{selectedAction.detail}</span>
              </div>
            </div>
          ) : null}
          <div style={aiMetaPanelStyle}>
            <strong style={pageMetricLabelStyle}>AiDrilldownContext</strong>
            <pre style={aiPromptStyle}>{JSON.stringify(aiContext, null, 2)}</pre>
          </div>
          <div style={aiMetaPanelStyle}>
            <strong style={pageMetricLabelStyle}>AI Chat Prompt</strong>
            <pre style={aiPromptStyle}>{aiDialogPrompt}</pre>
          </div>
          <div style={chartEntryStyle}>
            <div style={{ flex: "1 1 20rem", minWidth: 0 }}>
              <div style={pageMetricLabelStyle}>当前模块</div>
              <div style={pageMetricValueStyle}>{data.title}</div>
              <div style={pageHintTextStyle}>{data.chartHint}</div>
            </div>
          </div>
        </div>
      </DialogShell>
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

const actionAiButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.45rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.brandBlue,
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
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

const selectedActionCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceSubtle,
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
