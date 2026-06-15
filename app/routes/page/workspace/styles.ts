/** WorkspaceAppShellPage 拆分出的共享样式常量（Shopify Admin / Polaris 对齐）。 */
import type { CSSProperties } from "react";
import type { WorkspaceDashboardMetricTone } from "../../../lib/workspaceDashboardTypes";

/** Shopify Admin / Polaris 对齐色板 */
export const shopifyUi = {
  pageBg: "#f6f6f7",
  surface: "#ffffff",
  surfaceSubtle: "#fafbfb",
  border: "#e1e3e5",
  borderStrong: "#c9cccf",
  text: "#1f2124",
  textSecondary: "#61666c",
  textMuted: "#8c9196",
  primary: "#008060",
  primaryHover: "#006e52",
  primarySurface: "#e9f7ef",
  primaryText: "#004c3f",
  link: "#005bd3",
  radiusControl: 10,
  radiusCard: 14,
  shadowCard: "0 1px 0 rgba(0, 0, 0, 0.05)",
} as const;

export const shellStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr)",
  background: shopifyUi.pageBg,
};

export const mobileShellStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: shopifyUi.pageBg,
};

export const mobileTopBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  borderBottom: `1px solid ${shopifyUi.border}`,
  background: "rgba(246, 246, 247, 0.96)",
  backdropFilter: "blur(8px)",
};

export const mobileTopBarButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: `1px solid ${shopifyUi.borderStrong}`,
  background: shopifyUi.surface,
  color: shopifyUi.text,
  fontSize: 16,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
  padding: 0,
  flexShrink: 0,
};

export const mobileTopBarTitleWrapStyle: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export const mobileTopBarTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: shopifyUi.text,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export const mobileSidebarBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.22)",
  zIndex: 20,
  display: "flex",
};

export const mobileSidebarStyle: CSSProperties = {
  width: "min(86vw, 320px)",
  minHeight: "100vh",
  borderRight: `1px solid ${shopifyUi.border}`,
  boxShadow: "0 24px 56px rgba(15, 23, 42, 0.16)",
};

export const sidebarStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "16px 12px",
  borderRight: `1px solid ${shopifyUi.border}`,
  background: shopifyUi.surface,
  gap: 14,
  height: "100vh",
  overflow: "hidden",
  position: "sticky",
  top: 0,
};

export const contentStyle: CSSProperties = {
  padding: "24px 28px 36px",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  minWidth: 0,
  background: shopifyUi.pageBg,
};

export const mobileContentStyle: CSSProperties = {
  padding: "14px 14px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
  flex: 1,
};

export const brandRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
  padding: "6px 8px",
  borderRadius: shopifyUi.radiusCard,
};
export const brandBadgeStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: shopifyUi.primary,
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 13,
};
export const brandTitleStyle: CSSProperties = { fontSize: 14, fontWeight: 700, color: shopifyUi.text };
export const brandMetaStyle: CSSProperties = { fontSize: 12, color: shopifyUi.textMuted };

export const newChatButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  border: `1px solid ${shopifyUi.primary}`,
  borderRadius: shopifyUi.radiusControl,
  background: shopifyUi.primary,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff",
  cursor: "pointer",
  marginBottom: 10,
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.05)",
};
export const newChatPlusBadgeStyle: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 6,
  background: "rgba(255, 255, 255, 0.2)",
  display: "grid",
  placeItems: "center",
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1,
  flexShrink: 0,
};

export const navGroupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2 };
export const navButtonStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  border: "none",
  borderRadius: shopifyUi.radiusControl,
  background: active ? shopifyUi.primarySurface : "transparent",
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  color: active ? shopifyUi.primaryText : shopifyUi.textSecondary,
  cursor: "pointer",
  textAlign: "left",
  boxShadow: active ? `inset 3px 0 0 ${shopifyUi.primary}` : "none",
});
export const navIconStyle = (active: boolean): CSSProperties => ({
  fontSize: 13,
  color: active ? shopifyUi.primary : shopifyUi.textMuted,
  flexShrink: 0,
  width: 16,
  textAlign: "center",
});

export const sidebarDividerStyle: CSSProperties = {
  height: 1,
  background: "#e1e3e5",
  margin: "10px 2px",
};

export const sidebarSectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, minHeight: 0, flex: 1 };
export const sidebarSectionHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 11,
  fontWeight: 600,
  color: "#8c9196",
  padding: "4px 10px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
export const conversationListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 1, overflowY: "auto", paddingRight: 0, flex: 1 };
export const historyRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 0,
  position: "relative",
};
export const historyItemStyle = (active: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
  textAlign: "left",
  border: "none",
  borderRadius: shopifyUi.radiusControl,
  background: active ? shopifyUi.primarySurface : "transparent",
  padding: "6px 10px",
  cursor: "pointer",
  overflow: "hidden",
  boxShadow: active ? `inset 3px 0 0 ${shopifyUi.primary}` : "none",
});
export const historyDeleteButtonStyle: CSSProperties = {
  flexShrink: 0,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "#8c9196",
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  padding: "4px 6px",
};
export const historyTitleStyle = (active: boolean): CSSProperties => ({
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  color: active ? shopifyUi.primaryText : shopifyUi.text,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "block",
  width: "100%",
});
export const accountMenuWrapStyle: CSSProperties = {
  position: "relative",
  paddingTop: 12,
  borderTop: "1px solid #e1e3e5",
};
export const sidebarFooterButtonStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  border: "1px solid transparent",
  borderRadius: 12,
  background: "transparent",
  padding: "10px 10px 0",
  textAlign: "left",
  cursor: "pointer",
};
export const accountMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "calc(100% + 10px)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.12)",
  zIndex: 10,
};
export const accountMenuSectionStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
export const accountMenuLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#6d7175" };
export const accountMenuItemStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #dfe3e8",
  borderRadius: 10,
  background: "#ffffff",
  color: "#202223",
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
};
export const footerTagStyle: CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: shopifyUi.primarySurface,
  color: shopifyUi.primary,
  fontSize: 12,
  fontWeight: 600,
};

export const panelStackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 };
export const surfaceCardStyle: CSSProperties = {
  background: shopifyUi.surface,
  border: `1px solid ${shopifyUi.border}`,
  borderRadius: shopifyUi.radiusCard,
  boxShadow: shopifyUi.shadowCard,
  padding: 20,
};
export const mobileSurfaceCardStyle: CSSProperties = {
  ...surfaceCardStyle,
  padding: 14,
  borderRadius: 12,
};
export const sectionHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 };
export const mobileSectionHeaderStyle: CSSProperties = {
  ...sectionHeaderStyle,
  flexDirection: "column",
  gap: 10,
  marginBottom: 12,
};
export const sectionTitleStyle: CSSProperties = { fontSize: 18, fontWeight: 700, color: shopifyUi.text, letterSpacing: "-0.01em" };
export const sectionTitleSmallStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: shopifyUi.text };
export const sectionTextStyle: CSSProperties = { fontSize: 14, color: shopifyUi.textSecondary, lineHeight: 1.6 };
export const mutedMetaStyle: CSSProperties = { fontSize: 12, color: shopifyUi.textMuted };

export const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
export const mobileMetricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
export const metricLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: "#6d7175" };
export const dashboardSectionTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
export const pendingIntegrationBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: "#6d7175",
  background: "#f1f2f3",
  border: "1px dashed #c9cccf",
  lineHeight: 1.4,
};
export const pendingIntegrationBadgeSmallStyle: CSSProperties = {
  ...pendingIntegrationBadgeStyle,
  fontSize: 10,
  padding: "1px 6px",
};
export const metricValueStyle: CSSProperties = { marginTop: 10, fontSize: 26, fontWeight: 700, color: "#202223", letterSpacing: "-0.02em" };
export const metricDeltaStyle = (tone: WorkspaceDashboardMetricTone): CSSProperties => ({
  marginTop: 8,
  fontSize: 12,
  fontWeight: 600,
  color: tone === "positive" ? shopifyUi.primary : tone === "negative" ? "#8a2e0f" : shopifyUi.textMuted,
});

export const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 };
export const mobileTwoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: 12 };
export const listColumnStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
export const summaryItemStyle: CSSProperties = { padding: 14, borderRadius: 12, border: "1px solid #e9eaeb", background: "#ffffff" };
export const suggestionItemStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #f1f2f3" };
export const bulletStyle: CSSProperties = { width: 8, height: 8, marginTop: 7, borderRadius: 999, background: shopifyUi.primary, flexShrink: 0 };
export const alertListStyle: CSSProperties = { display: "grid", gap: 12 };
export const alertItemStyle = (tone: "warning" | "info" | "critical"): CSSProperties => ({
  padding: 14,
  borderRadius: 12,
  border: `1px solid ${tone === "critical" ? "#e4b7af" : tone === "warning" ? "#dfc78a" : "#b8cbeb"}`,
  background: "#ffffff",
});

export const trendLegendStyle: CSSProperties = { display: "flex", gap: 12, alignItems: "center" };
export const mobileTrendLegendStyle: CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
export const legendItemStyle = (color: string): CSSProperties => ({ fontSize: 12, color, fontWeight: 600 });
export const chartStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
export const chartRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "70px minmax(0, 1fr)", gap: 14, alignItems: "center" };
export const mobileChartRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: 8, alignItems: "stretch" };
export const chartLabelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: "#202223" };
export const barGroupStyle: CSSProperties = { display: "grid", gap: 8 };
export const barTrackStyle: CSSProperties = { height: 10, borderRadius: 999, background: "#f1f2f3", overflow: "hidden" };
export const barFillStyle: CSSProperties = { height: "100%", borderRadius: 999 };

export const chatLayoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, height: "calc(100vh - 100px)" };
export const mobileChatLayoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, minHeight: "calc(100vh - 110px)" };
export const conversationMetaRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexShrink: 0 };
export const mobileConversationMetaRowStyle: CSSProperties = { ...conversationMetaRowStyle, flexDirection: "column", alignItems: "flex-start", marginBottom: 10 };
export const conversationMetaTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#202223" };
export const messageListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  height: "100%",
  overflowY: "auto",
  paddingRight: 6,
  // scrollBehavior intentionally omitted: smooth is applied per-call only for
  // user-initiated jumps (the "查看最新消息" button). During streaming we use
  // instant assignment so rapid frames don't fight each other and miss the bottom.
};
export const composerBoxStyle: CSSProperties = { flexShrink: 0, marginTop: 14, paddingTop: 14, borderTop: "1px solid #ebedf0" };
export const mobileFixedComposerWrapStyle = (keyboardInset: number): CSSProperties => ({
  position: "fixed",
  left: 14,
  right: 14,
  bottom: `calc(env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
  zIndex: 24,
  pointerEvents: "none",
});
export const mobileFixedComposerCardStyle: CSSProperties = {
  pointerEvents: "auto",
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(201, 205, 210, 0.92)",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.14)",
  backdropFilter: "blur(12px)",
};
export const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 96,
  maxHeight: 320,
  borderRadius: 12,
  border: "1px solid #c9cdd2",
  padding: 14,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#202223",
  background: "#ffffff",
  resize: "none",
  overflowY: "auto",
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s",
};
export const mobileTextareaStyle: CSSProperties = {
  ...textareaStyle,
  minHeight: 84,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.55,
};
export const composerFooterStyle: CSSProperties = { marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 };
export const mobileComposerFooterStyle: CSSProperties = { ...composerFooterStyle, flexDirection: "column", alignItems: "stretch" };
export const footerLeftStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
export const sidePanelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
export const keyValueRowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, paddingBottom: 10, borderBottom: "1px solid #f0f1f3" };
export const toolbarDockStyle: CSSProperties = { marginTop: 12, position: "relative" };
export const toolbarBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};
export const mobileToolbarBarStyle: CSSProperties = {
  ...toolbarBarStyle,
  flexDirection: "column",
  alignItems: "stretch",
  gap: 10,
};
export const toolbarIconGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
export const toolbarTriggerWrapStyle: CSSProperties = { position: "relative", display: "inline-flex" };
export const toolbarIconButtonStyle = (active: boolean): CSSProperties => ({
  width: 32,
  height: 32,
  display: "inline-grid",
  placeItems: "center",
  border: `1px solid ${active ? shopifyUi.primary : shopifyUi.border}`,
  background: active ? shopifyUi.primary : shopifyUi.surface,
  color: active ? "#ffffff" : shopifyUi.text,
  borderRadius: shopifyUi.radiusControl,
  padding: 0,
  cursor: "pointer",
});
export const toolbarPillButtonStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 30,
  padding: "0 10px",
  border: `1px solid ${active ? shopifyUi.primary : shopifyUi.border}`,
  background: active ? shopifyUi.primarySurface : shopifyUi.surface,
  color: active ? shopifyUi.primaryText : shopifyUi.text,
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  whiteSpace: "nowrap",
  transition: "background 0.12s, border-color 0.12s",
});
export const toolbarIconGlyphStyle: CSSProperties = { fontSize: 11, lineHeight: 1, flexShrink: 0 };
export const toolbarTooltipStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "calc(100% + 8px)",
  transform: "translateX(-50%)",
  whiteSpace: "nowrap",
  padding: "4px 8px",
  borderRadius: 8,
  background: "#202223",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
  pointerEvents: "none",
  zIndex: 2,
};
export const scrollBottomOverlayStyle: CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 2,
};
export const scrollBottomButtonStyle: CSSProperties = {
  pointerEvents: "all",
  border: "1px solid #c9cdd2",
  borderRadius: 999,
  background: "#ffffff",
  color: "#202223",
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
  whiteSpace: "nowrap",
};
export const toolbarStatusGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" };
export const mobileToolbarStatusGroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  width: "100%",
  marginLeft: 0,
  flexWrap: "wrap",
};
export const toolbarCountStyle: CSSProperties = { fontSize: 12, color: "#6d7175", fontWeight: 600 };
export const toolbarClearStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#8a2e0f",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
};
export const selectionBubbleRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 };
export const selectionBubbleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 999,
  border: `1px solid ${shopifyUi.primary}`,
  background: shopifyUi.primarySurface,
  color: shopifyUi.primaryText,
  fontSize: 12,
  fontWeight: 600,
};
export const selectionBubbleCloseStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 999,
  border: "none",
  background: "#e1e3e5",
  color: "#202223",
  fontSize: 11,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};
export const toolModalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17, 24, 39, 0.16)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 30,
};
export const toolModalCardStyle: CSSProperties = {
  width: "min(720px, calc(100vw - 48px))",
  maxHeight: "min(82vh, 760px)",
  overflowY: "auto",
  padding: 18,
  borderRadius: 16,
  border: "1px solid #e1e3e5",
  background: "#ffffff",
  boxShadow: "0 24px 56px rgba(15, 23, 42, 0.16)",
};
export const mobileToolModalCardStyle: CSSProperties = {
  ...toolModalCardStyle,
  width: "calc(100vw - 24px)",
  maxHeight: "calc(100vh - 96px)",
  padding: 14,
  borderRadius: 14,
};
export const toolModalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 14,
};
export const toolModalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid #e1e3e5",
};
export const toolModalCloseStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  border: "1px solid #dfe3e8",
  borderRadius: 10,
  background: "#f6f6f7",
  color: "#6d7175",
  fontSize: 14,
  fontWeight: 400,
  padding: 0,
  cursor: "pointer",
  flexShrink: 0,
};
export const filterChipRowStyle: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 };
export const mockCreateBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #e9eaeb",
  background: "#fafbfb",
  marginBottom: 14,
};
export const inlineFieldRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center" };
export const compactFieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#202223",
  background: "#ffffff",
};
export const selectFieldStyle: CSSProperties = {
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#202223",
  background: "#ffffff",
  cursor: "pointer",
  appearance: "auto",
};
export const selectorSearchInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #c9cdd2",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "#202223",
  background: "#ffffff",
};
export const selectorListCompactStyle: CSSProperties = { display: "grid", gap: 10, marginTop: 14, maxHeight: 240, overflowY: "auto" };
export const resourcePickerHintStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 12,
};
export const pickerInfoBoxStyle = (tone: "critical" | "neutral"): CSSProperties => ({
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 13,
  lineHeight: 1.5,
  ...(tone === "critical"
    ? { background: "#fff0ee", border: "1px solid #f2b8ae", color: "#8f2f1f" }
    : { background: "#f6f6f7", border: "1px solid #e1e3e5", color: "#6d7175" }),
});
export const resourceItemContentStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };
export const resourceItemTopRowStyle: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 8 };
export const resourceStatusPillStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  flexShrink: 0,
  color: "#475467",
  background: "#f1f2f4",
};
export const resourcePaginationStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 10,
  marginTop: 14,
};
export const selectorItemStyle = (checked: boolean): CSSProperties => ({
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${checked ? "#c9cccf" : "#e1e3e5"}`,
  background: checked ? "#ffffff" : "#f6f6f7",
});
export const selectorItemContentStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

export const skillGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
export const mobileSkillGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: 12 };
export const skillCardStyle: CSSProperties = { padding: 18, borderRadius: 14, border: "1px solid #e1e3e5", background: "#ffffff", display: "flex", flexDirection: "column", gap: 10 };
export const skillCardButtonStyle: CSSProperties = { ...skillCardStyle, width: "100%", textAlign: "left", cursor: "pointer" };
export const skillCardButtonDisabledStyle: CSSProperties = {
  ...skillCardButtonStyle,
  cursor: "not-allowed",
  opacity: 0.72,
  background: "#fafbfb",
};
export const mobileSkillCardButtonStyle: CSSProperties = { ...skillCardButtonStyle, padding: 14, borderRadius: 12 };
export const skillCategoryStyle: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#6d7175" };
export const skillFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 };

export const buttonRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
export const mobileButtonRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: 8, width: "100%" };
export const primaryButtonStyle: CSSProperties = {
  border: `1px solid ${shopifyUi.primary}`,
  borderRadius: shopifyUi.radiusControl,
  background: shopifyUi.primary,
  color: "#ffffff",
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
export const ghostButtonStyle: CSSProperties = {
  border: `1px solid ${shopifyUi.borderStrong}`,
  borderRadius: shopifyUi.radiusControl,
  background: shopifyUi.surface,
  color: shopifyUi.text,
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
export const textButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: shopifyUi.link,
  padding: 0,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
export const disabledTextButtonStyle: CSSProperties = { ...textButtonStyle, color: "#8c9196", cursor: "not-allowed" };

export const tabRowStyle: CSSProperties = { display: "flex", gap: 8, marginBottom: 16 };
export const mobileTabRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 14 };
export const tabButtonStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? shopifyUi.primary : shopifyUi.border}`,
  borderRadius: shopifyUi.radiusControl,
  background: active ? shopifyUi.primarySurface : shopifyUi.pageBg,
  color: active ? shopifyUi.primaryText : shopifyUi.text,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: active ? 700 : 600,
  cursor: "pointer",
});
export const automationCardStyle: CSSProperties = { padding: 16, borderRadius: 12, border: "1px solid #e1e3e5", background: "#ffffff" };
export const mobileAutomationCardStyle: CSSProperties = { ...automationCardStyle, padding: 14 };

export const filterChipStyle = (active: boolean): CSSProperties => ({
  border: `1px solid ${active ? shopifyUi.primary : shopifyUi.borderStrong}`,
  borderRadius: 999,
  background: active ? shopifyUi.primary : shopifyUi.surface,
  color: active ? "#ffffff" : shopifyUi.text,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});
export const statusBadgeStyle = (tone: "positive" | "warning" | "critical" | "neutral"): CSSProperties => ({
  padding: "4px 10px",
  borderRadius: 999,
  background: tone === "positive" ? "#e9f7ef" : tone === "warning" ? "#fff5ea" : tone === "critical" ? "#fff1ef" : "#f1f2f3",
  color: tone === "positive" ? shopifyUi.primary : tone === "warning" ? "#b98900" : tone === "critical" ? "#d72c0d" : shopifyUi.textSecondary,
  fontSize: 12,
  fontWeight: 600,
});

// ── 当前上下文面板 ───────────────────────────────────────────
export const ctxGroupStyle: CSSProperties = {
  marginBottom: 12,
  paddingBottom: 12,
  borderBottom: "1px solid #f0f1f3",
};
export const ctxGroupLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#8c9196",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: 6,
};
export const ctxItemRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 0",
};
export const ctxThumbStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 5,
  objectFit: "cover",
  background: "#eceff3",
  flexShrink: 0,
};
export const ctxThumbPlaceholderStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 5,
  background: "#eceff3",
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "#6d7175",
  flexShrink: 0,
};
export const ctxFileIconStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 5,
  background: "#eef2ff",
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  color: "#4070f4",
  flexShrink: 0,
};
export const ctxItemTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#202223",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: 1,
  minWidth: 0,
};
