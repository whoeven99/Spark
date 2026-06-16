import type { CSSProperties } from "react";
import type { TaskQuadrant } from "../../server/operations/diagnosisRules.server";
import { pageColorTokens } from "../page/pageUiStyles";

export const quadrantAccentColors: Record<TaskQuadrant, string> = {
  q1: "#dc2626",
  q2: "#ea580c",
  q3: "#4070f4",
  q4: "#6b7280",
};

export const quadrantTintColors: Record<TaskQuadrant, string> = {
  q1: "rgba(220, 38, 38, 0.04)",
  q2: "rgba(234, 88, 12, 0.04)",
  q3: "rgba(64, 112, 244, 0.04)",
  q4: "rgba(107, 114, 128, 0.04)",
};

export const quadrantCellStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `4px solid ${quadrantAccentColors[quadrant]}`,
  borderRadius: pageColorTokens.radiusCard,
  background: `linear-gradient(180deg, ${quadrantTintColors[quadrant]} 0%, #ffffff 60%)`,
  padding: "0.9rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.7rem",
  minHeight: "200px",
});

export const quadrantCountBadgeStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.5rem",
  height: "1.5rem",
  padding: "0 0.4rem",
  borderRadius: "999px",
  background: quadrantAccentColors[quadrant],
  color: "#fff",
  fontSize: "0.75rem",
  fontWeight: 700,
});

export const axisLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: pageColorTokens.textSecondary,
  userSelect: "none",
};

export const axisHintStyle: CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  lineHeight: 1.2,
  userSelect: "none",
};

export const matrixAxisLineStyle: CSSProperties = {
  background: pageColorTokens.borderSubtle,
  borderRadius: 999,
};

export const taskCardStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderLeft: `3px solid ${quadrantAccentColors[quadrant]}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: "1rem",
  background: pageColorTokens.surface,
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
});

export const taskCardStateStyle = (status: string): CSSProperties => {
  if (status === "done") {
    return {
      background: "#f9fbfa",
      borderColor: "#dbe7e1",
    };
  }
  if (status === "in_progress") {
    return {
      background: "#fcfcfe",
      boxShadow: "0 0 0 1px rgba(44, 110, 203, 0.08), 0 2px 6px rgba(44, 110, 203, 0.05)",
    };
  }
  return {};
};

export const taskTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9375rem",
  fontWeight: 700,
  color: pageColorTokens.textBody,
};

export const taskMetaTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

export const taskSecondaryTextStyle: CSSProperties = {
  ...taskMetaTextStyle,
  color: pageColorTokens.textSecondary,
};

export const actionListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "1.1rem",
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

export const segmentedNavWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.25rem",
  borderRadius: "999px",
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

export const segmentedNavButtonStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? pageColorTokens.border : "transparent"}`,
  borderRadius: "999px",
  padding: "0.48rem 0.9rem",
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 700,
  color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
  background: active ? pageColorTokens.surface : "transparent",
  boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
});

export const insightCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};


export const pillButtonStyle = (active: boolean): CSSProperties => ({
  borderRadius: "999px",
  border: `1px solid ${active ? pageColorTokens.border : pageColorTokens.borderSubtle}`,
  padding: "0.42rem 0.78rem",
  cursor: "pointer",
  background: active ? pageColorTokens.surface : pageColorTokens.surfaceMuted,
  color: active ? pageColorTokens.textPrimary : pageColorTokens.textSecondary,
  fontSize: "0.75rem",
  fontWeight: 700,
  boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
});

export const insightListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

export const listSectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
};

export const listRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr) auto",
  gap: "0.9rem",
  alignItems: "center",
  padding: "0.8rem 0.9rem",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
};

export const listRowMainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  minWidth: 0,
};

export const listRowMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  alignItems: "center",
  justifyContent: "flex-start",
};

export const listRowValueStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
};

export const listRowActionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  justifyContent: "flex-end",
};

export const riskCardStyle = (status: "healthy" | "watch" | "risk"): CSSProperties => ({
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `3px solid ${
    status === "healthy" ? "#15803d" : status === "watch" ? "#d97706" : "#dc2626"
  }`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  minHeight: "168px",
});

export const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.55,
};

export const toolbarSurfaceStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.65rem",
  padding: "0.8rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

export const toolbarLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  letterSpacing: "0.01em",
};

export const filterToolbarRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
};

export const filterControlWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  minWidth: 0,
  flex: "0 0 auto",
};

export const filterSelectStyle: CSSProperties = {
  minWidth: "10rem",
  height: "2rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  fontSize: "0.8125rem",
  padding: "0 0.7rem",
  outline: "none",
};

export const metricValueStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.375rem",
  fontWeight: 700,
  lineHeight: 1.2,
  color: pageColorTokens.textPrimary,
};

export const metricMetaRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap",
};

export const subtleInlineStatStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.25rem 0.5rem",
  borderRadius: "999px",
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: "0.75rem",
  fontWeight: 600,
};

export const quietPanelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "0.7rem 0.8rem",
};

export const taskInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.55rem",
};

export const taskInfoItemStyle: CSSProperties = {
  ...quietPanelStyle,
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

export const taskInfoLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

export const taskActionsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  paddingTop: "0.15rem",
};

export const reviewDeltaCardStyle: CSSProperties = {
  padding: "0.6rem 0.85rem",
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  background: pageColorTokens.surface,
};

export const overviewMiniLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

export const overviewMiniValueStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

export const valueCardSectionStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

export const customerTagWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  padding: "0.75rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

export const channelTableWrapStyle: CSSProperties = {
  overflowX: "auto",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
};

export const caveatPanelStyle: CSSProperties = {
  marginTop: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  padding: "0.75rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

export const costFormWrapStyle: CSSProperties = {
  padding: "0.85rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

export const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "0.7rem",
};

export const summaryCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "0.85rem 0.9rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
};

export const summaryListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  margin: 0,
};

export const summaryListItemStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.5,
};

export const detailActionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginTop: "0.15rem",
};

export const detailHeroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "0.55rem",
};

export const detailHeroCardStyle: CSSProperties = {
  padding: "0.7rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
  minWidth: 0,
};

export const detailTabsWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  padding: "0.7rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

export const detailSectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

export const detailFocusCardStyle: CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
  display: "flex",
  flexDirection: "column",
  gap: "0.85rem",
};

export const detailInfoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "0.7rem",
};

export const detailInfoCardStyle: CSSProperties = {
  padding: "0.65rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

export const detailInfoLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

export const detailInfoValueStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 700,
  color: pageColorTokens.textBody,
};

export const detailTableStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
};

export const monitoringInsightHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

export const detailContextHeaderStyle: CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

export const detailContextTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.15rem",
  lineHeight: 1.35,
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

export const relatedObjectWrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.55rem",
  padding: "0.85rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surface,
};
export const overflowMenuTriggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "2rem",
  height: "2rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textSecondary,
  cursor: "pointer",
  fontSize: "1.1rem",
  lineHeight: 1,
};

export const overflowMenuPopoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 0.3rem)",
  right: 0,
  zIndex: 30,
  minWidth: "10rem",
  padding: "0.35rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCardStrong,
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
};

export const overflowMenuItemStyle = (tone: "default" | "critical"): CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: tone === "critical" ? pageColorTokens.critical : pageColorTokens.textBody,
});

export const quadrantGroupHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.1rem 0.1rem 0",
};

export const quadrantDotStyle = (quadrant: TaskQuadrant): CSSProperties => ({
  width: "0.6rem",
  height: "0.6rem",
  borderRadius: "50%",
  background: quadrantAccentColors[quadrant],
  flex: "0 0 auto",
});

export const closedToggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.5rem 0.2rem",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
};

// ── 今日概要：带状态色 + 趋势箭头的指标卡 ──

export const detailLinkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  border: "none",
  background: "transparent",
  padding: "0.25rem 0.1rem",
  cursor: "pointer",
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: pageColorTokens.brandBlue,
};

export const metricAccentColors = {
  positive: pageColorTokens.brandGreen,
  negative: pageColorTokens.critical,
  warning: "#d97706",
  info: pageColorTokens.brandBlue,
  neutral: pageColorTokens.borderSubtle,
} as const;

export const radarStatusColors: Record<"healthy" | "watch" | "risk", string> = {
  healthy: "#15803d",
  watch: "#d97706",
  risk: "#dc2626",
};

export const radarListStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  overflow: "hidden",
};

export const radarRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.7rem",
  width: "100%",
  padding: "0.75rem 0.9rem",
  border: "none",
  borderTop: `1px solid ${pageColorTokens.divider}`,
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};

export const radarDotStyle = (color: string): CSSProperties => ({
  width: "0.6rem",
  height: "0.6rem",
  borderRadius: "50%",
  background: color,
  flex: "0 0 auto",
});

export const radarExpandBodyStyle: CSSProperties = {
  padding: "0.4rem 0.9rem 0.95rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  background: pageColorTokens.surfaceMuted,
};

export const valueTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
  background: pageColorTokens.surface,
};

export const valueThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

export const valueGroupThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.5rem",
  color: pageColorTokens.textBody,
  borderBottom: `2px solid ${pageColorTokens.border}`,
  borderRight: `1px solid ${pageColorTokens.divider}`,
  fontWeight: 800,
  fontSize: "0.75rem",
  whiteSpace: "nowrap",
  background: pageColorTokens.surfaceMuted,
};

export const groupHeadInnerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
};

export const valueTdStyle: CSSProperties = {
  padding: "0.72rem 0.6rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

export const costInputStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: `1px solid ${pageColorTokens.borderInput}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.875rem",
};

export const costLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  flex: "1 1 160px",
};
