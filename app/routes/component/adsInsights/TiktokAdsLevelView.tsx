import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AdsInsightsCampaign, AdsInsightsMetrics } from "./types";
import {
  collectOptionalMetricFlags,
  EMPTY_METRIC,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRoas,
  type OptionalMetricKey,
} from "./metricsFormat";
import { SegmentedPageTabs } from "../shared/SegmentedPageTabs";

type TiktokLevel = "campaign" | "adgroup" | "ad";

type FlatCampaignRow = {
  id: string;
  name: string;
  status: string;
  adGroupCount: number;
  adCount: number;
  metrics: AdsInsightsMetrics;
};

type FlatAdGroupRow = {
  id: string;
  name: string;
  status: string;
  campaignId: string;
  campaignName: string;
  adCount: number;
  metrics: AdsInsightsMetrics;
};

type FlatAdRow = {
  id: string;
  name: string;
  status: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  metrics: AdsInsightsMetrics;
};

const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
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
const tdNum: CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function MetricsCells({
  metrics,
  currencyCode,
  optional,
}: {
  metrics: AdsInsightsMetrics;
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
      <td style={tdNum}>{formatPercent(metrics.conversionRate)}</td>
      <td style={tdNum}>{formatRoas(metrics.roas)}</td>
      <td style={tdNum}>{formatNumber(metrics.purchases, 2)}</td>
      <td style={tdNum}>
        {metrics.purchaseValue === null
          ? EMPTY_METRIC
          : formatCurrency(metrics.purchaseValue, currencyCode)}
      </td>
      <td style={tdNum}>{formatNumber(metrics.addToCart, 2)}</td>
      <td style={tdNum}>{formatNumber(metrics.landingPageViews, 2)}</td>
      <td style={tdNum}>{formatNumber(metrics.reach)}</td>
      <td style={tdNum}>{formatNumber(metrics.frequency, 2)}</td>
      {optional.outboundClicks && (
        <td style={tdNum}>{formatNumber(metrics.outboundClicks, 2)}</td>
      )}
      {optional.videoViews && <td style={tdNum}>{formatNumber(metrics.videoViews, 2)}</td>}
      {optional.thruplay && <td style={tdNum}>{formatNumber(metrics.thruplay, 2)}</td>}
      {optional.leads && <td style={tdNum}>{formatNumber(metrics.leads, 2)}</td>}
      {optional.viewContent && <td style={tdNum}>{formatNumber(metrics.viewContent, 2)}</td>}
      {optional.initiateCheckout && (
        <td style={tdNum}>{formatNumber(metrics.initiateCheckout, 2)}</td>
      )}
      {optional.allConversions && (
        <td style={tdNum}>{formatNumber(metrics.allConversions, 2)}</td>
      )}
    </>
  );
}

function buildMetricHeaders(
  t: (key: string) => string,
  optional: Record<OptionalMetricKey, boolean>,
): string[] {
  return [
    t("adsInsights.colImpressions"),
    t("adsInsights.colClicks"),
    t("adsInsights.colSpend"),
    t("adsInsights.colCtr"),
    t("adsInsights.colCpc"),
    ...(optional.cpm ? [t("adsInsights.colCpm")] : []),
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
    ...(optional.outboundClicks ? [t("adsInsights.colOutboundClicks")] : []),
    ...(optional.videoViews ? [t("adsInsights.colVideoViews")] : []),
    ...(optional.thruplay ? [t("adsInsights.colThruplay")] : []),
    ...(optional.leads ? [t("adsInsights.colLeads")] : []),
    ...(optional.viewContent ? [t("adsInsights.colViewContent")] : []),
    ...(optional.initiateCheckout ? [t("adsInsights.colInitiateCheckout")] : []),
    ...(optional.allConversions ? [t("adsInsights.colAllConversions")] : []),
  ];
}

function FlatTable({
  nameHeaders,
  metricHeaders,
  emptyMessage,
  children,
}: {
  nameHeaders: string[];
  metricHeaders: string[];
  emptyMessage: string;
  children: ReactNode;
}) {
  const allHeaders = [...nameHeaders, ...metricHeaders];
  const hasRows = Boolean(children);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {allHeaders.map((label, idx) => (
              <th
                key={`${label}-${idx}`}
                style={{
                  ...thStyle,
                  textAlign: idx < nameHeaders.length ? "left" : "right",
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
          {hasRows ? (
            children
          ) : (
            <tr>
              <td
                colSpan={allHeaders.length}
                style={{ ...tdStyle, color: pageColorTokens.textSecondary }}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NameCell({
  name,
  id,
  status,
  levelLabel,
  indent = 0,
}: {
  name: string;
  id: string;
  status: string;
  levelLabel: string;
  indent?: number;
}) {
  return (
    <td style={{ ...tdStyle, paddingLeft: 10 + indent, maxWidth: 300 }}>
      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>
        {levelLabel} · {status} · ID {id}
      </div>
    </td>
  );
}

function SubInfoCell({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <td style={{ ...tdStyle, maxWidth: 200 }}>
      <div style={{ fontWeight: 500, fontSize: 12 }}>{primary}</div>
      {secondary && (
        <div style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>{secondary}</div>
      )}
    </td>
  );
}

function CampaignFlatTable({
  rows,
  currencyCode,
  optional,
  t,
}: {
  rows: FlatCampaignRow[];
  currencyCode: string | null;
  optional: Record<OptionalMetricKey, boolean>;
  t: (key: string) => string;
}) {
  const nameHeaders = [t("adsInsights.colName"), t("adsInsights.colAdGroupsCount")];
  const metricHeaders = buildMetricHeaders(t, optional);
  return (
    <FlatTable
      nameHeaders={nameHeaders}
      metricHeaders={metricHeaders}
      emptyMessage={t("adsInsights.emptyCampaigns")}
    >
      {rows.length > 0
        ? rows.map((row, idx) => (
            <tr
              key={row.id}
              style={{ background: idx % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceEvenRow }}
            >
              <NameCell
                name={row.name}
                id={row.id}
                status={row.status}
                levelLabel={t("adsInsights.levelCampaign")}
              />
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                <div>{row.adGroupCount}</div>
                <div style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>
                  {row.adCount} {t("adsInsights.levelAd")}
                </div>
              </td>
              <MetricsCells metrics={row.metrics} currencyCode={currencyCode} optional={optional} />
            </tr>
          ))
        : null}
    </FlatTable>
  );
}

function AdGroupFlatTable({
  rows,
  currencyCode,
  optional,
  t,
}: {
  rows: FlatAdGroupRow[];
  currencyCode: string | null;
  optional: Record<OptionalMetricKey, boolean>;
  t: (key: string) => string;
}) {
  const nameHeaders = [t("adsInsights.colName"), t("adsInsights.colCampaign")];
  const metricHeaders = buildMetricHeaders(t, optional);
  return (
    <FlatTable
      nameHeaders={nameHeaders}
      metricHeaders={metricHeaders}
      emptyMessage={t("adsInsights.emptyAdGroups")}
    >
      {rows.length > 0
        ? rows.map((row, idx) => (
            <tr
              key={row.id}
              style={{ background: idx % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceEvenRow }}
            >
              <NameCell
                name={row.name}
                id={row.id}
                status={row.status}
                levelLabel={t("adsInsights.levelAdSet")}
              />
              <SubInfoCell
                primary={row.campaignName}
                secondary={`ID ${row.campaignId}`}
              />
              <MetricsCells metrics={row.metrics} currencyCode={currencyCode} optional={optional} />
            </tr>
          ))
        : null}
    </FlatTable>
  );
}

function AdFlatTable({
  rows,
  currencyCode,
  optional,
  t,
}: {
  rows: FlatAdRow[];
  currencyCode: string | null;
  optional: Record<OptionalMetricKey, boolean>;
  t: (key: string) => string;
}) {
  const nameHeaders = [
    t("adsInsights.colName"),
    t("adsInsights.colAdGroup"),
    t("adsInsights.colCampaign"),
  ];
  const metricHeaders = buildMetricHeaders(t, optional);
  return (
    <FlatTable
      nameHeaders={nameHeaders}
      metricHeaders={metricHeaders}
      emptyMessage={t("adsInsights.emptyAds")}
    >
      {rows.length > 0
        ? rows.map((row, idx) => (
            <tr
              key={row.id}
              style={{ background: idx % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceEvenRow }}
            >
              <NameCell
                name={row.name}
                id={row.id}
                status={row.status}
                levelLabel={t("adsInsights.levelAd")}
              />
              <SubInfoCell
                primary={row.adGroupName}
                secondary={`ID ${row.adGroupId}`}
              />
              <SubInfoCell
                primary={row.campaignName}
                secondary={`ID ${row.campaignId}`}
              />
              <MetricsCells metrics={row.metrics} currencyCode={currencyCode} optional={optional} />
            </tr>
          ))
        : null}
    </FlatTable>
  );
}

type Props = {
  campaigns: AdsInsightsCampaign[];
  currencyCode: string | null;
};

export function TiktokAdsLevelView({ campaigns, currencyCode }: Props) {
  const { t } = useTranslation();
  const [level, setLevel] = useState<TiktokLevel>("campaign");

  const levelTabs = [
    { key: "campaign" as const, label: t("adsInsights.levelCampaign") },
    { key: "adgroup" as const, label: t("adsInsights.levelAdSet") },
    { key: "ad" as const, label: t("adsInsights.levelAd") },
  ] as const;

  const flatCampaigns = useMemo(
    (): FlatCampaignRow[] =>
      campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        adGroupCount: c.adSets.length,
        adCount: c.adSets.reduce((sum, s) => sum + s.ads.length, 0),
        metrics: c.metrics,
      })),
    [campaigns],
  );

  const flatAdGroups = useMemo(
    (): FlatAdGroupRow[] =>
      campaigns.flatMap((c) =>
        c.adSets.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          campaignId: c.id,
          campaignName: c.name,
          adCount: s.ads.length,
          metrics: s.metrics,
        })),
      ),
    [campaigns],
  );

  const flatAds = useMemo(
    (): FlatAdRow[] =>
      campaigns.flatMap((c) =>
        c.adSets.flatMap((s) =>
          s.ads.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            adGroupId: s.id,
            adGroupName: s.name,
            campaignId: c.id,
            campaignName: c.name,
            metrics: a.metrics,
          })),
        ),
      ),
    [campaigns],
  );

  const activeMetrics = useMemo(() => {
    if (level === "campaign") return flatCampaigns.map((r) => r.metrics);
    if (level === "adgroup") return flatAdGroups.map((r) => r.metrics);
    return flatAds.map((r) => r.metrics);
  }, [level, flatCampaigns, flatAdGroups, flatAds]);

  const optional = useMemo(() => collectOptionalMetricFlags(activeMetrics), [activeMetrics]);

  return (
    <>
      <div
        style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${pageColorTokens.border}`,
        }}
      >
        <SegmentedPageTabs
          activeTab={level}
          items={levelTabs}
          onTabChange={setLevel}
          ariaLabel={t("adsInsights.tiktokLevelTabsAria")}
          density="compact"
        />
      </div>

      {level === "campaign" && (
        <CampaignFlatTable
          rows={flatCampaigns}
          currencyCode={currencyCode}
          optional={optional}
          t={t}
        />
      )}
      {level === "adgroup" && (
        <AdGroupFlatTable
          rows={flatAdGroups}
          currencyCode={currencyCode}
          optional={optional}
          t={t}
        />
      )}
      {level === "ad" && (
        <AdFlatTable rows={flatAds} currencyCode={currencyCode} optional={optional} t={t} />
      )}
    </>
  );
}
