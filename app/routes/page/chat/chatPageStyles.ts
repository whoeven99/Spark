import type { CSSProperties } from "react";

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
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.2)",
};

export const asideCardStyle: CSSProperties = {
  border: "1px solid #e3e3e3",
  borderRadius: "12px",
  backgroundColor: "#fafafa",
  padding: "0.75rem",
};

export const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
