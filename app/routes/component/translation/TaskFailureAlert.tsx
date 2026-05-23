import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  failureReasonDisplayCode,
  type TaskFailureInfo,
} from "../../../lib/translateTaskFailure";
import { pageColorTokens } from "../../page/pageUiStyles";

const BOX: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#7f1d1d",
};

type Props = {
  failure: TaskFailureInfo | null;
  compact?: boolean;
};

export function TaskFailureAlert({ failure, compact = false }: Props) {
  const { t } = useTranslation();
  if (!failure || (!failure.reason && !failure.hint)) {
    return null;
  }

  return (
    <div style={BOX} role="alert">
      <div style={{ fontSize: compact ? "12px" : "13px", fontWeight: 700, marginBottom: 6 }}>
        {t("translationRuntime.failureTitle")}: {failure.phaseLabel}
      </div>
      <div style={{ fontSize: compact ? "12px" : "13px", lineHeight: 1.5 }}>
        <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.failureReason")}: </span>
        <strong>{failureReasonDisplayCode(failure.reason)}</strong>
      </div>
      {failure.hint ? (
        <div
          style={{
            marginTop: 8,
            fontSize: compact ? "12px" : "13px",
            lineHeight: 1.5,
            color: "#991b1b",
          }}
        >
          <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.failureHint")}: </span>
          {failure.hint}
        </div>
      ) : null}
      {!compact && failure.detail ? (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: "12px", color: pageColorTokens.brandBlue }}>
            {t("translationRuntime.failureDetailToggle")}
          </summary>
          <pre
            style={{
              marginTop: 8,
              maxHeight: 200,
              overflow: "auto",
              fontSize: 11,
              background: pageColorTokens.surface,
              padding: 10,
              borderRadius: 6,
              border: `1px solid ${pageColorTokens.border}`,
              color: pageColorTokens.textPrimary,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {failure.detail}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
