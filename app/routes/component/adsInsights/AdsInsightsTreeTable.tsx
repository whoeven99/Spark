import type { CSSProperties } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AdsInsightsCampaign, AdsInsightsMetrics } from "./types";

type Props = {
  campaigns: AdsInsightsCampaign[];
  currencyCode: string | null;
};

function formatCurrency(amount: number, currencyCode: string | null): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // fall through
    }
  }
  return amount.toFixed(2);
}

function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "—";
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatRoas(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${n.toFixed(2)}x`;
}

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

function MetricsCells({
  metrics,
  currencyCode,
}: {
  metrics: AdsInsightsMetrics;
  currencyCode: string | null;
}) {
  return (
    <>
      <td style={tdNum}>{formatNumber(metrics.impressions)}</td>
      <td style={tdNum}>{formatNumber(metrics.clicks)}</td>
      <td style={tdNum}>{formatCurrency(metrics.spend, currencyCode)}</td>
      <td style={tdNum}>{formatPercent(metrics.ctr)}</td>
      <td style={tdNum}>{formatCurrency(metrics.cpc, currencyCode)}</td>
      <td style={tdNum}>{formatNumber(metrics.conversions, 2)}</td>
      <td style={tdNum}>{formatCurrency(metrics.conversionsValue, currencyCode)}</td>
      <td style={tdNum}>{formatPercent(metrics.conversionRate)}</td>
      <td style={tdNum}>{formatRoas(metrics.roas)}</td>
      <td style={tdNum}>{formatNumber(metrics.purchases, 2)}</td>
      <td style={tdNum}>
        {metrics.purchaseValue === null
          ? "—"
          : formatCurrency(metrics.purchaseValue, currencyCode)}
      </td>
      <td style={tdNum}>{formatNumber(metrics.addToCart, 2)}</td>
      <td style={tdNum}>{formatNumber(metrics.landingPageViews, 2)}</td>
      <td style={tdNum}>{formatNumber(metrics.reach)}</td>
      <td style={tdNum}>{formatNumber(metrics.frequency, 2)}</td>
    </>
  );
}

export function AdsInsightsTreeTable({ campaigns, currencyCode }: Props) {
  const { t } = useTranslation();
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());

  function toggleCampaign(id: string) {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAdSet(id: string) {
    setExpandedAdSets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (campaigns.length === 0) {
    return (
      <div
        style={{
          padding: "24px 16px",
          textAlign: "center",
          color: pageColorTokens.textSecondary,
          fontSize: 13,
        }}
      >
        {t("adsInsights.emptyCampaigns")}
      </div>
    );
  }

  const headers = [
    t("adsInsights.colName"),
    t("adsInsights.colImpressions"),
    t("adsInsights.colClicks"),
    t("adsInsights.colSpend"),
    t("adsInsights.colCtr"),
    t("adsInsights.colCpc"),
    t("adsInsights.colConversions"),
    t("adsInsights.colConvValue"),
    t("adsInsights.colCvr"),
    t("adsInsights.colRoas"),
    t("adsInsights.colPurchases"),
    t("adsInsights.colPurchaseValue"),
    t("adsInsights.colAddToCart"),
    t("adsInsights.colLandingPageViews"),
    t("adsInsights.colReach"),
    t("adsInsights.colFrequency"),
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {headers.map((label, idx) => (
              <th
                key={label}
                style={{
                  ...thStyle,
                  textAlign: idx === 0 ? "left" : "right",
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
          {campaigns.map((campaign, cIdx) => {
            const campaignOpen = expandedCampaigns.has(campaign.id);
            return (
              <CampaignRows
                key={campaign.id}
                campaign={campaign}
                campaignOpen={campaignOpen}
                cIdx={cIdx}
                currencyCode={currencyCode}
                expandedAdSets={expandedAdSets}
                onToggleCampaign={() => toggleCampaign(campaign.id)}
                onToggleAdSet={toggleAdSet}
                t={t}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CampaignRows({
  campaign,
  campaignOpen,
  cIdx,
  currencyCode,
  expandedAdSets,
  onToggleCampaign,
  onToggleAdSet,
  t,
}: {
  campaign: AdsInsightsCampaign;
  campaignOpen: boolean;
  cIdx: number;
  currencyCode: string | null;
  expandedAdSets: Set<string>;
  onToggleCampaign: () => void;
  onToggleAdSet: (id: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const bg = cIdx % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceEvenRow;
  const rows = [
    <tr key={`c-${campaign.id}`} style={{ background: bg }}>
      <td style={{ ...tdStyle, fontWeight: 700, maxWidth: 280 }}>
        <button
          type="button"
          onClick={onToggleCampaign}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            font: "inherit",
            fontWeight: 700,
            color: pageColorTokens.textPrimary,
            textAlign: "left",
          }}
        >
          {campaignOpen ? "▼" : "▶"} {campaign.name}
        </button>
        <div style={{ fontSize: 11, color: pageColorTokens.textFootnote, marginLeft: 16 }}>
          {t("adsInsights.levelCampaign")} · {campaign.status} · ID {campaign.id}
        </div>
      </td>
      <MetricsCells metrics={campaign.metrics} currencyCode={currencyCode} />
    </tr>,
  ];

  if (campaignOpen) {
    for (const adSet of campaign.adSets) {
      const adSetKey = `${campaign.id}:${adSet.id}`;
      const adSetOpen = expandedAdSets.has(adSetKey);
      rows.push(
        <tr key={`s-${adSetKey}`} style={{ background: pageColorTokens.surfaceMuted }}>
          <td style={{ ...tdStyle, paddingLeft: 28, maxWidth: 280 }}>
            <button
              type="button"
              onClick={() => onToggleAdSet(adSetKey)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                font: "inherit",
                fontWeight: 600,
                color: pageColorTokens.textPrimary,
                textAlign: "left",
              }}
            >
              {adSetOpen ? "▼" : "▶"} {adSet.name}
            </button>
            <div style={{ fontSize: 11, color: pageColorTokens.textFootnote, marginLeft: 16 }}>
              {t("adsInsights.levelAdSet")} · {adSet.status} · ID {adSet.id}
            </div>
          </td>
          <MetricsCells metrics={adSet.metrics} currencyCode={currencyCode} />
        </tr>,
      );

      if (adSetOpen) {
        for (const ad of adSet.ads) {
          rows.push(
            <tr key={`a-${adSetKey}-${ad.id}`} style={{ background: pageColorTokens.surface }}>
              <td style={{ ...tdStyle, paddingLeft: 48, maxWidth: 280 }}>
                <div style={{ fontWeight: 500 }}>{ad.name}</div>
                <div style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>
                  {t("adsInsights.levelAd")} · {ad.status} · ID {ad.id}
                </div>
              </td>
              <MetricsCells metrics={ad.metrics} currencyCode={currencyCode} />
            </tr>,
          );
        }
      }
    }
  }

  return <>{rows}</>;
}
