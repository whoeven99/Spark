import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  analysisPageContentStyle,
  PageHeaderNav,
  PageMetricCard,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageHintTextStyle,
} from "./pageUiStyles";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { AdsInsightsTreeTable } from "../component/adsInsights/AdsInsightsTreeTable";
import { AdsInsightsDeepTable } from "../component/adsInsights/AdsInsightsDeepTable";
import { TiktokAdsLevelView } from "../component/adsInsights/TiktokAdsLevelView";
import { MetaAdsConnectPanel } from "../component/adsInsights/MetaAdsConnectPanel";
import { GoogleAdsSandboxConnectPanel } from "../component/adsInsights/GoogleAdsSandboxConnectPanel";
import {
  TiktokSandboxMetricsOverridePanel,
  applyCustomMetricsToTree,
  type CustomSandboxMetrics,
} from "../component/adsInsights/TiktokSandboxMetricsOverride";
import type {
  AdsInsightsApiError,
  AdsInsightsApiOk,
  AdsInsightsCampaign,
  AdsInsightsMetrics,
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsView,
} from "../component/adsInsights/types";
import type { AdsInsightsPageLoaderData } from "../app.insights.performance";
import { formatCurrency, formatNumber, formatRoas } from "../component/adsInsights/metricsFormat";

type InsightsFetcherData = AdsInsightsApiOk | AdsInsightsApiError;
type TiktokSandboxObjectDetailFE = {
  id: string;
  name: string;
  status: string;
};

type SeedFetcherData =
  | {
      ok: true;
      campaignId: string | null;
      adgroupId?: string | null;
      adGroupId?: string | null;
      adSetId?: string | null;
      adId?: string | null;
      keywordId?: string | null;
      campaignName: string;
      // 仅 Meta sandbox 的 seed 结果带策略标识（见 metaSandboxSeed.server.ts）。
      strategy?: string | null;
      strategyLabel?: string | null;
      warnings: string[];
      readback?: {
        campaign: TiktokSandboxObjectDetailFE | null;
        adgroup: TiktokSandboxObjectDetailFE | null;
        ad: TiktokSandboxObjectDetailFE | null;
        queriedAt: string;
      } | null;
    }
  | AdsInsightsApiError;

function parseView(raw: string | null): AdsInsightsView {
  if (raw === "keywords" || raw === "searchTerms" || raw === "creatives") return raw;
  return "structure";
}

function emptySummaryMetrics(): AdsInsightsMetrics {
  return {
    impressions: 0,
    clicks: 0,
    spend: 0,
    ctr: 0,
    cpc: 0,
    cpm: null,
    conversions: 0,
    conversionsValue: 0,
    conversionRate: 0,
    roas: null,
    purchases: null,
    purchaseValue: null,
    addToCart: null,
    landingPageViews: null,
    reach: null,
    frequency: null,
    outboundClicks: null,
    videoViews: null,
    thruplay: null,
    leads: null,
    viewContent: null,
    initiateCheckout: null,
    allConversions: null,
  };
}

function summarizeCampaigns(campaigns: AdsInsightsCampaign[]): AdsInsightsMetrics {
  const summary = emptySummaryMetrics();

  for (const campaign of campaigns) {
    const metrics = campaign.metrics;
    summary.impressions += metrics.impressions;
    summary.clicks += metrics.clicks;
    summary.spend += metrics.spend;
    summary.conversions += metrics.conversions;
    summary.conversionsValue += metrics.conversionsValue;
  }

  summary.ctr = summary.impressions > 0 ? summary.clicks / summary.impressions : 0;
  summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;
  summary.conversionRate = summary.clicks > 0 ? summary.conversions / summary.clicks : 0;
  summary.roas = summary.spend > 0 ? summary.conversionsValue / summary.spend : null;

  return summary;
}

function ConnectionStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "connected" | "pending" | "inactive";
}) {
  const toneStyle =
    tone === "connected"
      ? {
          color: pageColorTokens.brandGreenDeep,
          background: pageColorTokens.brandGreenLight,
          borderColor: pageColorTokens.brandGreenGlow,
        }
      : tone === "pending"
        ? {
            color: pageColorTokens.warning,
            background: pageColorTokens.warningBg,
            borderColor: "rgba(185, 137, 0, 0.18)",
          }
        : {
            color: pageColorTokens.textSecondary,
            background: pageColorTokens.surfaceMuted,
            borderColor: pageColorTokens.border,
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.3rem 0.75rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: 700,
        border: `1px solid ${toneStyle.borderColor}`,
        color: toneStyle.color,
        background: toneStyle.background,
      }}
    >
      {label}
    </span>
  );
}

export function AdsInsightsPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loaderData = useLoaderData<AdsInsightsPageLoaderData>();
  const metricsFetcher = useFetcher<InsightsFetcherData>();
  const seedFetcher = useFetcher<SeedFetcherData>();

  const locationSearch = location.search || "";

  const initialPlatform = (searchParams.get("platform") as AdsInsightsPlatform | null) || "meta";
  const [platform, setPlatform] = useState<AdsInsightsPlatform>(
    initialPlatform === "google" || initialPlatform === "tiktok" || initialPlatform === "meta"
      ? initialPlatform
      : "meta",
  );
  const initialRange = Number(searchParams.get("range"));
  const [rangeDays, setRangeDays] = useState<AdsInsightsRangeDays>(
    initialRange === 14 || initialRange === 30 ? initialRange : 7,
  );
  const [view, setView] = useState<AdsInsightsView>(parseView(searchParams.get("view")));
  const [tiktokSandbox, setTiktokSandbox] = useState(
    searchParams.get("sandbox") === "1" || searchParams.get("sandbox") === "true",
  );
  const [metaSandbox, setMetaSandbox] = useState(
    initialPlatform === "meta" &&
      (searchParams.get("sandbox") === "1" || searchParams.get("sandbox") === "true"),
  );
  const [googleSandbox, setGoogleSandbox] = useState(
    initialPlatform === "google" &&
      (searchParams.get("sandbox") === "1" || searchParams.get("sandbox") === "true"),
  );
  const [customMetrics, setCustomMetrics] = useState<CustomSandboxMetrics | null>(null);

  const connections = loaderData.connections;
  const sandboxConfigured = connections.tiktok.sandboxConfigured;
  const metaSandboxConfigured = connections.meta.sandboxConfigured;
  const connected =
    platform === "meta"
      ? metaSandbox
        ? metaSandboxConfigured
        : connections.meta.connected
      : platform === "google"
        ? googleSandbox
          ? connections.google.sandboxConnected
          : connections.google.connected
        : tiktokSandbox
          ? sandboxConfigured
          : connections.tiktok.connected;

  // Meta/TikTok 无关键词与搜索词；切到不支持视图时回退 structure。
  useEffect(() => {
    if (platform !== "google" && (view === "keywords" || view === "searchTerms")) {
      setView("structure");
    }
  }, [platform, view]);

  // 离开 TikTok / Google / Meta 时关闭对应沙盒开关（避免 query 误传到其他平台）。
  useEffect(() => {
    if (platform !== "tiktok" && tiktokSandbox) {
      setTiktokSandbox(false);
      setCustomMetrics(null);
    }
    if (platform !== "google" && googleSandbox) {
      setGoogleSandbox(false);
    }
    if (platform !== "meta" && metaSandbox) {
      setMetaSandbox(false);
    }
  }, [platform, tiktokSandbox, googleSandbox, metaSandbox]);

  // 沙盒模式关闭时清除自定义指标覆盖
  useEffect(() => {
    if (!tiktokSandbox) setCustomMetrics(null);
  }, [tiktokSandbox]);

  const loadMetrics = useCallback(() => {
    if (platform === "meta") {
      if (metaSandbox && !metaSandboxConfigured) return;
      if (!metaSandbox && !connections.meta.connected) return;
    }
    if (platform === "google") {
      if (googleSandbox && !connections.google.sandboxConnected) return;
      if (!googleSandbox && !connections.google.connected) return;
    }
    if (platform === "tiktok") {
      if (tiktokSandbox && !sandboxConfigured) return;
      if (!tiktokSandbox && !connections.tiktok.connected) return;
    }

    const params = new URLSearchParams(location.search);
    params.set("platform", platform);
    params.set("range", String(rangeDays));
    params.set("view", view);
    const useSandbox =
      (platform === "meta" && metaSandbox) ||
      (platform === "tiktok" && tiktokSandbox) ||
      (platform === "google" && googleSandbox);
    if (useSandbox) {
      params.set("sandbox", "1");
    } else {
      params.delete("sandbox");
    }
    metricsFetcher.load(`/api/ads-insights?${params.toString()}`);
  }, [
    connections.google.connected,
    connections.google.sandboxConnected,
    connections.meta.connected,
    metaSandbox,
    metaSandboxConfigured,
    connections.tiktok.connected,
    googleSandbox,
    location.search,
    metricsFetcher,
    platform,
    rangeDays,
    sandboxConfigured,
    tiktokSandbox,
    view,
  ]);

  useEffect(() => {
    loadMetrics();
    // 仅在平台/日期/视图/沙盒变化时拉取；fetcher 自身不应进入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    platform,
    rangeDays,
    view,
    metaSandbox,
    tiktokSandbox,
    googleSandbox,
    connections.meta.connected,
    metaSandboxConfigured,
    connections.google.connected,
    connections.google.sandboxConnected,
    connections.tiktok.connected,
    sandboxConfigured,
  ]);

  useEffect(() => {
    const auth = searchParams.get("metaAdsAuth");
    if (!auth) return;
    const next = new URLSearchParams(searchParams);
    next.delete("metaAdsAuth");
    next.delete("reason");
    next.delete("adAccountId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const auth = searchParams.get("googleAdsSandboxAuth");
    if (!auth) return;
    setPlatform("google");
    setGoogleSandbox(true);
    const next = new URLSearchParams(searchParams);
    next.set("platform", "google");
    next.set("sandbox", "1");
    next.delete("googleAdsSandboxAuth");
    next.delete("reason");
    next.delete("customerId");
    setSearchParams(next, { replace: true });
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        googleAdsSandboxAuth?: string;
      } | null;
      if (!data || data.type !== "google_ads_sandbox_oauth" || !data.googleAdsSandboxAuth) return;
      setPlatform("google");
      setGoogleSandbox(true);
      const next = new URLSearchParams(searchParams);
      next.set("platform", "google");
      next.set("sandbox", "1");
      setSearchParams(next, { replace: true });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (seedFetcher.data?.ok) {
      loadMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFetcher.data]);

  const tabs = useMemo(
    () =>
      [
        { key: "meta" as const, label: t("adsInsights.tabMeta") },
        { key: "google" as const, label: t("adsInsights.tabGoogle") },
        { key: "tiktok" as const, label: t("adsInsights.tabTiktok") },
      ] as const,
    [t],
  );

  const ranges = useMemo(
    () =>
      [
        { key: 7 as const, label: t("adsInsights.range7") },
        { key: 14 as const, label: t("adsInsights.range14") },
        { key: 30 as const, label: t("adsInsights.range30") },
      ] as const,
    [t],
  );

  const viewTabs = useMemo(() => {
    const items: Array<{ key: AdsInsightsView; label: string; disabled?: boolean }> = [
      { key: "structure", label: t("adsInsights.viewStructure") },
      {
        key: "keywords",
        label: t("adsInsights.viewKeywords"),
        disabled: platform !== "google",
      },
      {
        key: "searchTerms",
        label: t("adsInsights.viewSearchTerms"),
        disabled: platform !== "google",
      },
      { key: "creatives", label: t("adsInsights.viewCreatives") },
    ];
    return items;
  }, [platform, t]);

  const data = metricsFetcher.data;
  const loading = metricsFetcher.state === "loading";
  const seeding = seedFetcher.state !== "idle";
  const okData = data && data.ok ? data : null;
  const errData = data && !data.ok ? data : null;
  const seedData = seedFetcher.data;

  const displayCampaigns = useMemo(() => {
    const base = okData?.campaigns ?? [];
    if (platform === "tiktok" && tiktokSandbox && customMetrics && base.length > 0) {
      return applyCustomMetricsToTree(base, customMetrics);
    }
    return base;
  }, [okData?.campaigns, platform, tiktokSandbox, customMetrics]);

  const catalogLink = `/app/ads-catalog${locationSearch}`;

  const deepRows =
    view === "keywords"
      ? okData?.keywords ?? []
      : view === "searchTerms"
        ? okData?.searchTerms ?? []
        : view === "creatives"
          ? okData?.creatives ?? []
          : [];

  const accountLabel =
    okData?.accountName && okData.accountName.trim()
      ? `${okData.accountName} (${okData.accountId})`
      : okData?.accountId ?? "";
  const platformLabel =
    platform === "google"
      ? t("adsInsights.tabGoogle")
      : platform === "tiktok"
        ? t("adsInsights.tabTiktok")
        : t("adsInsights.tabMeta");
  const viewLabel =
    view === "keywords"
      ? t("adsInsights.viewKeywords")
      : view === "searchTerms"
        ? t("adsInsights.viewSearchTerms")
        : view === "creatives"
          ? t("adsInsights.viewCreatives")
          : t("adsInsights.viewStructure");
  const sandboxActive =
    (platform === "meta" && metaSandbox) ||
    (platform === "google" && googleSandbox) ||
    (platform === "tiktok" && tiktokSandbox);
  const overviewStatus = connected
    ? t("settingsShell.statusConnected")
    : loading
      ? t("settingsShell.statusPending")
      : t("settingsShell.statusNeedsSetup");
  const overviewTone = connected ? "connected" : loading ? "pending" : "inactive";
  const summaryMetrics = summarizeCampaigns(displayCampaigns);
  const overviewFooter = okData
    ? t("adsInsights.overviewFooter", {
        mode: sandboxActive ? t("adsInsights.modeSandbox") : t("adsInsights.modeLive"),
        account: accountLabel || t("adsInsights.overviewNoAccount"),
        start: okData.dateStart,
        end: okData.dateEnd,
      })
    : t("adsInsights.overviewWaiting", {
        platform: platformLabel,
        mode: sandboxActive ? t("adsInsights.modeSandbox") : t("adsInsights.modeLive"),
      });

  return (
    <div style={isMobile ? mobilePageContentStyle : analysisPageContentStyle}>
      <PageHeaderNav
        title={t("adsInsights.pageTitle")}
        subtitle={t("adsInsights.pageSubtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      <PageSurface>
        <PageSectionHeader
          title={t("adsInsights.overviewTitle")}
          subtitle={t("adsInsights.overviewSubtitle")}
          badge={<ConnectionStatusBadge label={overviewStatus} tone={overviewTone} />}
        />
        <PageMetricCard
          metrics={[
            { label: t("adsInsights.overviewStatus"), value: overviewStatus },
            { label: t("adsInsights.overviewCampaigns"), value: formatNumber(displayCampaigns.length) },
            { label: t("adsInsights.overviewSpend"), value: formatCurrency(summaryMetrics.spend, okData?.currencyCode ?? null) },
            { label: t("adsInsights.overviewRoas"), value: formatRoas(summaryMetrics.roas) },
          ]}
          footer={<span style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary }}>{overviewFooter}</span>}
        />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("adsInsights.controlsTitle")}
          subtitle={t("adsInsights.controlsSubtitle")}
          badge={
            <ConnectionStatusBadge
              label={sandboxActive ? t("adsInsights.modeSandbox") : t("adsInsights.modeLive")}
              tone={sandboxActive ? "pending" : "connected"}
            />
          }
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SegmentedPageTabs
            activeTab={platform}
            items={tabs}
            onTabChange={setPlatform}
            ariaLabel={t("adsInsights.platformTabsAria")}
            mobileFullWidth={isMobile}
          />

          {platform === "meta" && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: metaSandbox ? "#f4f6ff" : pageColorTokens.surfaceMuted,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: metaSandboxConfigured ? "pointer" : "not-allowed",
                  opacity: metaSandboxConfigured ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={metaSandbox}
                  disabled={!metaSandboxConfigured}
                  onChange={(e) => setMetaSandbox(e.target.checked)}
                />
                {t("adsInsights.metaSandboxToggle")}
              </label>
              <div style={{ ...pageHintTextStyle, margin: 0, flex: "1 1 200px" }}>
                {metaSandboxConfigured
                  ? t("adsInsights.metaSandboxHint")
                  : t("adsInsights.metaSandboxNotConfigured")}
              </div>
              {metaSandbox && metaSandboxConfigured && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() => {
                    seedFetcher.submit(
                      {},
                      {
                        method: "POST",
                        action: `/api/ads-insights/meta-sandbox-seed${locationSearch}`,
                      },
                    );
                  }}
                  style={secondaryActionStyle(seeding)}
                >
                  {seeding ? t("adsInsights.metaSandboxSeeding") : t("adsInsights.metaSandboxSeed")}
                </button>
              )}
            </div>
          )}

          {platform === "google" && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: googleSandbox ? "#f4f6ff" : pageColorTokens.surfaceMuted,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={googleSandbox}
                  onChange={(e) => setGoogleSandbox(e.target.checked)}
                />
                {t("adsInsights.googleSandboxToggle")}
              </label>
              <div style={{ ...pageHintTextStyle, margin: 0, flex: "1 1 200px" }}>
                {t("adsInsights.googleSandboxHint")}
              </div>
              {googleSandbox && connections.google.sandboxConnected && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() => {
                    seedFetcher.submit(
                      {},
                      {
                        method: "POST",
                        action: `/api/ads-insights/google-sandbox-seed${locationSearch}`,
                      },
                    );
                  }}
                  style={secondaryActionStyle(seeding)}
                >
                  {seeding ? t("adsInsights.googleSandboxSeeding") : t("adsInsights.googleSandboxSeed")}
                </button>
              )}
            </div>
          )}

          {platform === "google" && googleSandbox && (
            <GoogleAdsSandboxConnectPanel
              connected={connections.google.sandboxConnected}
              customerId={connections.google.sandboxCustomerId}
              customerName={connections.google.sandboxCustomerName}
              pendingAccounts={connections.google.sandboxPendingAccounts}
              locationSearch={locationSearch}
              onChanged={loadMetrics}
            />
          )}

          {platform === "tiktok" && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 8,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: tiktokSandbox ? "#f4f6ff" : pageColorTokens.surfaceMuted,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: sandboxConfigured ? "pointer" : "not-allowed",
                  opacity: sandboxConfigured ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  checked={tiktokSandbox}
                  disabled={!sandboxConfigured}
                  onChange={(e) => setTiktokSandbox(e.target.checked)}
                />
                {t("adsInsights.tiktokSandboxToggle")}
              </label>
              <div style={{ ...pageHintTextStyle, margin: 0, flex: "1 1 200px" }}>
                {sandboxConfigured
                  ? t("adsInsights.tiktokSandboxHint")
                  : t("adsInsights.tiktokSandboxNotConfigured")}
              </div>
              {tiktokSandbox && sandboxConfigured && (
                <button
                  type="button"
                  disabled={seeding}
                  onClick={() => {
                    seedFetcher.submit(
                      {},
                      {
                        method: "POST",
                        action: `/api/ads-insights/tiktok-sandbox-seed${locationSearch}`,
                      },
                    );
                  }}
                  style={secondaryActionStyle(seeding)}
                >
                  {seeding ? t("adsInsights.tiktokSandboxSeeding") : t("adsInsights.tiktokSandboxSeed")}
                </button>
              )}
            </div>
          )}

          {seedData && (metaSandbox || tiktokSandbox || googleSandbox) && (
            <div
              style={{
                ...hintBoxStyle,
                background: seedData.ok ? "#eefbf2" : "#fff0ee",
                color: seedData.ok ? "#0b7a3b" : "#d82c0d",
              }}
            >
              {seedData.ok ? (
                <>
                  <div>
                    {googleSandbox
                      ? t("adsInsights.googleSandboxSeedOk", {
                          campaign: seedData.campaignName,
                          campaignId: seedData.campaignId || "—",
                          adGroupId: seedData.adGroupId || seedData.adgroupId || "—",
                          adId: seedData.adId || "—",
                          keywordId: seedData.keywordId || "—",
                        })
                      : metaSandbox
                        ? t("adsInsights.metaSandboxSeedOk", {
                            campaign: seedData.campaignName,
                            strategy: seedData.strategyLabel || seedData.strategy || "—",
                            campaignId: seedData.campaignId || "—",
                            adSetId: seedData.adSetId || seedData.adgroupId || seedData.adGroupId || "—",
                            adId: seedData.adId || "—",
                          })
                      : t("adsInsights.tiktokSandboxSeedOk", {
                          campaign: seedData.campaignName,
                          campaignId: seedData.campaignId || "—",
                          adgroupId: seedData.adgroupId || seedData.adGroupId || "—",
                          adId: seedData.adId || "—",
                        })}
                  </div>
                  {tiktokSandbox && seedData.readback && (
                    <TiktokSandboxReadbackPanel readback={seedData.readback} />
                  )}
                  {seedData.warnings?.length > 0 && (
                    <div style={{ color: pageColorTokens.textSecondary }}>
                      {seedData.warnings.join(" · ")}
                    </div>
                  )}
                </>
              ) : (
                <div>
                  {seedData.message ||
                    (googleSandbox
                      ? t("adsInsights.googleSandboxSeedError")
                      : metaSandbox
                        ? t("adsInsights.metaSandboxSeedError")
                        : t("adsInsights.tiktokSandboxSeedError"))}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <SegmentedPageTabs
              activeTab={String(rangeDays) as "7" | "14" | "30"}
              items={ranges.map((r) => ({ key: String(r.key) as "7" | "14" | "30", label: r.label }))}
              onTabChange={(key) => setRangeDays(Number(key) as AdsInsightsRangeDays)}
              ariaLabel={t("adsInsights.rangeTabsAria")}
              density="compact"
            />
            <button
              type="button"
              onClick={loadMetrics}
              disabled={loading || !connected}
              style={secondaryActionStyle(loading)}
            >
              {loading ? t("adsInsights.refreshing") : t("adsInsights.refresh")}
            </button>
          </div>

          <SegmentedPageTabs
            activeTab={view}
            items={viewTabs
              .filter((item) => !item.disabled)
              .map(({ key, label }) => ({ key, label }))}
            onTabChange={setView}
            ariaLabel={t("adsInsights.viewTabsAria")}
            density="compact"
            mobileFullWidth={isMobile}
          />

          {platform === "tiktok" && tiktokSandbox && (
            <TiktokSandboxMetricsOverridePanel
              value={customMetrics}
              onChange={setCustomMetrics}
              hasData={(okData?.campaigns?.length ?? 0) > 0}
            />
          )}

          {platform === "meta" && !metaSandbox && (
            <MetaAdsConnectPanel
              connected={connections.meta.connected}
              adAccountId={connections.meta.adAccountId}
              adAccountName={connections.meta.adAccountName}
              pendingAccounts={connections.meta.pendingAccounts}
              availableAccounts={connections.meta.availableAccounts}
              locationSearch={locationSearch}
              onChanged={loadMetrics}
            />
          )}
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("adsInsights.resultsTitle")}
          subtitle={
            okData
              ? t("adsInsights.resultsSubtitle", {
                  platform: platformLabel,
                  view: viewLabel,
                  start: okData.dateStart,
                  end: okData.dateEnd,
                })
              : t("adsInsights.resultsWaiting", { platform: platformLabel, view: viewLabel })
          }
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {platform === "google" && !googleSandbox && !connections.google.connected && (
            <div style={hintBoxStyle}>
              <div>{t("adsInsights.googleNotConnected")}</div>
              <Link to={catalogLink} style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600 }}>
                {t("adsInsights.goAdsCatalog")}
              </Link>
            </div>
          )}

          {platform === "tiktok" && !tiktokSandbox && !connections.tiktok.connected && (
            <div style={hintBoxStyle}>
              <div>{t("adsInsights.tiktokNotConnected")}</div>
              <Link to={catalogLink} style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600 }}>
                {t("adsInsights.goAdsCatalog")}
              </Link>
            </div>
          )}

          {platform === "tiktok" &&
            !tiktokSandbox &&
            connections.tiktok.connected &&
            connections.tiktok.awaitingCatalog && (
              <div style={{ ...hintBoxStyle, borderColor: "#d4e8dc", background: "#f4fbf7" }}>
                <div>{t("adsInsights.tiktokAwaitingCatalogHint")}</div>
              </div>
            )}

          {okData && (
            <div
              style={{
                border: `1px solid ${pageColorTokens.border}`,
                borderRadius: pageColorTokens.radiusCard,
                background: pageColorTokens.surface,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${pageColorTokens.border}`,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {okData.sandbox
                      ? platform === "google"
                        ? t("adsInsights.tableTitleGoogleSandbox", { accountId: accountLabel })
                        : platform === "meta"
                          ? t("adsInsights.tableTitleMetaSandbox", { accountId: accountLabel })
                          : t("adsInsights.tableTitleSandbox", { accountId: accountLabel })
                      : t("adsInsights.tableTitle", { accountId: accountLabel })}
                  </div>
                  <div style={pageHintTextStyle}>
                    {okData.sandbox
                      ? platform === "google"
                        ? t("adsInsights.tableSubtitleGoogleSandbox", {
                            start: okData.dateStart,
                            end: okData.dateEnd,
                          })
                        : platform === "meta"
                          ? t("adsInsights.tableSubtitleMetaSandbox", {
                              start: okData.dateStart,
                              end: okData.dateEnd,
                            })
                          : t("adsInsights.tableSubtitleSandbox", {
                              start: okData.dateStart,
                              end: okData.dateEnd,
                            })
                      : t("adsInsights.tableSubtitle", {
                          start: okData.dateStart,
                          end: okData.dateEnd,
                        })}
                  </div>
                </div>
              </div>
              {view === "structure" ? (
                platform === "tiktok" ? (
                  <TiktokAdsLevelView
                    campaigns={displayCampaigns}
                    currencyCode={okData.currencyCode}
                  />
                ) : (
                  <AdsInsightsTreeTable
                    campaigns={displayCampaigns}
                    currencyCode={okData.currencyCode}
                  />
                )
              ) : (
                <AdsInsightsDeepTable
                  view={view}
                  rows={deepRows}
                  currencyCode={okData.currencyCode}
                />
              )}
            </div>
          )}

          {errData && connected && (
            <div
              style={{
                ...hintBoxStyle,
                background: "#fff0ee",
                color: "#d82c0d",
              }}
            >
              {errData.message || t("adsInsights.loadError")}
            </div>
          )}

          {loading && !okData && connected && (
            <div style={{ ...hintBoxStyle, textAlign: "center" }}>{t("adsInsights.loading")}</div>
          )}
        </div>
      </PageSurface>
    </div>
  );
}

type ReadbackData = {
  campaign: TiktokSandboxObjectDetailFE | null;
  adgroup: TiktokSandboxObjectDetailFE | null;
  ad: TiktokSandboxObjectDetailFE | null;
  queriedAt: string;
};

function TiktokSandboxReadbackPanel({ readback }: { readback: ReadbackData }) {
  const { t } = useTranslation();
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const renderRow = (label: string, detail: TiktokSandboxObjectDetailFE | null) => {
    if (!detail) {
      return (
        <div>
          {label}:{" "}
          <span style={{ color: pageColorTokens.warning }}>
            {t("adsInsights.tiktokSandboxReadbackNotFound")}
          </span>
        </div>
      );
    }
    return (
      <div>
        {label}: <strong>{detail.name}</strong> · {detail.id} ·{" "}
        <span style={{ fontFamily: "monospace", fontSize: 11 }}>{detail.status}</span>{" "}
        <span style={{ color: "#0b7a3b" }}>✓</span>
      </div>
    );
  };

  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 8,
        borderTop: "1px solid #c3e6cb",
        fontSize: 12,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {t("adsInsights.tiktokSandboxReadbackTitle")}
      </div>
      {renderRow("Campaign", readback.campaign)}
      {renderRow("AdGroup", readback.adgroup)}
      {renderRow("Ad", readback.ad)}
      <div style={{ color: pageColorTokens.textSecondary, marginTop: 2 }}>
        {t("adsInsights.tiktokSandboxReadbackAt", { time: formatTime(readback.queriedAt) })}
      </div>
    </div>
  );
}

const hintBoxStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 16,
  background: pageColorTokens.surfaceMuted,
  fontSize: 13,
  display: "flex",
  flexDirection: "column" as const,
  gap: 8,
};

function secondaryActionStyle(disabled: boolean) {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${pageColorTokens.borderSubtle}`,
    background: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "wait" : "pointer",
  };
}
