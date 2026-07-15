import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AdsInsightsDeepRow, AdsInsightsView } from "./types";
import {
  EMPTY_METRIC,
  collectOptionalMetricFlags,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
  type OptionalMetricKey,
} from "./metricsFormat";

type Props = {
  view: Exclude<AdsInsightsView, "structure">;
  rows: AdsInsightsDeepRow[];
  currencyCode: string | null;
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: CSSProperties = {
  padding: "8px 10px",
  textAlign: "right",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceMuted,
  borderBottom: `1px solid ${pageColorTokens.border}`,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 10px",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const tdNum: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

function emptyKey(view: Props["view"]): string {
  if (view === "keywords") return "adsInsights.emptyKeywords";
  if (view === "searchTerms") return "adsInsights.emptySearchTerms";
  return "adsInsights.emptyCreatives";
}

function buildHeaders(
  t: (key: string) => string,
  optional: Record<OptionalMetricKey, boolean>,
): string[] {
  return [
    t("adsInsights.colName"),
    t("adsInsights.colParent"),
    t("adsInsights.colStatus"),
    t("adsInsights.colImpressions"),
    t("adsInsights.colClicks"),
    t("adsInsights.colSpend"),
    t("adsInsights.colCtr"),
    t("adsInsights.colCpc"),
    ...(optional.cpm ? [t("adsInsights.colCpm")] : []),
    t("adsInsights.colConversions"),
    t("adsInsights.colConvValue"),
    t("adsInsights.colRoas"),
    ...(optional.allConversions ? [t("adsInsights.colAllConversions")] : []),
    ...(optional.videoViews ? [t("adsInsights.colVideoViews")] : []),
    ...(optional.thruplay ? [t("adsInsights.colThruplay")] : []),
  ];
}

function EmptyMetricCells({ optional }: { optional: Record<OptionalMetricKey, boolean> }) {
  const cells: ReactNode[] = [
    EMPTY_METRIC,
    EMPTY_METRIC,
    EMPTY_METRIC,
    EMPTY_METRIC,
    EMPTY_METRIC,
  ];
  if (optional.cpm) cells.push(EMPTY_METRIC);
  cells.push(EMPTY_METRIC, EMPTY_METRIC, EMPTY_METRIC);
  if (optional.allConversions) cells.push(EMPTY_METRIC);
  if (optional.videoViews) cells.push(EMPTY_METRIC);
  if (optional.thruplay) cells.push(EMPTY_METRIC);
  return (
    <>
      {cells.map((value, idx) => (
        <td key={idx} style={tdNum}>
          {value}
        </td>
      ))}
    </>
  );
}

export function AdsInsightsDeepTable({ view, rows, currencyCode }: Props) {
  const { t } = useTranslation();
  const optional = useMemo(
    () => collectOptionalMetricFlags(rows.map((r) => r.metrics)),
    [rows],
  );
  const headers = useMemo(() => buildHeaders(t, optional), [t, optional]);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {headers.map((label, idx) => (
              <th
                key={`${label}-${idx}`}
                style={{
                  ...thStyle,
                  textAlign: idx <= 2 ? "left" : "right",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                style={{
                  ...tdStyle,
                  color: pageColorTokens.textSecondary,
                  fontWeight: 500,
                  maxWidth: 260,
                }}
              >
                {t(emptyKey(view))}
              </td>
              <td style={{ ...tdStyle, color: pageColorTokens.textSecondary }}>{EMPTY_METRIC}</td>
              <td style={{ ...tdStyle, color: pageColorTokens.textSecondary }}>{EMPTY_METRIC}</td>
              <EmptyMetricCells optional={optional} />
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={row.id}
                style={{
                  background:
                    idx % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceEvenRow,
                }}
              >
                <td style={{ ...tdStyle, maxWidth: 260 }}>
                  <div style={{ fontWeight: 600 }}>{row.name}</div>
                  {row.detail ? (
                    <div style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>
                      {row.detail}
                    </div>
                  ) : null}
                </td>
                <td style={{ ...tdStyle, maxWidth: 220 }}>
                  <div style={{ fontSize: 12 }}>
                    {[row.campaignName, row.adSetName, row.adName].filter(Boolean).join(" / ") ||
                      EMPTY_METRIC}
                  </div>
                </td>
                <td style={tdStyle}>{row.status}</td>
                <MetricCells metrics={row.metrics} currencyCode={currencyCode} optional={optional} />
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricCells({
  metrics,
  currencyCode,
  optional,
}: {
  metrics: AdsInsightsDeepRow["metrics"];
  currencyCode: string | null;
  optional: Record<OptionalMetricKey, boolean>;
}) {
  return (
    <>
      <td style={tdNum}>{formatNumber(metrics.impressions)}</td>
      <td style={tdNum}>{formatNumber(metrics.clicks)}</td>
      <td style={tdNum}>{formatCurrency(metrics.spend, currencyCode)}</td>
      <td style={tdNum}>{formatPercent(metrics.ctr)}</td>
      <td style={tdNum}>{formatCurrency(metrics.cpc, currencyCode)}</td>
      {optional.cpm && (
        <td style={tdNum}>
          {metrics.cpm === null ? EMPTY_METRIC : formatCurrency(metrics.cpm, currencyCode)}
        </td>
      )}
      <td style={tdNum}>{formatNumber(metrics.conversions, 2)}</td>
      <td style={tdNum}>{formatCurrency(metrics.conversionsValue, currencyCode)}</td>
      <td style={tdNum}>{formatRoas(metrics.roas)}</td>
      {optional.allConversions && (
        <td style={tdNum}>{formatNumber(metrics.allConversions, 2)}</td>
      )}
      {optional.videoViews && <td style={tdNum}>{formatNumber(metrics.videoViews, 2)}</td>}
      {optional.thruplay && <td style={tdNum}>{formatNumber(metrics.thruplay, 2)}</td>}
    </>
  );
}
