import type { CSSProperties } from "react";
import type { PageSpeedScoreBand } from "../../../lib/pageSpeedTypes";
import { pageColorTokens } from "../../page/pageUiStyles";

export function bandColor(band: PageSpeedScoreBand | null): string {
  if (band === "good") return pageColorTokens.brandGreen;
  if (band === "needs-improvement") return pageColorTokens.progress;
  if (band === "poor") return pageColorTokens.critical;
  return pageColorTokens.textSecondary;
}

export const pageSpeedCardStyle: CSSProperties = {
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  boxShadow: pageColorTokens.shadowCard,
  padding: "1.25rem",
};

export const pageSpeedMutedTextStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.45,
};
