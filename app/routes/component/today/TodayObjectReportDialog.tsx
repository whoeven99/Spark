import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useEmbeddedNavigate } from "../../../hooks/useEmbeddedNavigate";
import { buildWorkspaceChatPrefillPath } from "../../../lib/workspaceChatPrefill";
import { buildTodayObjectAiDrilldownContext } from "../../../lib/todayReportAi";
import type { TodayDecisionReport, TodayObjectCard } from "../../../lib/todayReportTypes";
import { DialogShell } from "../shared/DialogShell";
import { pageColorTokens, pageMetricLabelStyle, pageMetricValueStyle } from "../../page/pageUiStyles";

export function TodayObjectReportDialog({
  open,
  onClose,
  report,
  objectCard,
}: {
  open: boolean;
  onClose: () => void;
  report: TodayDecisionReport;
  objectCard: TodayObjectCard | null;
}) {
  const navigate = useEmbeddedNavigate();
  const aiContext = useMemo(
    () => (objectCard ? buildTodayObjectAiDrilldownContext(report, objectCard) : null),
    [objectCard, report],
  );
  const aiChatPath = useMemo(() => {
    if (!aiContext) return null;
    return buildWorkspaceChatPrefillPath({
      prompt: aiContext.chatPrompt,
    });
  }, [aiContext]);

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={960}
      title={objectCard?.report.title ?? "对象报告"}
      description={objectCard?.report.subtitle ?? "查看当前对象的完整数据、结论和分析要点。"}
      footer={
        <div style={footerRowStyle}>
          {aiChatPath ? (
            <button type="button" style={primaryButtonStyle} onClick={() => navigate(aiChatPath)}>
              和 AI 聊聊
            </button>
          ) : null}
          <button type="button" style={secondaryButtonStyle} onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      {objectCard ? (
        <div style={contentStackStyle}>
          <div style={metricGridStyle}>
            {objectCard.report.headlineMetrics.map((metric) => (
              <div key={metric.label} style={metricTileStyle}>
                <div style={pageMetricLabelStyle}>{metric.label}</div>
                <div style={pageMetricValueStyle}>{metric.value}</div>
              </div>
            ))}
          </div>

          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>对象结论</div>
            <p style={bodyTextStyle}>{objectCard.report.conclusion}</p>
          </section>

          <section style={sectionStyle}>
            <div style={sectionTitleStyle}>分析要点</div>
            <div style={pointListStyle}>
              {objectCard.report.analysisPoints.map((point) => (
                <div key={point} style={pointItemStyle}>
                  {point}
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </DialogShell>
  );
}

const contentStackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "0.75rem",
};

const metricTileStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.9rem",
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.6rem",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const bodyTextStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.65,
};

const pointListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const pointItemStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.85rem 0.9rem",
  color: pageColorTokens.textBody,
  fontSize: "0.875rem",
  lineHeight: 1.6,
};

const footerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "0.75rem",
};

const primaryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.brandBlue,
  color: "#ffffff",
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.55rem 0.9rem",
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textBody,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.55rem 0.9rem",
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
};
