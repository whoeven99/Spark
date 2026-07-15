import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useLoaderData, useLocation, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { AdsInsightsTreeTable } from "../component/adsInsights/AdsInsightsTreeTable";
import { AdsInsightsDeepTable } from "../component/adsInsights/AdsInsightsDeepTable";
import { MetaAdsConnectPanel } from "../component/adsInsights/MetaAdsConnectPanel";
import type {
  AdsInsightsApiError,
  AdsInsightsApiOk,
  AdsInsightsPlatform,
  AdsInsightsRangeDays,
  AdsInsightsView,
} from "../component/adsInsights/types";
import type { AdsInsightsPageLoaderData } from "../app.settings.ads-insights";

type InsightsFetcherData = AdsInsightsApiOk | AdsInsightsApiError;

function parseView(raw: string | null): AdsInsightsView {
  if (raw === "keywords" || raw === "searchTerms" || raw === "creatives") return raw;
  return "structure";
}

export function AdsInsightsPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loaderData = useLoaderData<AdsInsightsPageLoaderData>();
  const metricsFetcher = useFetcher<InsightsFetcherData>();

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

  const connections = loaderData.connections;
  const connected =
    platform === "meta"
      ? connections.meta.connected
      : platform === "google"
        ? connections.google.connected
        : connections.tiktok.connected;

  // Meta/TikTok 无关键词与搜索词；切到不支持视图时回退 structure。
  useEffect(() => {
    if (platform !== "google" && (view === "keywords" || view === "searchTerms")) {
      setView("structure");
    }
  }, [platform, view]);

  const loadMetrics = useCallback(() => {
    if (platform === "meta" && !connections.meta.connected) return;
    if (platform === "google" && !connections.google.connected) return;
    if (platform === "tiktok" && !connections.tiktok.connected) return;

    const params = new URLSearchParams(location.search);
    params.set("platform", platform);
    params.set("range", String(rangeDays));
    params.set("view", view);
    metricsFetcher.load(`/api/ads-insights?${params.toString()}`);
  }, [
    connections.google.connected,
    connections.meta.connected,
    connections.tiktok.connected,
    location.search,
    metricsFetcher,
    platform,
    rangeDays,
    view,
  ]);

  useEffect(() => {
    loadMetrics();
    // 仅在平台/日期/视图变化时拉取；fetcher 自身不应进入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    platform,
    rangeDays,
    view,
    connections.meta.connected,
    connections.google.connected,
    connections.tiktok.connected,
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
  const okData = data && data.ok ? data : null;
  const errData = data && !data.ok ? data : null;

  const catalogLink = `/app/ads-catalog${locationSearch}`;

  const deepRows =
    view === "keywords"
      ? okData?.keywords ?? []
      : view === "searchTerms"
        ? okData?.searchTerms ?? []
        : view === "creatives"
          ? okData?.creatives ?? []
          : [];

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("adsInsights.pageTitle")}
        subtitle={t("adsInsights.pageSubtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
        <SegmentedPageTabs
          activeTab={platform}
          items={tabs}
          onTabChange={setPlatform}
          ariaLabel={t("adsInsights.platformTabsAria")}
          mobileFullWidth={isMobile}
        />

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
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
            }}
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

        {platform === "meta" && (
          <MetaAdsConnectPanel
            connected={connections.meta.connected}
            adAccountId={connections.meta.adAccountId}
            adAccountName={connections.meta.adAccountName}
            pendingAccounts={connections.meta.pendingAccounts}
            locationSearch={locationSearch}
            onChanged={loadMetrics}
          />
        )}

        {platform === "google" && !connections.google.connected && (
          <div style={hintBoxStyle}>
            <div>{t("adsInsights.googleNotConnected")}</div>
            <Link to={catalogLink} style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600 }}>
              {t("adsInsights.goAdsCatalog")}
            </Link>
          </div>
        )}

        {platform === "tiktok" && !connections.tiktok.connected && (
          <div style={hintBoxStyle}>
            <div>{t("adsInsights.tiktokNotConnected")}</div>
            <Link to={catalogLink} style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600 }}>
              {t("adsInsights.goAdsCatalog")}
            </Link>
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
                  {t("adsInsights.tableTitle", { accountId: okData.accountId })}
                </div>
                <div style={pageHintTextStyle}>
                  {t("adsInsights.tableSubtitle", {
                    start: okData.dateStart,
                    end: okData.dateEnd,
                  })}
                </div>
              </div>
            </div>
            {view === "structure" ? (
              <AdsInsightsTreeTable
                campaigns={okData.campaigns}
                currencyCode={okData.currencyCode}
              />
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
