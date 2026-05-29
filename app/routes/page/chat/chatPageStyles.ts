import type { CSSProperties } from "react";
import { pageColorTokens } from "../pageUiStyles";

export const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "1rem",
};

export const modalCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "560px",
  backgroundColor: pageColorTokens.surface,
  borderRadius: pageColorTokens.radiusCard,
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.2)",
};

/** 聊天页侧栏等非消息流区块，对齐全站 pageColorTokens */
export const asideCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  backgroundColor: pageColorTokens.surfaceSubtle,
  padding: "0.75rem",
};

export const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
