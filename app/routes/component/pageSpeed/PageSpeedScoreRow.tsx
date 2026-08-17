import { useTranslation } from "react-i18next";
import type { PageSpeedCategoryScore } from "../../../lib/pageSpeedTypes";
import { pageColorTokens } from "../../page/pageUiStyles";
import { PageSpeedScoreGauge } from "./PageSpeedScoreGauge";
import { pageSpeedCardStyle, pageSpeedMutedTextStyle } from "./pageSpeedUi";

export function PageSpeedScoreRow({
  categories,
  analyzedAt,
  reportLocaleLabel,
  isMobile,
}: {
  categories: PageSpeedCategoryScore[];
  analyzedAt: string | null;
  reportLocaleLabel: string;
  isMobile: boolean;
}) {
  const { t, i18n } = useTranslation();
  const timeLabel = analyzedAt
    ? new Date(analyzedAt).toLocaleString(i18n.language)
    : null;

  return (
    <div style={pageSpeedCardStyle}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: "1rem",
        }}
      >
        {categories.map((category) => (
          <PageSpeedScoreGauge
            key={category.id}
            label={category.title}
            score={category.score}
            band={category.band}
          />
        ))}
      </div>
      <p style={{ ...pageSpeedMutedTextStyle, margin: "0.9rem 0 0" }}>
        {t("pageSpeed.reportLocaleUsed", { language: reportLocaleLabel })}
        {timeLabel ? ` · ${t("pageSpeed.analyzedAt", { value: timeLabel })}` : ""}
      </p>
      <p style={{ ...pageSpeedMutedTextStyle, margin: "0.35rem 0 0" }}>{t("pageSpeed.scoreLegend")}</p>
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.45rem", flexWrap: "wrap" }}>
        <LegendSwatch color={pageColorTokens.critical} label={t("pageSpeed.bandPoor")} />
        <LegendSwatch color={pageColorTokens.progress} label={t("pageSpeed.bandNeedsWork")} />
        <LegendSwatch color={pageColorTokens.brandGreen} label={t("pageSpeed.bandGood")} />
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ ...pageSpeedMutedTextStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}
