import { useTranslation } from "react-i18next";
import type { ProductQualityScoreResult } from "../../../hooks/useProductQualityScore";
import { pageColorTokens, pageEmptyStateStyle, formErrorBoxStyle } from "../../page/pageUiStyles";

type Props = {
  result: ProductQualityScoreResult | null;
  isScoring: boolean;
  errorText: string | null;
};

function scoreColor(score: number): string {
  if (score >= 80) return pageColorTokens.brandGreen;
  if (score >= 60) return "#d97706";
  return pageColorTokens.critical;
}

function scoreBg(score: number): string {
  if (score >= 80) return pageColorTokens.brandGreenLight;
  if (score >= 60) return "#fffbeb";
  return pageColorTokens.criticalBg;
}

function DimensionRow({ label, score, suggestion }: { label: string; score: number; suggestion: string }) {
  const color = scoreColor(score * 10);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        padding: "0.6rem 0",
        borderBottom: `1px solid ${pageColorTokens.divider}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            flex: "1 1 auto",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: pageColorTokens.textBody,
          }}
        >
          {label}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontSize: "0.8125rem",
            fontWeight: 700,
            color,
            minWidth: "2.5rem",
            textAlign: "right",
          }}
        >
          {score}/10
        </span>
      </div>
      <div
        style={{
          height: "4px",
          borderRadius: "2px",
          background: pageColorTokens.divider,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score * 10}%`,
            background: color,
            borderRadius: "2px",
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {suggestion ? (
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            color: pageColorTokens.textSecondary,
            lineHeight: 1.45,
          }}
        >
          {suggestion}
        </p>
      ) : null}
    </div>
  );
}

export function ProductQualityScoreResult({ result, isScoring, errorText }: Props) {
  const { t } = useTranslation();

  if (isScoring) {
    return (
      <div style={pageEmptyStateStyle}>
        <span style={{ fontSize: "1.5rem", opacity: 0.5 }} aria-hidden>⏳</span>
        <span>{t("qualityScore.scoring")}</span>
      </div>
    );
  }

  if (errorText) {
    return <div style={formErrorBoxStyle}>{errorText}</div>;
  }

  if (!result) {
    return (
      <div style={pageEmptyStateStyle}>
        <span style={{ fontSize: "1.75rem", opacity: 0.6 }} aria-hidden>📋</span>
        <span>{t("qualityScore.emptyResult")}</span>
      </div>
    );
  }

  const { score, dimensions, overallSuggestions } = result;
  const color = scoreColor(score);
  const bg = scoreBg(score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Overall score badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.85rem 1rem",
          borderRadius: pageColorTokens.radiusControl,
          background: bg,
          border: `1px solid ${color}40`,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "50%",
            background: `${color}18`,
            border: `2px solid ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.25rem",
            fontWeight: 700,
            color,
          }}
        >
          {score}
        </div>
        <div>
          <div
            style={{ fontSize: "0.875rem", fontWeight: 700, color: pageColorTokens.textPrimary }}
          >
            {t("qualityScore.overallScore")}
          </div>
          <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: "0.1rem" }}>
            {score >= 80
              ? t("qualityScore.levelGood")
              : score >= 60
                ? t("qualityScore.levelFair")
                : t("qualityScore.levelPoor")}
          </div>
        </div>
      </div>

      {/* Dimension breakdown */}
      <div>
        <DimensionRow
          label={t("qualityScore.dimTitle")}
          score={dimensions.title.score}
          suggestion={dimensions.title.suggestion}
        />
        <DimensionRow
          label={t("qualityScore.dimImages")}
          score={dimensions.images.score}
          suggestion={dimensions.images.suggestion}
        />
        <DimensionRow
          label={t("qualityScore.dimDescription")}
          score={dimensions.description.score}
          suggestion={dimensions.description.suggestion}
        />
        <DimensionRow
          label={t("qualityScore.dimVariants")}
          score={dimensions.variants.score}
          suggestion={dimensions.variants.suggestion}
        />
        <DimensionRow
          label={t("qualityScore.dimTags")}
          score={dimensions.tags.score}
          suggestion={dimensions.tags.suggestion}
        />
      </div>

      {/* Overall suggestions */}
      {overallSuggestions.length > 0 ? (
        <div>
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: pageColorTokens.textBody,
              marginBottom: "0.5rem",
            }}
          >
            {t("qualityScore.suggestions")}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            {overallSuggestions.map((s, i) => (
              <li
                key={i}
                style={{
                  fontSize: "0.8125rem",
                  color: pageColorTokens.textBody,
                  lineHeight: 1.5,
                }}
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
