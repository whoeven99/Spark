/**
 * 空态「连接后你会看到什么」：竖排通栏示意。
 * 刻意做得矮、虚线框、弱对比，避免商户当成真实仪表盘。
 */
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { AdsSpendTrendChart, type AdsTrendPoint } from "./AdsSpendTrendChart";

const SAMPLE_SERIES: AdsTrendPoint[] = [
  { date: "2026-03-06", spend: 612, conversionsValue: 1840 },
  { date: "2026-03-07", spend: 588, conversionsValue: 1712 },
  { date: "2026-03-08", spend: 704, conversionsValue: 2460 },
  { date: "2026-03-09", spend: 651, conversionsValue: 2105 },
  { date: "2026-03-10", spend: 733, conversionsValue: 2688 },
  { date: "2026-03-11", spend: 769, conversionsValue: 2810 },
  { date: "2026-03-12", spend: 763, conversionsValue: 2775 },
];

const SAMPLE_DATE_START = "2026-03-06";
const SAMPLE_DATE_END = "2026-03-12";

/** 示意底板：实心弱底，不用斜纹（嵌入页里斜纹容易晃眼）。 */
const sampleSurface: CSSProperties = {
  backgroundColor: "#f3f5f4",
};

const panelStyle: CSSProperties = {
  ...sampleSurface,
  border: `1px dashed ${pageColorTokens.borderInput}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: 12,
  width: "100%",
  opacity: 0.95,
  pointerEvents: "none",
};

const headerCell: CSSProperties = {
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: pageColorTokens.textFootnote,
  textAlign: "right",
};

const bodyCell: CSSProperties = {
  padding: "10px",
  fontSize: 13,
  color: pageColorTokens.textSecondary,
  textAlign: "right",
  borderTop: `1px solid ${pageColorTokens.divider}`,
};

export function AdsEmptyPreview() {
  const { t } = useTranslation();

  const structureRows = [
    {
      name: t("adsHub.overview.previewSample.campaignA"),
      spend: "$1,240",
      roas: "3.8x",
      value: "$4,712",
    },
    {
      name: t("adsHub.overview.previewSample.adSetB"),
      spend: "$880",
      roas: "2.9x",
      value: "$2,552",
    },
    {
      name: t("adsHub.overview.previewSample.adC"),
      spend: "$420",
      roas: "2.1x",
      value: "$882",
    },
  ];

  const sections = [
    {
      key: "overview",
      title: t("adsHub.overview.previewSection.overviewTitle"),
      body: (
        <AdsSpendTrendChart
          series={SAMPLE_SERIES}
          dateStart={SAMPLE_DATE_START}
          dateEnd={SAMPLE_DATE_END}
          currencyCode="USD"
          showTitle={false}
          framed={false}
          compact
        />
      ),
    },
    {
      key: "performance",
      title: t("adsHub.overview.previewSection.performanceTitle"),
      body: (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...headerCell, textAlign: "left" }}>
                {t("adsHub.overview.previewSample.colObject")}
              </th>
              <th style={headerCell}>{t("adsHub.overview.spend")}</th>
              <th style={headerCell}>{t("adsHub.overview.roas")}</th>
              <th style={headerCell}>{t("adsHub.overview.conversionValue")}</th>
            </tr>
          </thead>
          <tbody>
            {structureRows.map((row) => (
              <tr key={row.name}>
                <td style={{ ...bodyCell, textAlign: "left", fontWeight: 600 }}>{row.name}</td>
                <td style={bodyCell}>{row.spend}</td>
                <td style={bodyCell}>{row.roas}</td>
                <td style={bodyCell}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    },
    {
      key: "attribution",
      title: t("adsHub.overview.previewSection.attributionTitle"),
      body: (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <SampleMetric
            label={t("adsHub.overview.previewSample.attributedSessions")}
            value="1,284"
          />
          <SampleMetric
            label={t("adsHub.overview.previewSample.attributedRevenue")}
            value="$16.4k"
          />
          <SampleMetric label={t("adsHub.overview.roas")} value="3.4x" />
        </div>
      ),
    },
  ];

  return (
    <div
      style={{
        border: `1px dashed ${pageColorTokens.borderInput}`,
        borderRadius: pageColorTokens.radiusCard,
        ...sampleSurface,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px dashed ${pageColorTokens.border}`,
          background: pageColorTokens.brandGreenLight,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 12px",
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.3,
            color: pageColorTokens.brandGreenDeep,
          }}
        >
          {t("adsHub.overview.previewTitle")}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: pageColorTokens.brandGreenDeep,
            padding: "3px 10px",
            borderRadius: 999,
            background: pageColorTokens.surface,
            border: `1px solid ${pageColorTokens.brandGreen}`,
          }}
        >
          {t("adsHub.overview.previewSampleBadge")}
        </div>
      </div>

      {sections.map((section, index) => (
        <div
          key={section.key}
          style={{
            padding: "12px 16px",
            borderTop: index === 0 ? "none" : `1px dashed ${pageColorTokens.divider}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
            {section.title}
          </div>
          <div style={panelStyle}>{section.body}</div>
        </div>
      ))}
    </div>
  );
}

function SampleMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: `1px dashed ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusControl,
        background: pageColorTokens.surface,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>{label}</div>
      <div
        style={{
          marginTop: 4,
          fontSize: 18,
          fontWeight: 600,
          color: pageColorTokens.textSecondary,
        }}
      >
        {value}
      </div>
    </div>
  );
}
