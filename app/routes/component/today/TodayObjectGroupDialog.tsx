import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useEmbeddedNavigate } from "../../../hooks/useEmbeddedNavigate";
import { buildTodayGroupAiDrilldownContext } from "../../../lib/todayReportAi";
import type { TodayDecisionReport, TodayEvidenceGroup, TodayObjectCard } from "../../../lib/todayReportTypes";
import { buildWorkspaceChatPrefillPath } from "../../../lib/workspaceChatPrefill";
import { DialogShell } from "../shared/DialogShell";
import { pageColorTokens } from "../../page/pageUiStyles";

function formatObjectTypeLabel(objectType: TodayObjectCard["objectType"]): string {
  if (objectType === "product") return "商品";
  if (objectType === "order") return "订单";
  if (objectType === "channel") return "来源";
  return "页面";
}

export function TodayObjectGroupDialog({
  open,
  onClose,
  report,
  group,
  onSelectObject,
}: {
  open: boolean;
  onClose: () => void;
  report: TodayDecisionReport;
  group: TodayEvidenceGroup | null;
  onSelectObject: (objectCard: TodayObjectCard) => void;
}) {
  const navigate = useEmbeddedNavigate();
  const aiContext = useMemo(() => (group ? buildTodayGroupAiDrilldownContext(report, group) : null), [group, report]);
  const aiChatPath = useMemo(() => {
    if (!aiContext || !group) return null;
    return buildWorkspaceChatPrefillPath({
      prompt: aiContext.chatPrompt,
      constraints: [
        `当前 AI 语境：Today / ${report.title} / ${group.title}`,
        "只围绕当前对象组回答赚钱结果相关问题。",
      ],
    });
  }, [aiContext, group, report.title]);

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      width={980}
      title={group?.title ?? "对象组"}
      description={group?.summary ?? "查看当前对象组的完整列表与建议动作。"}
      footer={
        <div style={footerRowStyle}>
          {aiChatPath ? (
            <button type="button" style={primaryButtonStyle} onClick={() => navigate(aiChatPath)}>
              带着这组对象和 AI 聊
            </button>
          ) : null}
          <button type="button" style={secondaryButtonStyle} onClick={onClose}>
            关闭
          </button>
        </div>
      }
    >
      {group ? (
        <div style={contentStackStyle}>
          <div style={groupMetaStyle}>
            <span>{group.title}</span>
            <span>{group.items.length} 个对象</span>
          </div>

          <div style={listHeaderStyle}>
            <div>#</div>
            <div>对象</div>
            <div>关键数据</div>
            <div>当前判断</div>
            <div>建议动作</div>
          </div>

          <div style={listStyle}>
            {group.items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                style={rowButtonStyle}
                onClick={() => onSelectObject(item)}
              >
                <div style={rankStyle}>{index + 1}</div>
                <div style={nameCellStyle}>
                  <strong style={nameTitleStyle}>{item.title}</strong>
                  <span style={nameMetaStyle}>{formatObjectTypeLabel(item.objectType)}</span>
                </div>
                <div style={metricPillWrapStyle}>
                  {item.metrics.map((metric) => (
                    <span key={metric.label} style={metricPillStyle}>
                      {metric.label} {metric.value}
                    </span>
                  ))}
                </div>
                <div style={summaryCellStyle}>{item.report.conclusion}</div>
                <div style={actionCellStyle}>
                  <span style={detailHintStyle}>查看详情</span>
                  <span>{item.report.actions.map((action) => action.title).join(" / ")}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </DialogShell>
  );
}

const contentStackStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
};

const groupMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.75rem",
  color: pageColorTokens.textSecondary,
  fontSize: "0.82rem",
};

const listHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px minmax(180px, 1.1fr) minmax(220px, 1.2fr) minmax(220px, 1.2fr) minmax(180px, 0.9fr)",
  gap: "0.75rem",
  padding: "0 0.25rem",
  color: pageColorTokens.textFootnote,
  fontSize: "0.76rem",
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
};

const rowButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.9rem",
  display: "grid",
  gridTemplateColumns: "48px minmax(180px, 1.1fr) minmax(220px, 1.2fr) minmax(220px, 1.2fr) minmax(180px, 0.9fr)",
  gap: "0.75rem",
  alignItems: "start",
  textAlign: "left",
  cursor: "pointer",
};

const rankStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 999,
  background: pageColorTokens.brandBlueLight,
  color: pageColorTokens.brandBlue,
  fontWeight: 700,
  fontSize: "0.8rem",
};

const nameCellStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
};

const nameTitleStyle: CSSProperties = {
  fontSize: "0.9rem",
  color: pageColorTokens.textPrimary,
};

const nameMetaStyle: CSSProperties = {
  fontSize: "0.76rem",
  color: pageColorTokens.textFootnote,
};

const metricPillWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
};

const metricPillStyle: CSSProperties = {
  padding: "0.35rem 0.55rem",
  borderRadius: 999,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.76rem",
  color: pageColorTokens.textSecondary,
};

const summaryCellStyle: CSSProperties = {
  color: pageColorTokens.textBody,
  fontSize: "0.82rem",
  lineHeight: 1.6,
};

const actionCellStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  color: pageColorTokens.textSecondary,
  fontSize: "0.8rem",
  lineHeight: 1.55,
};

const detailHintStyle: CSSProperties = {
  color: pageColorTokens.brandBlue,
  fontSize: "0.75rem",
  fontWeight: 700,
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
