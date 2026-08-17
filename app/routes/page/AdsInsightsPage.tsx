import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { AdsOverviewSnapshot } from "../../server/adsInsights/overview.server";
import type { Ga4StatusResponse } from "../api.ga4.status";
import type { GscStatusResponse } from "../api.gsc.status";
import type { GoogleAttributionOverviewResponse } from "../api.google-attribution.overview";

type InsightsFetcherData = AdsInsightsApiOk | AdsInsightsApiError;
type UnifiedOverviewFetcherData =
  | {
      ok: true;
      overview: AdsOverviewSnapshot;
    }
  | {
      ok: false;
      message: string;
    };
type PlatformFilter = AdsInsightsPlatform | "all";
type TrafficMixSummary = {
  paidSessions: number;
  freeSessions: number;
  directSessions: number;
  paidRevenue: number;
  freeRevenue: number;
  directRevenue: number;
  totalSessions: number;
  totalRevenue: number;
};
type SearchTrafficSummary = {
  connected: boolean;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  siteUrl: string | null;
};
type LandingPageRow = {
  key: string;
  sessions: number;
  revenue: number;
  bounceRate: number;
};
type SearchQueryRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
type ChannelValueSummary = {
  sessions: number;
  purchases: number;
  revenue: number;
  conversionRate: number | null;
  revenuePerSession: number | null;
  averageOrderValue: number | null;
};
type TrafficTrendPoint = {
  date: string;
  value: number;
};
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

function isPaidChannelGroup(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    normalized.includes("paid") ||
    normalized.includes("cross-network") ||
    normalized.includes("cross network") ||
    normalized.includes("display") ||
    normalized.includes("shopping") ||
    normalized.includes("affiliate") ||
    normalized.includes("video")
  );
}

function isDirectChannelGroup(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return normalized === "direct";
}

function summarizeTrafficMix(data: Ga4StatusResponse | undefined): TrafficMixSummary | null {
  if (!data || !data.ok || !data.connected) return null;

  const summary: TrafficMixSummary = {
    paidSessions: 0,
    freeSessions: 0,
    directSessions: 0,
    paidRevenue: 0,
    freeRevenue: 0,
    directRevenue: 0,
    totalSessions: data.summary.totalSessions,
    totalRevenue: data.summary.totalRevenue,
  };

  for (const row of data.rows) {
    if (isPaidChannelGroup(row.key)) {
      summary.paidSessions += row.sessions;
      summary.paidRevenue += row.revenue;
      continue;
    }
    if (isDirectChannelGroup(row.key)) {
      summary.directSessions += row.sessions;
      summary.directRevenue += row.revenue;
    }
    summary.freeSessions += row.sessions;
    summary.freeRevenue += row.revenue;
  }

  return summary;
}

function summarizeSearchTraffic(data: GscStatusResponse | undefined): SearchTrafficSummary | null {
  if (!data || !data.ok) return null;
  if (!data.connected) {
    return {
      connected: false,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
      siteUrl: null,
    };
  }

  return {
    connected: true,
    clicks: data.summary.totalClicks,
    impressions: data.summary.totalImpressions,
    ctr: data.summary.avgCtr,
    position: data.summary.avgPosition,
    siteUrl: data.siteUrl,
  };
}

function isOrganicSearchChannelGroup(key: string): boolean {
  return key.trim().toLowerCase() === "organic search";
}

function buildTrafficTrendSeries(params: {
  paidSeries: AdsOverviewSnapshot["paidSeries"] | undefined;
  ga4TimeSeries: Ga4StatusResponse | undefined;
  gscTimeSeries: GscStatusResponse | undefined;
}) {
  const paid = (params.paidSeries ?? []).map((row) => ({ date: row.date, value: row.clicks }));
  const free =
    params.ga4TimeSeries && params.ga4TimeSeries.ok && params.ga4TimeSeries.connected
      ? params.ga4TimeSeries.timeSeries.map((row) => ({ date: row.key, value: row.sessions }))
      : [];
  const search =
    params.gscTimeSeries && params.gscTimeSeries.ok && params.gscTimeSeries.connected
      ? params.gscTimeSeries.timeSeries.map((row) => ({ date: row.key, value: row.clicks }))
      : [];
  return { paid, free, search };
}

function buildChannelShareRows(data: Ga4StatusResponse | undefined): Array<{
  key: string;
  sessions: number;
  share: number;
}> {
  if (!data || !data.ok || !data.connected || data.summary.totalSessions <= 0) return [];
  return data.rows
    .map((row) => ({
      key: row.key || "Other",
      sessions: row.sessions,
      share: row.sessions / data.summary.totalSessions,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);
}

function buildLandingPageRows(data: Ga4StatusResponse | undefined): LandingPageRow[] {
  if (!data || !data.ok || !data.connected) return [];
  return data.rows
    .filter((row) => row.sessions > 0 || row.revenue > 0)
    .map((row) => ({
      key: row.key || "/",
      sessions: row.sessions,
      revenue: row.revenue,
      bounceRate: row.bounceRate,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);
}

function buildSearchQueryRows(data: GscStatusResponse | undefined): SearchQueryRow[] {
  if (!data || !data.ok || !data.connected) return [];
  return data.rows
    .filter((row) => row.clicks > 0 || row.impressions > 0)
    .map((row) => ({
      key: row.key || "—",
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);
}

function summarizeChannelValue(
  data: Ga4StatusResponse | undefined,
  predicate?: (row: { key: string; sessions: number; purchases: number; revenue: number }) => boolean,
): ChannelValueSummary | null {
  if (!data || !data.ok || !data.connected) return null;

  let sessions = 0;
  let purchases = 0;
  let revenue = 0;

  for (const row of data.rows) {
    if (predicate && !predicate(row)) continue;
    sessions += row.sessions;
    purchases += row.purchases;
    revenue += row.revenue;
  }

  return {
    sessions,
    purchases,
    revenue,
    conversionRate: sessions > 0 ? purchases / sessions : null,
    revenuePerSession: sessions > 0 ? revenue / sessions : null,
    averageOrderValue: purchases > 0 ? revenue / purchases : null,
  };
}

function formatCompactLabel(value: string, fallback = "—"): string {
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDecimal(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

function formatNullableCurrency(value: number | null | undefined, currencyCode: string | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return formatCurrency(value, currencyCode ?? null);
}

function attributionMatchLabel(t: (key: string) => string, quality: string): string {
  if (quality === "linked") return t("googleAttribution.matchLinked");
  if (quality === "name_only") return t("googleAttribution.matchNameOnly");
  if (quality === "ga4_only") return t("googleAttribution.matchGa4Only");
  return t("googleAttribution.matchAdsOnly");
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
  const overviewFetcher = useFetcher<UnifiedOverviewFetcherData>();
  const ga4Fetcher = useFetcher<Ga4StatusResponse>();
  const ga4LandingFetcher = useFetcher<Ga4StatusResponse>();
  const gscFetcher = useFetcher<GscStatusResponse>();
  const attributionFetcher = useFetcher<GoogleAttributionOverviewResponse>();
  const seedFetcher = useFetcher<SeedFetcherData>();

  const locationSearch = location.search || "";

  const initialPlatform = (searchParams.get("platform") as PlatformFilter | null) || "all";
  const [platform, setPlatform] = useState<PlatformFilter>(
    initialPlatform === "google" ||
      initialPlatform === "tiktok" ||
      initialPlatform === "meta" ||
      initialPlatform === "all"
      ? initialPlatform
      : "all",
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
  const aggregateMode = platform === "all";

  const connections = loaderData.connections;
  const sandboxConfigured = connections.tiktok.sandboxConfigured;
  const metaSandboxConfigured = connections.meta.sandboxConfigured;
  const connected =
    aggregateMode
      ? connections.meta.connected || connections.google.connected || connections.tiktok.connected
      : platform === "meta"
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
    if ((platform !== "google" || aggregateMode) && (view === "keywords" || view === "searchTerms")) {
      setView("structure");
    }
  }, [aggregateMode, platform, view]);

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
    if (aggregateMode) return;
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
    aggregateMode,
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

  const loadUnifiedOverview = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("range", String(rangeDays));
    params.delete("platform");
    params.delete("view");
    params.delete("sandbox");
    overviewFetcher.load(`/api/ads-overview?${params.toString()}`);
  }, [location.search, overviewFetcher, rangeDays]);

  const loadTrafficMix = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("days", String(rangeDays));
    params.set("dimension", "sessionDefaultChannelGroup");
    ga4Fetcher.load(`/api/ga4/status?${params.toString()}`);
  }, [ga4Fetcher, location.search, rangeDays]);

  const loadSearchTraffic = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("days", String(rangeDays));
    params.set("dimension", "query");
    gscFetcher.load(`/api/gsc/status?${params.toString()}`);
  }, [gscFetcher, location.search, rangeDays]);

  const loadLandingPages = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("days", String(rangeDays));
    params.set("dimension", "landingPage");
    ga4LandingFetcher.load(`/api/ga4/status?${params.toString()}`);
  }, [ga4LandingFetcher, location.search, rangeDays]);

  const loadAttributionOverview = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("range", String(rangeDays));
    attributionFetcher.load(`/api/google-attribution/overview?${params.toString()}`);
  }, [attributionFetcher, location.search, rangeDays]);

  useEffect(() => {
    if (aggregateMode) {
      loadUnifiedOverview();
      loadTrafficMix();
      loadSearchTraffic();
      loadLandingPages();
      loadAttributionOverview();
      return;
    }
    loadMetrics();
    // 仅在平台/日期/视图/沙盒变化时拉取；fetcher 自身不应进入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    aggregateMode,
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
    loadUnifiedOverview,
    loadTrafficMix,
    loadSearchTraffic,
    loadLandingPages,
    loadAttributionOverview,
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
        { key: "all" as const, label: t("adsInsights.tabAll") },
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
  const unifiedData = overviewFetcher.data;
  const ga4Data = ga4Fetcher.data;
  const ga4LandingData = ga4LandingFetcher.data;
  const gscData = gscFetcher.data;
  const loading = aggregateMode
    ? overviewFetcher.state === "loading" ||
      ga4Fetcher.state === "loading" ||
      ga4LandingFetcher.state === "loading" ||
      gscFetcher.state === "loading" ||
      attributionFetcher.state === "loading"
    : metricsFetcher.state === "loading";
  const seeding = seedFetcher.state !== "idle";
  const okData = data && data.ok ? data : null;
  const errData = data && !data.ok ? data : null;
  const okOverview = unifiedData && unifiedData.ok ? unifiedData.overview : null;
  const errOverview = unifiedData && !unifiedData.ok ? unifiedData : null;
  const trafficMix = summarizeTrafficMix(ga4Data);
  const searchTraffic = summarizeSearchTraffic(gscData);
  const trafficTrendSeries = buildTrafficTrendSeries({
    paidSeries: okOverview?.paidSeries,
    ga4TimeSeries: ga4Data,
    gscTimeSeries: gscData,
  });
  const channelShareRows = buildChannelShareRows(ga4Data);
  const landingPageRows = buildLandingPageRows(ga4LandingData);
  const searchQueryRows = buildSearchQueryRows(gscData);
  const siteValueSummary = summarizeChannelValue(ga4Data);
  const paidValueSummary = summarizeChannelValue(ga4Data, (row) => isPaidChannelGroup(row.key));
  const freeValueSummary = summarizeChannelValue(ga4Data, (row) => !isPaidChannelGroup(row.key));
  const searchValueSummary = summarizeChannelValue(ga4Data, (row) => isOrganicSearchChannelGroup(row.key));
  const organicSearchSessions =
    ga4Data && ga4Data.ok && ga4Data.connected
      ? ga4Data.rows
          .filter((row) => isOrganicSearchChannelGroup(row.key))
          .reduce((sum, row) => sum + row.sessions, 0)
      : 0;
  const paidShare = trafficMix && trafficMix.totalSessions > 0 ? trafficMix.paidSessions / trafficMix.totalSessions : 0;
  const freeShare = trafficMix && trafficMix.totalSessions > 0 ? trafficMix.freeSessions / trafficMix.totalSessions : 0;
  const organicSearchShare =
    trafficMix && trafficMix.totalSessions > 0 ? organicSearchSessions / trafficMix.totalSessions : 0;
  const directShare =
    trafficMix && trafficMix.totalSessions > 0 ? trafficMix.directSessions / trafficMix.totalSessions : 0;
  const attributionOverview = attributionFetcher.data?.ok ? attributionFetcher.data : null;
  const valueCurrencyCode = attributionOverview?.currencyCode ?? okOverview?.currencyCode ?? null;
  const paidCostPerPurchase =
    okOverview && paidValueSummary && paidValueSummary.purchases > 0
      ? okOverview.totals.spend / paidValueSummary.purchases
      : null;
  const paidTrafficRoas =
    attributionOverview?.totals.roas ??
    (okOverview && paidValueSummary && okOverview.totals.spend > 0
      ? paidValueSummary.revenue / okOverview.totals.spend
      : null);
  const attributionNotConfigured =
    attributionFetcher.data && !attributionFetcher.data.ok && attributionFetcher.data.reason === "not_configured";
  const attributionLoadError =
    attributionFetcher.data && !attributionFetcher.data.ok && attributionFetcher.data.reason === "api_error"
      ? attributionFetcher.data.message
      : null;
  const seedData = seedFetcher.data;

  const displayCampaigns = useMemo(() => {
    const base = okData?.campaigns ?? [];
    if (platform === "tiktok" && tiktokSandbox && customMetrics && base.length > 0) {
      return applyCustomMetricsToTree(base, customMetrics);
    }
    return base;
  }, [okData?.campaigns, platform, tiktokSandbox, customMetrics]);

  const catalogLink = `/app/ads-catalog${locationSearch}`;
  const settingsLink = "/app/settings";
  const googleAttributionLink = `/app/ads/google-attribution${locationSearch}`;

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
    aggregateMode
      ? t("adsInsights.tabAll")
      : platform === "google"
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
    (!aggregateMode && platform === "meta" && metaSandbox) ||
    (platform === "google" && googleSandbox) ||
    (platform === "tiktok" && tiktokSandbox);
  const overviewStatus = connected
    ? t("settingsShell.statusConnected")
    : loading
      ? t("settingsShell.statusPending")
      : t("settingsShell.statusNeedsSetup");
  const overviewTone = connected ? "connected" : loading ? "pending" : "inactive";
  const summaryMetrics = summarizeCampaigns(displayCampaigns);
  const connectedPlatforms = okOverview?.platforms.filter((item) => item.connected).length ?? 0;
  const totalPlatforms = okOverview?.platforms.length ?? 3;
  const overviewFooter = aggregateMode
    ? okOverview
      ? t("adsInsights.overviewFooterAll", {
          start: okOverview.dateStart,
          end: okOverview.dateEnd,
          connected: connectedPlatforms,
          total: totalPlatforms,
        })
      : t("adsInsights.overviewWaitingAll")
    : okData
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
          subtitle={
            aggregateMode
              ? t("adsInsights.overviewSubtitleAll")
              : t("adsInsights.overviewSubtitle")
          }
          badge={<ConnectionStatusBadge label={overviewStatus} tone={overviewTone} />}
        />
        <PageMetricCard
          metrics={
            aggregateMode
              ? [
                  {
                    label: t("adsInsights.overviewPaidSessions"),
                    value: formatNumber(trafficMix?.paidSessions ?? 0),
                  },
                  {
                    label: t("adsInsights.overviewFreeSessions"),
                    value: formatNumber(trafficMix?.freeSessions ?? 0),
                  },
                  {
                    label: t("adsInsights.overviewSearchClicks"),
                    value: formatNumber(searchTraffic?.clicks ?? 0),
                  },
                  {
                    label: t("adsInsights.overviewSpend"),
                    value: formatCurrency(okOverview?.totals.spend ?? 0, okOverview?.currencyCode ?? null),
                  },
                  {
                    label: t("adsInsights.overviewTrafficRevenue"),
                    value: formatCurrency(trafficMix?.totalRevenue ?? 0, okOverview?.currencyCode ?? null),
                  },
                ]
              : [
                  { label: t("adsInsights.overviewStatus"), value: overviewStatus },
                  { label: t("adsInsights.overviewCampaigns"), value: formatNumber(displayCampaigns.length) },
                  { label: t("adsInsights.overviewSpend"), value: formatCurrency(summaryMetrics.spend, okData?.currencyCode ?? null) },
                  { label: t("adsInsights.overviewRoas"), value: formatRoas(summaryMetrics.roas) },
                ]
          }
          footer={<span style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary }}>{overviewFooter}</span>}
        />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("adsInsights.controlsTitle")}
          subtitle={
            aggregateMode
              ? t("adsInsights.controlsSubtitleAll")
              : t("adsInsights.controlsSubtitle")
          }
          badge={
            <ConnectionStatusBadge
              label={
                aggregateMode
                  ? t("adsInsights.trafficModePaid")
                  : sandboxActive
                    ? t("adsInsights.modeSandbox")
                    : t("adsInsights.modeLive")
              }
              tone={aggregateMode ? "connected" : sandboxActive ? "pending" : "connected"}
            />
          }
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={managementGuideCardStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={managementGuideTitleStyle}>
                {aggregateMode
                  ? t("adsInsights.unifiedGuideTitle")
                  : t("adsInsights.connectionGuideTitle")}
              </div>
              <div style={managementGuideBodyStyle}>
                {aggregateMode
                  ? t("adsInsights.unifiedGuideBody")
                  : t("adsInsights.connectionGuideBody", { platform: platformLabel })}
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <ConnectionStatusBadge label={overviewStatus} tone={overviewTone} />
              <Link to={settingsLink} style={managementGuideLinkStyle(true)}>
                {t("common.manageConnections")}
              </Link>
              {aggregateMode ? (
                <Link to={googleAttributionLink} style={managementGuideLinkStyle(false)}>
                  {t("adsInsights.openTrafficSources")}
                </Link>
              ) : (
                <Link to={catalogLink} style={managementGuideLinkStyle(false)}>
                  {t("adsInsights.openCatalogBindings")}
                </Link>
              )}
            </div>
          </div>

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
              onClick={
                aggregateMode
                  ? () => {
                      loadUnifiedOverview();
                      loadTrafficMix();
                      loadSearchTraffic();
                      loadLandingPages();
                      loadAttributionOverview();
                    }
                  : loadMetrics
              }
              disabled={loading || !connected}
              style={secondaryActionStyle(loading)}
            >
              {loading ? t("adsInsights.refreshing") : t("adsInsights.refresh")}
            </button>
          </div>

          {!aggregateMode ? (
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
          ) : null}

          {platform === "tiktok" && tiktokSandbox && (
            <TiktokSandboxMetricsOverridePanel
              value={customMetrics}
              onChange={setCustomMetrics}
              hasData={(okData?.campaigns?.length ?? 0) > 0}
            />
          )}

          {platform === "meta" && !metaSandbox && (
            <>
              <div style={legacyPanelHintStyle}>
                <div style={{ fontWeight: 600 }}>{t("adsInsights.legacyAuthPanelTitle")}</div>
                <div style={pageHintTextStyle}>{t("adsInsights.legacyMetaAuthPanelBody")}</div>
              </div>
              <MetaAdsConnectPanel
                connected={connections.meta.connected}
                adAccountId={connections.meta.adAccountId}
                adAccountName={connections.meta.adAccountName}
                pendingAccounts={connections.meta.pendingAccounts}
                availableAccounts={connections.meta.availableAccounts}
                locationSearch={locationSearch}
                onChanged={loadMetrics}
              />
            </>
          )}
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("adsInsights.resultsTitle")}
          subtitle={
            aggregateMode
              ? okOverview
                ? t("adsInsights.resultsSubtitleAll", {
                    start: okOverview.dateStart,
                    end: okOverview.dateEnd,
                  })
                : t("adsInsights.resultsWaitingAll")
              : okData
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
          {aggregateMode && okOverview ? (
            <>
              <div style={trafficSplitStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={trafficSplitTitleStyle}>{t("adsInsights.trafficSummaryTitle")}</div>
                  <div style={trafficSplitBodyStyle}>{t("adsInsights.trafficSummaryBody")}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <span style={trafficPillStyle("paid")}>{t("adsInsights.trafficModePaid")}</span>
                  <Link to={googleAttributionLink} style={managementGuideLinkStyle(false)}>
                    {t("adsInsights.openTrafficSources")}
                  </Link>
                </div>
              </div>

              <div style={trafficBreakdownGridStyle(isMobile)}>
                <TrafficBreakdownCard
                  title={t("adsInsights.trafficPaidTitle")}
                  subtitle={t("adsInsights.trafficPaidSubtitle")}
                  tone="paid"
                  metrics={[
                    {
                      label: t("adsInsights.overviewPaidSessions"),
                      value: formatNumber(trafficMix?.paidSessions ?? 0),
                    },
                    {
                      label: t("adsInsights.overviewSpend"),
                      value: formatCurrency(okOverview.totals.spend, okOverview.currencyCode),
                    },
                    {
                      label: t("adsInsights.overviewRoas"),
                      value: formatRoas(okOverview.totals.roas),
                    },
                  ]}
                />
                <TrafficBreakdownCard
                  title={t("adsInsights.trafficFreeTitle")}
                  subtitle={t("adsInsights.trafficFreeSubtitle")}
                  tone="free"
                  metrics={[
                    {
                      label: t("adsInsights.overviewFreeSessions"),
                      value: formatNumber(trafficMix?.freeSessions ?? 0),
                    },
                    {
                      label: t("adsInsights.trafficDirectSessions"),
                      value: formatNumber(trafficMix?.directSessions ?? 0),
                    },
                    {
                      label: t("adsInsights.overviewTrafficRevenue"),
                      value: formatCurrency(trafficMix?.freeRevenue ?? 0, okOverview.currencyCode),
                    },
                  ]}
                  footnote={t("adsInsights.trafficFreeFootnote")}
                />
                <TrafficBreakdownCard
                  title={t("adsInsights.trafficSearchTitle")}
                  subtitle={
                    searchTraffic?.connected
                      ? t("adsInsights.trafficSearchSubtitle")
                      : t("adsInsights.trafficSearchDisconnected")
                  }
                  tone="search"
                  metrics={[
                    {
                      label: t("adsInsights.overviewSearchClicks"),
                      value: formatNumber(searchTraffic?.clicks ?? 0),
                    },
                    {
                      label: t("adsInsights.trafficSearchImpressions"),
                      value: formatNumber(searchTraffic?.impressions ?? 0),
                    },
                    {
                      label: t("adsInsights.trafficSearchCtr"),
                      value: formatPercent(searchTraffic?.ctr ?? 0),
                    },
                  ]}
                  footnote={
                    searchTraffic?.connected
                      ? t("adsInsights.trafficSearchFootnote", {
                          site: searchTraffic.siteUrl || "—",
                          position: formatDecimal(searchTraffic.position),
                        })
                      : t("adsInsights.trafficSearchConnectHint")
                  }
                />
              </div>

              <div style={overviewSectionGridStyle(isMobile)}>
                <div style={overviewSectionCardStyle}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={trafficSplitTitleStyle}>{t("adsInsights.trafficTrendTitle")}</div>
                    <div style={trafficSplitBodyStyle}>{t("adsInsights.trafficTrendBody")}</div>
                  </div>
                  <div style={trendCardGridStyle(isMobile)}>
                    <TrendMetricCard
                      title={t("adsInsights.trendPaidTitle")}
                      value={formatNumber(trafficMix?.paidSessions ?? 0)}
                      footnote={t("adsInsights.trendPaidFootnote")}
                      series={trafficTrendSeries.paid}
                      tone="paid"
                    />
                    <TrendMetricCard
                      title={t("adsInsights.trendFreeTitle")}
                      value={formatNumber(trafficMix?.freeSessions ?? 0)}
                      footnote={t("adsInsights.trendFreeFootnote")}
                      series={trafficTrendSeries.free}
                      tone="free"
                    />
                    <TrendMetricCard
                      title={t("adsInsights.trendSearchTitle")}
                      value={formatNumber(searchTraffic?.clicks ?? 0)}
                      footnote={t("adsInsights.trendSearchFootnote")}
                      series={trafficTrendSeries.search}
                      tone="search"
                    />
                  </div>
                </div>

                <div style={overviewSectionCardStyle}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={trafficSplitTitleStyle}>{t("adsInsights.trafficShareTitle")}</div>
                    <div style={trafficSplitBodyStyle}>{t("adsInsights.trafficShareBody")}</div>
                  </div>
                  <div style={shareMetricGridStyle(isMobile)}>
                    <ShareStatCard
                      label={t("adsInsights.sharePaid")}
                      value={formatPercent(paidShare)}
                      detail={formatNumber(trafficMix?.paidSessions ?? 0)}
                      tone="paid"
                    />
                    <ShareStatCard
                      label={t("adsInsights.shareFree")}
                      value={formatPercent(freeShare)}
                      detail={formatNumber(trafficMix?.freeSessions ?? 0)}
                      tone="free"
                    />
                    <ShareStatCard
                      label={t("adsInsights.shareOrganic")}
                      value={formatPercent(organicSearchShare)}
                      detail={formatNumber(organicSearchSessions)}
                      tone="search"
                    />
                    <ShareStatCard
                      label={t("adsInsights.shareDirect")}
                      value={formatPercent(directShare)}
                      detail={formatNumber(trafficMix?.directSessions ?? 0)}
                      tone="neutral"
                    />
                  </div>
                </div>
              </div>

              <div style={overviewSectionCardStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={trafficSplitTitleStyle}>{t("adsInsights.channelMixTitle")}</div>
                  <div style={trafficSplitBodyStyle}>{t("adsInsights.channelMixBody")}</div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {channelShareRows.length > 0 ? (
                    channelShareRows.map((row) => (
                      <div key={row.key} style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
                            {row.key}
                          </span>
                          <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                            {formatNumber(row.sessions)} · {formatPercent(row.share)}
                          </span>
                        </div>
                        <div style={shareBarTrackStyle}>
                          <div style={shareBarFillStyle(row.share)} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={attributionEmptyStyle}>{t("adsInsights.channelMixEmpty")}</div>
                  )}
                </div>
              </div>

              <div style={overviewSectionCardStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={trafficSplitTitleStyle}>{t("adsInsights.acquisitionTitle")}</div>
                  <div style={trafficSplitBodyStyle}>{t("adsInsights.acquisitionBody")}</div>
                </div>

                <div style={acquisitionGridStyle(isMobile)}>
                  <AcquisitionListCard
                    title={t("adsInsights.acquisitionLandingTitle")}
                    subtitle={t("adsInsights.acquisitionLandingSubtitle")}
                    emptyMessage={t("adsInsights.acquisitionLandingEmpty")}
                    rows={landingPageRows.map((row) => ({
                      key: row.key,
                      label: formatCompactLabel(row.key, "/"),
                      metrics: [
                        `${formatNumber(row.sessions)} ${t("adsInsights.metricSessionsShort")}`,
                        `${formatCurrency(row.revenue, okOverview.currencyCode)} ${t("adsInsights.metricRevenueShort")}`,
                        `${formatPercent(row.bounceRate)} ${t("adsInsights.metricBounceShort")}`,
                      ],
                    }))}
                  />

                  <AcquisitionListCard
                    title={t("adsInsights.acquisitionQueryTitle")}
                    subtitle={t("adsInsights.acquisitionQuerySubtitle")}
                    emptyMessage={t("adsInsights.acquisitionQueryEmpty")}
                    rows={searchQueryRows.map((row) => ({
                      key: row.key,
                      label: formatCompactLabel(row.key),
                      metrics: [
                        `${formatNumber(row.clicks)} ${t("adsInsights.overviewSearchClicks")}`,
                        `${formatPercent(row.ctr)} ${t("adsInsights.trafficSearchCtr")}`,
                        `${formatDecimal(row.position)} ${t("adsInsights.metricPositionShort")}`,
                      ],
                    }))}
                  />

                  <AcquisitionListCard
                    title={t("adsInsights.acquisitionCampaignTitle")}
                    subtitle={t("adsInsights.acquisitionCampaignSubtitle")}
                    emptyMessage={t("adsInsights.acquisitionCampaignEmpty")}
                    rows={(attributionOverview?.campaigns ?? []).slice(0, 5).map((campaign) => ({
                      key: `${campaign.campaignId ?? "ga4"}-${campaign.campaignName}`,
                      label: formatCompactLabel(campaign.campaignName),
                      metrics: [
                        `${formatNumber(campaign.sessions)} ${t("adsInsights.metricSessionsShort")}`,
                        `${formatCurrency(campaign.ga4Revenue, attributionOverview?.currencyCode ?? null)} ${t("adsInsights.metricRevenueShort")}`,
                        `${formatRoas(campaign.roas)} ${t("adsInsights.metricRoasShort")}`,
                      ],
                    }))}
                    footer={
                      <Link to={googleAttributionLink} style={managementGuideLinkStyle(false)}>
                        {t("adsInsights.openTrafficSources")}
                      </Link>
                    }
                  />
                </div>
              </div>

              <div style={overviewSectionCardStyle}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={trafficSplitTitleStyle}>{t("adsInsights.conversionValueTitle")}</div>
                  <div style={trafficSplitBodyStyle}>{t("adsInsights.conversionValueBody")}</div>
                </div>

                <div style={valueMetricGridStyle(isMobile)}>
                  <ValueMetricCard
                    title={t("adsInsights.valueSiteConversionTitle")}
                    value={formatPercent(siteValueSummary?.conversionRate)}
                    footnote={`${formatNumber(siteValueSummary?.purchases ?? 0)} ${t("adsInsights.metricPurchasesShort")}`}
                  />
                  <ValueMetricCard
                    title={t("adsInsights.valueRevenuePerSessionTitle")}
                    value={formatNullableCurrency(siteValueSummary?.revenuePerSession, valueCurrencyCode)}
                    footnote={`${formatNullableCurrency(siteValueSummary?.revenue, valueCurrencyCode)} ${t("adsInsights.metricRevenueShort")}`}
                  />
                  <ValueMetricCard
                    title={t("adsInsights.valueAverageOrderTitle")}
                    value={formatNullableCurrency(siteValueSummary?.averageOrderValue, valueCurrencyCode)}
                    footnote={`${formatNumber(siteValueSummary?.purchases ?? 0)} ${t("adsInsights.metricPurchasesShort")}`}
                  />
                  <ValueMetricCard
                    title={t("adsInsights.valuePaidCostTitle")}
                    value={formatNullableCurrency(paidCostPerPurchase, valueCurrencyCode)}
                    footnote={`${formatNullableCurrency(okOverview.totals.spend, valueCurrencyCode)} ${t("adsInsights.overviewSpend")}`}
                  />
                </div>

                <AcquisitionListCard
                  title={t("adsInsights.valueChannelsTitle")}
                  subtitle={t("adsInsights.valueChannelsBody")}
                  emptyMessage={t("adsInsights.valueChannelsEmpty")}
                  rows={[
                    paidValueSummary
                      ? {
                          key: "paid",
                          label: t("adsInsights.valueChannelPaid"),
                          metrics: [
                            `${formatNumber(paidValueSummary.purchases)} ${t("adsInsights.metricPurchasesShort")}`,
                            `${formatPercent(paidValueSummary.conversionRate)} ${t("adsInsights.metricConvRateShort")}`,
                            `${formatNullableCurrency(paidValueSummary.revenuePerSession, valueCurrencyCode)} ${t("adsInsights.metricValuePerSessionShort")}`,
                            `${formatRoas(paidTrafficRoas)} ${t("adsInsights.metricRoasShort")}`,
                          ],
                        }
                      : null,
                    freeValueSummary
                      ? {
                          key: "free",
                          label: t("adsInsights.valueChannelFree"),
                          metrics: [
                            `${formatNumber(freeValueSummary.purchases)} ${t("adsInsights.metricPurchasesShort")}`,
                            `${formatPercent(freeValueSummary.conversionRate)} ${t("adsInsights.metricConvRateShort")}`,
                            `${formatNullableCurrency(freeValueSummary.revenuePerSession, valueCurrencyCode)} ${t("adsInsights.metricValuePerSessionShort")}`,
                            `${formatNullableCurrency(freeValueSummary.averageOrderValue, valueCurrencyCode)} ${t("adsInsights.metricAovShort")}`,
                          ],
                        }
                      : null,
                    searchValueSummary
                      ? {
                          key: "search",
                          label: t("adsInsights.valueChannelSearch"),
                          metrics: [
                            `${formatNumber(searchValueSummary.purchases)} ${t("adsInsights.metricPurchasesShort")}`,
                            `${formatPercent(searchValueSummary.conversionRate)} ${t("adsInsights.metricConvRateShort")}`,
                            `${formatNullableCurrency(searchValueSummary.revenuePerSession, valueCurrencyCode)} ${t("adsInsights.metricValuePerSessionShort")}`,
                            `${formatNullableCurrency(searchValueSummary.averageOrderValue, valueCurrencyCode)} ${t("adsInsights.metricAovShort")}`,
                          ],
                        }
                      : null,
                  ].filter((row): row is { key: string; label: string; metrics: string[] } => Boolean(row))}
                />
              </div>

              <div style={attributionPreviewStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={trafficSplitTitleStyle}>{t("adsInsights.attributionPreviewTitle")}</div>
                    <div style={trafficSplitBodyStyle}>{t("adsInsights.attributionPreviewBody")}</div>
                  </div>
                  <Link to={googleAttributionLink} style={managementGuideLinkStyle(false)}>
                    {t("adsInsights.openTrafficSources")}
                  </Link>
                </div>

                {attributionOverview ? (
                  <>
                    <div style={attributionMetricGridStyle(isMobile)}>
                      <MetricMini
                        label={t("adsInsights.attributionSessions")}
                        value={formatNumber(attributionOverview.totals.sessions)}
                      />
                      <MetricMini
                        label={t("adsInsights.attributionRevenue")}
                        value={formatCurrency(
                          attributionOverview.totals.ga4Revenue,
                          attributionOverview.currencyCode,
                        )}
                      />
                      <MetricMini
                        label={t("adsInsights.attributionRoas")}
                        value={formatRoas(attributionOverview.totals.roas)}
                      />
                      <MetricMini
                        label={t("adsInsights.attributionLinked")}
                        value={
                          attributionOverview.linked
                            ? t("googleAttribution.linkingOk")
                            : t("googleAttribution.linkingMissing")
                        }
                      />
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textPrimary }}>
                        {t("adsInsights.attributionTopCampaigns")}
                      </div>
                      {attributionOverview.campaigns.slice(0, 3).map((campaign) => (
                        <div key={`${campaign.campaignId ?? "ga4"}-${campaign.campaignName}`} style={attributionRowStyle}>
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: pageColorTokens.textPrimary }}>
                              {campaign.campaignName}
                            </div>
                            <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                              {t("adsInsights.attributionCampaignFootnote", {
                                sessions: formatNumber(campaign.sessions),
                                revenue: formatCurrency(campaign.ga4Revenue, attributionOverview.currencyCode),
                              })}
                            </div>
                          </div>
                          <span style={attributionMatchPillStyle(campaign.matchQuality)}>
                            {attributionMatchLabel(t, campaign.matchQuality)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : attributionNotConfigured ? (
                  <div style={attributionEmptyStyle}>
                    {t("adsInsights.attributionNotConfigured")}
                  </div>
                ) : attributionLoadError ? (
                  <div style={attributionEmptyStyle}>
                    {t("adsInsights.attributionLoadError", { message: attributionLoadError })}
                  </div>
                ) : (
                  <div style={attributionEmptyStyle}>{t("adsInsights.attributionLoading")}</div>
                )}
              </div>

              <div style={platformSummaryGridStyle(isMobile)}>
                {okOverview.platforms.map((item) => (
                  <PlatformSummaryCard
                    key={item.platform}
                    item={item}
                    onOpen={() => setPlatform(item.platform)}
                  />
                ))}
              </div>
            </>
          ) : null}

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

          {!aggregateMode && okData && (
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

          {!aggregateMode && errData && connected && (
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

          {aggregateMode && errOverview && (
            <div
              style={{
                ...hintBoxStyle,
                background: "#fff0ee",
                color: "#d82c0d",
              }}
            >
              {errOverview.message || t("adsInsights.loadError")}
            </div>
          )}

          {loading && aggregateMode && !okOverview && connected && (
            <div style={{ ...hintBoxStyle, textAlign: "center" }}>{t("adsInsights.loadingAll")}</div>
          )}

          {!aggregateMode && loading && !okData && connected && (
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

function PlatformSummaryCard({
  item,
  onOpen,
}: {
  item: AdsOverviewSnapshot["platforms"][number];
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const label =
    item.platform === "google"
      ? t("adsInsights.tabGoogle")
      : item.platform === "tiktok"
        ? t("adsInsights.tabTiktok")
        : t("adsInsights.tabMeta");
  const statusTone = item.connected ? (item.snapshot?.stale ? "pending" : "connected") : "inactive";
  const statusLabel = !item.connected
    ? t("settingsShell.statusNeedsSetup")
    : item.snapshot?.stale
      ? t("adsInsights.snapshotStale")
      : t("settingsShell.statusConnected");

  return (
    <div style={platformSummaryCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: pageColorTokens.textPrimary }}>{label}</div>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {item.accountName || item.accountId || t("adsInsights.overviewNoAccount")}
          </div>
        </div>
        <ConnectionStatusBadge label={statusLabel} tone={statusTone} />
      </div>

      <div style={platformSummaryMetricsStyle}>
        <MetricMini label={t("adsInsights.overviewSpend")} value={formatCurrency(item.totals?.spend ?? 0, item.currencyCode)} />
        <MetricMini label={t("adsInsights.overviewClicks")} value={formatNumber(item.totals?.clicks ?? 0)} />
        <MetricMini label={t("adsInsights.overviewRoas")} value={formatRoas(item.totals?.roas ?? null)} />
        <MetricMini label={t("adsInsights.overviewCampaigns")} value={formatNumber(item.entityCounts.campaign)} />
      </div>

      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
        {item.snapshot
          ? t("adsInsights.snapshotFootnote", {
              start: item.snapshot.dateStart,
              end: item.snapshot.dateEnd,
            })
          : t("adsInsights.snapshotMissing")}
      </div>

      <button type="button" style={secondaryActionStyle(false)} onClick={onOpen}>
        {t("adsInsights.openPlatformDetail")}
      </button>
    </div>
  );
}

function TrafficBreakdownCard({
  title,
  subtitle,
  tone,
  metrics,
  footnote,
}: {
  title: string;
  subtitle: string;
  tone: "paid" | "free" | "search";
  metrics: Array<{ label: string; value: string }>;
  footnote?: string;
}) {
  const borderColor =
    tone === "paid"
      ? pageColorTokens.brandBlueGlow
      : tone === "search"
        ? "#d7d5ff"
        : pageColorTokens.brandGreenGlow;
  const background =
    tone === "paid"
      ? pageColorTokens.brandBlueLight
      : tone === "search"
        ? "#f5f3ff"
        : pageColorTokens.brandGreenLight;

  return (
    <div
      style={{
        ...platformSummaryCardStyle,
        borderColor,
        background,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: pageColorTokens.textPrimary }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: pageColorTokens.textSecondary }}>{subtitle}</div>
      </div>
      <div style={platformSummaryMetricsStyle}>
        {metrics.map((metric) => (
          <MetricMini key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
      {footnote ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{footnote}</div>
      ) : null}
    </div>
  );
}

function TrendMetricCard({
  title,
  value,
  footnote,
  series,
  tone,
}: {
  title: string;
  value: string;
  footnote: string;
  series: TrafficTrendPoint[];
  tone: "paid" | "free" | "search";
}) {
  return (
    <div style={trendMetricCardStyle}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{title}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: pageColorTokens.textPrimary }}>{value}</div>
      </div>
      <MiniSparkline series={series} tone={tone} />
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{footnote}</div>
    </div>
  );
}

function ValueMetricCard({
  title,
  value,
  footnote,
}: {
  title: string;
  value: string;
  footnote: string;
}) {
  return (
    <div style={valueMetricCardStyle}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{title}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: pageColorTokens.textPrimary }}>{value}</div>
      </div>
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{footnote}</div>
    </div>
  );
}

function ShareStatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "paid" | "free" | "search" | "neutral";
}) {
  const accent =
    tone === "paid"
      ? pageColorTokens.brandBlue
      : tone === "free"
        ? pageColorTokens.brandGreenDeep
        : tone === "search"
          ? "#7b61ff"
          : pageColorTokens.textSecondary;

  return (
    <div style={{ ...shareStatCardStyle, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: pageColorTokens.textPrimary }}>{value}</div>
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{detail}</div>
    </div>
  );
}

function MiniSparkline({
  series,
  tone,
}: {
  series: TrafficTrendPoint[];
  tone: "paid" | "free" | "search";
}) {
  const points = series.slice(-14);
  const max = Math.max(...points.map((item) => item.value), 0);
  const color =
    tone === "paid"
      ? pageColorTokens.brandBlue
      : tone === "search"
        ? "#7b61ff"
        : pageColorTokens.brandGreenDeep;

  return (
    <div style={miniSparklineTrackStyle}>
      {points.length > 0 ? (
        points.map((point) => (
          <span
            key={point.date}
            style={{
              ...miniSparklineBarStyle,
              background: color,
              opacity: 0.9,
              height: `${max > 0 ? Math.max(12, (point.value / max) * 52) : 12}px`,
            }}
            title={`${point.date}: ${point.value}`}
          />
        ))
      ) : (
        <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>—</span>
      )}
    </div>
  );
}

function AcquisitionListCard({
  title,
  subtitle,
  rows,
  emptyMessage,
  footer,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ key: string; label: string; metrics: string[] }>;
  emptyMessage: string;
  footer?: ReactNode;
}) {
  return (
    <div style={acquisitionCardStyle}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>{title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: pageColorTokens.textSecondary }}>{subtitle}</div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {rows.length > 0 ? (
          rows.map((row) => (
            <div key={row.key} style={acquisitionRowStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>{row.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {row.metrics.map((metric) => (
                  <span key={`${row.key}-${metric}`} style={acquisitionMetricPillStyle}>
                    {metric}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={attributionEmptyStyle}>{emptyMessage}</div>
        )}
      </div>

      {footer ? <div>{footer}</div> : null}
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 11, color: pageColorTokens.textSecondary }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>{value}</span>
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

const managementGuideCardStyle = {
  display: "grid",
  gap: 12,
  padding: "14px 16px",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const managementGuideTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const managementGuideBodyStyle = {
  fontSize: 13,
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const managementGuideLinkStyle = (primary: boolean) => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 999,
  border: `1px solid ${primary ? pageColorTokens.brandBlue : pageColorTokens.borderSubtle}`,
  background: primary ? pageColorTokens.brandBlueLight : pageColorTokens.surface,
  color: primary ? pageColorTokens.brandBlueDark : pageColorTokens.textPrimary,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
});

const legacyPanelHintStyle = {
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px dashed ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const trafficSplitStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const trafficSplitTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const trafficSplitBodyStyle = {
  fontSize: 13,
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const trafficBreakdownGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: 12,
});

const overviewSectionGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
  gap: 12,
});

const overviewSectionCardStyle = {
  display: "grid",
  gap: 16,
  padding: "16px",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
};

const trendCardGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: 12,
});

const trendMetricCardStyle = {
  display: "grid",
  gap: 10,
  padding: "12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const valueMetricGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
  gap: 12,
});

const valueMetricCardStyle = {
  display: "grid",
  gap: 8,
  padding: "12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const miniSparklineTrackStyle = {
  display: "flex",
  alignItems: "end",
  gap: 4,
  minHeight: 56,
};

const miniSparklineBarStyle = {
  flex: "1 1 0",
  minWidth: 4,
  borderRadius: 999,
};

const shareMetricGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
  gap: 12,
});

const shareStatCardStyle = {
  display: "grid",
  gap: 6,
  padding: "12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const shareBarTrackStyle = {
  width: "100%",
  height: 8,
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  overflow: "hidden",
};

function shareBarFillStyle(share: number) {
  return {
    width: `${Math.max(4, Math.min(100, share * 100))}%`,
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #4f46e5 0%, #60a5fa 100%)",
  };
}

const acquisitionGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: 12,
});

const acquisitionCardStyle = {
  display: "grid",
  gap: 12,
  padding: "14px",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const acquisitionRowStyle = {
  display: "grid",
  gap: 8,
  padding: "10px 12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
};

const acquisitionMetricPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: 11,
  fontWeight: 600,
};

const attributionPreviewStyle = {
  display: "grid",
  gap: 16,
  padding: "16px",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

const attributionMetricGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
  gap: 12,
});

const attributionRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
};

const attributionEmptyStyle = {
  padding: "12px 14px",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px dashed ${pageColorTokens.borderSubtle}`,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surface,
  fontSize: 13,
  lineHeight: 1.5,
};

function attributionMatchPillStyle(quality: string) {
  const palette =
    quality === "linked"
      ? {
          background: pageColorTokens.brandGreenLight,
          color: pageColorTokens.brandGreenDeep,
          borderColor: pageColorTokens.brandGreenGlow,
        }
      : quality === "name_only"
        ? {
            background: "#fff7e0",
            color: "#8a6d00",
            borderColor: "rgba(185, 137, 0, 0.18)",
          }
        : {
            background: pageColorTokens.surfaceMuted,
            color: pageColorTokens.textSecondary,
            borderColor: pageColorTokens.borderSubtle,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${palette.borderColor}`,
    background: palette.background,
    color: palette.color,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  };
}

const platformSummaryGridStyle = (isMobile: boolean) => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: 12,
});

const platformSummaryCardStyle = {
  display: "grid",
  gap: 12,
  padding: "16px",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
};

const platformSummaryMetricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

function trafficPillStyle(kind: "paid" | "free") {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 999,
    background: kind === "paid" ? pageColorTokens.brandBlueLight : pageColorTokens.brandGreenLight,
    color: kind === "paid" ? pageColorTokens.brandBlueDark : pageColorTokens.brandGreenDeep,
    fontSize: 12,
    fontWeight: 700,
  };
}

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
