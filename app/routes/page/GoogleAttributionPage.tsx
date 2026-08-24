import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { appendEmbeddedSearchToPath } from "../../lib/embeddedLocationSearch";
import {
  PageHeaderNav,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import type { GoogleAttributionLoaderData } from "../app.ads.google-attribution";
import type { GoogleAttributionOverviewResponse } from "../api.google-attribution.overview";

type RangeDays = 7 | 14 | 30;

const OVERVIEW_FETCH_TIMEOUT_MS = 45_000;

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

const secondaryBtn = (active: boolean) => ({
  padding: "8px 12px",
  borderRadius: 8,
  background: active ? pageColorTokens.brandGreenLight : "#fff",
  color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textPrimary,
  border: `1px solid ${active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});

function formatCurrency(amount: number, currencyCode: string | null): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // ignore invalid currency code
    }
  }
  return `$${amount.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function StatusPill({ tone, children }: { tone: "ok" | "warn" | "muted"; children: string }) {
  const palette =
    tone === "ok"
      ? { bg: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDeep }
      : tone === "warn"
        ? { bg: "#fff7e0", color: "#8a6d00" }
        : { bg: pageColorTokens.surfaceMuted, color: pageColorTokens.textSecondary };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: palette.bg,
        color: palette.color,
      }}
    >
      {children}
    </span>
  );
}

function warningText(
  t: (key: string) => string,
  code: string,
): string | null {
  if (code === "ga4_revenue_uses_ga4_attribution_model") {
    return t("googleAttribution.warningGa4Attribution");
  }
  if (code === "ads_ga4_linking_recommended") {
    return t("googleAttribution.warningLinking");
  }
  if (code === "connect_both_ads_and_ga4_for_full_view") {
    return t("googleAttribution.warningPartial");
  }
  if (code === "ga4_campaign_fetch_failed") {
    return t("googleAttribution.warningGa4Fetch");
  }
  if (code === "ads_campaign_fetch_failed") {
    return t("googleAttribution.warningAdsFetch");
  }
  return null;
}

export function GoogleAttributionPage() {
  const { t } = useTranslation();
  const loaderData = useLoaderData<GoogleAttributionLoaderData>();
  const location = useLocation();
  const locationSearch = useEmbeddedLocationSearch();
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const [overview, setOverview] = useState<GoogleAttributionOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [networkError, setNetworkError] = useState(false);
  const requestIdRef = useRef(0);

  const loadData = useCallback(
    async (range: RangeDays) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setLoadError("");
      setNetworkError(false);

      const url = appendEmbeddedSearchToPath(
        `/api/google-attribution/overview?range=${range}`,
        locationSearch,
      );

      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(OVERVIEW_FETCH_TIMEOUT_MS),
        });
        const data = (await response.json()) as GoogleAttributionOverviewResponse;
        if (requestId !== requestIdRef.current) return;

        setOverview(data);
        if (!data.ok && data.reason === "api_error") {
          setLoadError(data.message);
        }
      } catch {
        if (requestId !== requestIdRef.current) return;
        setNetworkError(true);
        setOverview(null);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [locationSearch],
  );

  useEffect(() => {
    if (loaderData.adsConnected || loaderData.ga4Connected) {
      void loadData(rangeDays);
    }
  }, [loaderData.adsConnected, loaderData.ga4Connected, loadData, rangeDays]);

  const overviewData = overview?.ok ? overview : null;

  const warnings = useMemo(
    () =>
      (overviewData?.warnings ?? [])
        .map((code) => warningText(t, code))
        .filter((text): text is string => Boolean(text)),
    [overviewData?.warnings, t],
  );

  const matchLabel = (quality: string) => {
    if (quality === "linked") return t("googleAttribution.matchLinked");
    if (quality === "name_only") return t("googleAttribution.matchNameOnly");
    if (quality === "ga4_only") return t("googleAttribution.matchGa4Only");
    return t("googleAttribution.matchAdsOnly");
  };

  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("googleAttribution.title")}
        subtitle={t("googleAttribution.subtitle")}
        backLabel={t("googleAttribution.backToSettings")}
        returnTo={`/app/settings${locationSearch}`}
        preserveSearch
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            ...cardStyle,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginBottom: 6 }}>
              Google Ads
            </div>
            <StatusPill tone={loaderData.adsConnected ? "ok" : "warn"}>
              {loaderData.adsConnected
                ? t("googleAttribution.adsConnected")
                : t("googleAttribution.adsNotConnected")}
            </StatusPill>
            {!loaderData.adsConnected ? (
              <div style={{ marginTop: 10 }}>
                <Link to={`/app/settings/connections/google${locationSearch}`} style={{ fontSize: 13 }}>
                  {t("googleAttribution.connectAds")}
                </Link>
              </div>
            ) : null}
          </div>

          <div>
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginBottom: 6 }}>
              GA4
            </div>
            <StatusPill tone={loaderData.ga4Connected ? "ok" : "warn"}>
              {loaderData.ga4Connected
                ? t("googleAttribution.ga4Connected", { count: loaderData.ga4PropertyCount })
                : t("googleAttribution.ga4NotConnected")}
            </StatusPill>
            {!loaderData.ga4Connected ? (
              <div style={{ marginTop: 10 }}>
                <Link to={`/app/settings/google-analytics${locationSearch}`} style={{ fontSize: 13 }}>
                  {t("googleAttribution.connectGa4")}
                </Link>
              </div>
            ) : null}
          </div>

          <div>
            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginBottom: 6 }}>
              Linking
            </div>
            <StatusPill tone={overviewData?.linked ? "ok" : "warn"}>
              {overviewData?.linked
                ? t("googleAttribution.linkingOk")
                : t("googleAttribution.linkingMissing")}
            </StatusPill>
            {!overviewData?.linked ? (
              <p style={{ ...pageHintTextStyle, margin: "8px 0 0" }}>
                {t("googleAttribution.linkingHint")}
              </p>
            ) : null}
          </div>
        </div>

        {!loaderData.adsConnected && !loaderData.ga4Connected ? (
          <div style={cardStyle}>
            <p style={{ margin: 0, color: pageColorTokens.textSecondary }}>
              {t("googleAttribution.notConfigured")}
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  style={secondaryBtn(rangeDays === days)}
                  onClick={() => setRangeDays(days)}
                >
                  {t("googleAttribution.rangeDays", { count: days })}
                </button>
              ))}
              <span style={pageHintTextStyle}>{t("googleAttribution.dataDelayHint")}</span>
            </div>

            {loading ? (
              <div style={cardStyle}>{t("googleAttribution.loading")}</div>
            ) : networkError ? (
              <div style={cardStyle}>
                <p style={{ margin: "0 0 12px", color: pageColorTokens.textSecondary }}>
                  {t("googleAttribution.networkError")}
                </p>
                <button
                  type="button"
                  style={secondaryBtn(false)}
                  onClick={() => void loadData(rangeDays)}
                >
                  {t("googleAttribution.retry")}
                </button>
              </div>
            ) : loadError ? (
              <div style={cardStyle}>
                <p style={{ margin: "0 0 12px", color: pageColorTokens.textSecondary }}>
                  {t("googleAttribution.loadError")}: {loadError}
                </p>
                <button
                  type="button"
                  style={secondaryBtn(false)}
                  onClick={() => void loadData(rangeDays)}
                >
                  {t("googleAttribution.retry")}
                </button>
              </div>
            ) : overviewData ? (
              <>
                {warnings.length > 0 ? (
                  <div
                    style={{
                      ...cardStyle,
                      background: "#fffaf0",
                      borderColor: "#f0d9a8",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {warnings.map((text) => (
                      <p key={text} style={{ margin: 0, fontSize: 13, color: "#7a5b00" }}>
                        {text}
                      </p>
                    ))}
                  </div>
                ) : null}

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                    gap: 12,
                  }}
                >
                  {[
                    { label: t("googleAttribution.metricSpend"), value: formatCurrency(overviewData.totals.spend, overviewData.currencyCode) },
                    { label: t("googleAttribution.metricClicks"), value: formatNumber(overviewData.totals.clicks) },
                    { label: t("googleAttribution.metricSessions"), value: formatNumber(overviewData.totals.sessions) },
                    {
                      label: t("googleAttribution.metricGa4Revenue"),
                      value: formatCurrency(overviewData.totals.ga4Revenue, overviewData.currencyCode),
                    },
                    {
                      label: t("googleAttribution.metricRoas"),
                      value:
                        overviewData.totals.roas == null ? "—" : `${overviewData.totals.roas.toFixed(2)}x`,
                    },
                  ].map((metric) => (
                    <div key={metric.label} style={cardStyle}>
                      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                        {metric.label}
                      </div>
                      <div
                        style={{
                          fontSize: 24,
                          fontWeight: 700,
                          color: pageColorTokens.textPrimary,
                          marginTop: 6,
                        }}
                      >
                        {metric.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={cardStyle}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: pageColorTokens.textPrimary,
                      marginBottom: 12,
                    }}
                  >
                    {t("googleAttribution.campaignTableTitle")}
                  </div>
                  {overviewData.campaigns.length === 0 ? (
                    <p style={{ margin: 0, color: pageColorTokens.textSecondary }}>
                      {t("googleAttribution.noCampaigns")}
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ textAlign: "left", color: pageColorTokens.textSecondary }}>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colCampaign")}</th>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colSpend")}</th>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colClicks")}</th>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colSessions")}</th>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colGa4Revenue")}</th>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colRoas")}</th>
                            <th style={{ padding: "8px 6px" }}>{t("googleAttribution.colMatch")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {overviewData.campaigns.map((row) => (
                            <tr
                              key={`${row.campaignId ?? "ga4"}-${row.campaignName}`}
                              style={{ borderTop: `1px solid ${pageColorTokens.divider}` }}
                            >
                              <td style={{ padding: "10px 6px", fontWeight: 600 }}>{row.campaignName}</td>
                              <td style={{ padding: "10px 6px" }}>
                                {formatCurrency(row.spend, overviewData.currencyCode)}
                              </td>
                              <td style={{ padding: "10px 6px" }}>{formatNumber(row.clicks)}</td>
                              <td style={{ padding: "10px 6px" }}>{formatNumber(row.sessions)}</td>
                              <td style={{ padding: "10px 6px" }}>
                                {formatCurrency(row.ga4Revenue, overviewData.currencyCode)}
                              </td>
                              <td style={{ padding: "10px 6px" }}>
                                {row.roas == null ? "—" : `${row.roas.toFixed(2)}x`}
                              </td>
                              <td style={{ padding: "10px 6px" }}>
                                <StatusPill tone={row.matchQuality === "linked" ? "ok" : "muted"}>
                                  {matchLabel(row.matchQuality)}
                                </StatusPill>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : overview && !overview.ok && overview.reason === "not_configured" ? (
              <div style={cardStyle}>{t("googleAttribution.notConfigured")}</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
