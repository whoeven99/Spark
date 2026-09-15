import type { CSSProperties } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";

export const CATALOG_REVIEW_VISIBLE_ROWS = 100;

export const catalogReviewCellStyle: CSSProperties = {
  padding: "7px 10px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  verticalAlign: "top",
  maxWidth: 240,
};

export const catalogReviewHeadCellStyle: CSSProperties = {
  ...catalogReviewCellStyle,
  position: "sticky",
  top: 0,
  background: pageColorTokens.surfaceSubtle,
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  whiteSpace: "nowrap",
  zIndex: 1,
};

export const catalogReviewNoticeStyle: CSSProperties = {
  fontSize: 12,
  borderRadius: 8,
  padding: "8px 10px",
};

export function downloadCatalogCsv(filename: string, content: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function progressPercentForCatalogTask(status: string): number {
  switch (status) {
    case "running":
      return 45;
    case "pending_review":
    case "applied":
    case "succeeded":
    case "scored":
      return 100;
    case "failed":
      return 56;
    case "cancelled":
      return 24;
    default:
      return 0;
  }
}
