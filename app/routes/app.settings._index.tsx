import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import { useFeatureView } from "../lib/featureTrack";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./page/pageUiStyles";
import { DestinationActionGrid, destinationSurfaceStyle } from "./component/shared/DestinationPage";
import {
  getFacebookCatalogCredential,
  getGoogleAdsCredential,
  getGoogleAdsPending,
  getGoogleMerchantCredential,
  getGoogleMerchantPending,
  getMetaAdsCredential,
  getMetaAdsPending,
  getMetaCatalogPending,
  getTiktokAdsInsightsCredential,
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
} from "../server/adsCatalog/credentialStore.server";
import {
  buildAdsOverview,
  type AdsOverviewPlatform,
  type AdsOverviewReview,
} from "../server/adsInsights/overview.server";
import { getGa4Credential, getGa4Pending } from "../server/googleAnalytics/ga4Credentials.server";
import { getGscCredential, getGscPending } from "../server/googleSearchConsole/gscCredentials.server";
import { getFedexCredential, getSfCredential } from "../server/logisticsCredentialStore.server";
import { hasReadReportsScope } from "../lib/shopifyReports";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const developerTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());

  const [
    metaCatalog,
    googleMerchant,
    googleMerchantPending,
    tiktokCatalog,
    tiktokCatalogPending,
    metaCatalogPending,
    metaAds,
    metaAdsPending,
    googleAds,
    googleAdsPending,
    tiktokAds,
    ga4,
    ga4Pending,
    gsc,
    gscPending,
    fedex,
    sf,
    connectionOverview,
  ] = await Promise.all([
    getFacebookCatalogCredential(shop),
    getGoogleMerchantCredential(shop),
    getGoogleMerchantPending(shop),
    getTiktokCatalogCredential(shop),
    getTiktokCatalogPending(shop),
    getMetaCatalogPending(shop),
    getMetaAdsCredential(shop),
    getMetaAdsPending(shop),
    getGoogleAdsCredential(shop),
    getGoogleAdsPending(shop),
    getTiktokAdsInsightsCredential(shop),
    getGa4Credential(shop),
    getGa4Pending(shop),
    getGscCredential(shop),
    getGscPending(shop),
    getFedexCredential(shop),
    getSfCredential(shop),
    buildAdsOverview({ shop, rangeDays: 7 }).catch((error) => {
      console.error("[settings._index] buildAdsOverview failed:", error);
      return null;
    }),
  ]);

  return {
    summaries: {
      google: {
        merchantConnected: Boolean(googleMerchant),
        merchantPending: Boolean(googleMerchantPending?.accounts.length),
        adsConnected: Boolean(googleAds),
        adsPending: Boolean(googleAdsPending?.accounts.length),
        developerTokenConfigured,
        ga4Connected: Boolean(ga4?.properties.length),
        ga4Pending: Boolean(ga4Pending?.properties.length),
        ga4PropertyCount: ga4?.properties.length ?? 0,
        gscConnected: Boolean(gsc),
        gscPending: Boolean(gscPending?.sites.length),
        gscSiteUrl: gsc?.siteUrl ?? null,
      },
      meta: {
        catalogConnected: Boolean(metaCatalog),
        catalogPending: Boolean(metaCatalogPending?.accounts.length),
        adsConnected: Boolean(metaAds),
        adsPending: Boolean(metaAdsPending?.accounts.length),
      },
      tiktok: {
        catalogConnected: Boolean(tiktokCatalog),
        catalogPending: Boolean(tiktokCatalogPending?.accounts.length),
        adsConnected: Boolean(tiktokAds),
      },
      logistics: {
        fedexConfigured: Boolean(fedex),
        sfConfigured: Boolean(sf),
        configuredCount: [fedex, sf].filter(Boolean).length,
        totalCount: 2,
      },
      shopifyReports: {
        hasReadReports: hasReadReportsScope(session.scope),
      },
    },
    connectionOverview,
  };
};

type SettingsModuleId = "data" | "shopifyReports" | "feedback";

type SettingsModule = {
  id: SettingsModuleId;
  to: string;
  labelKey: string;
  descKey: string;
};

type SettingsSection = {
  titleKey: string;
  subtitleKey: string;
  modules: SettingsModule[];
};

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    titleKey: "settingsShell.sectionOperationsTitle",
    subtitleKey: "settingsShell.sectionOperationsSubtitle",
    modules: [
      {
        id: "data",
        to: "/app/settings/data",
        labelKey: "settingsShell.navData",
        descKey: "settingsShell.descData",
      },
      {
        id: "shopifyReports",
        to: "/app/settings/shopify-reports",
        labelKey: "settingsShell.navShopifyReports",
        descKey: "settingsShell.descShopifyReports",
      },
    ],
  },
  {
    titleKey: "settingsShell.sectionSupportTitle",
    subtitleKey: "settingsShell.sectionSupportSubtitle",
    modules: [
      {
        id: "feedback",
        to: "/app/settings/feedback",
        labelKey: "settingsShell.navFeedback",
        descKey: "settingsShell.descFeedback",
      },
    ],
  },
];

function buildModuleSummary(
  moduleId: SettingsModuleId,
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  switch (moduleId) {
    case "data":
      return {
        badge: t("settingsShell.statusTool"),
        meta: t("settingsShell.summaryDataTools"),
      };
    case "shopifyReports":
      return {
        badge: summaries.shopifyReports.hasReadReports
          ? t("settingsShell.statusReady")
          : t("settingsShell.statusNeedsSetup"),
        meta: summaries.shopifyReports.hasReadReports
          ? t("settingsShell.summaryShopifyReportsReady")
          : t("settingsShell.summaryShopifyReportsNeedsAuth"),
      };
    case "feedback":
      return {
        badge: t("settingsShell.statusSupport"),
        meta: t("settingsShell.summaryFeedback"),
      };
    default: {
      const _exhaustive: never = moduleId;
      return _exhaustive;
    }
  }
}

type ConnectionCapabilityTone = "ready" | "pending" | "needs_setup" | "attention";

type ConnectionCapability = {
  label: string;
  value: string;
  tone: ConnectionCapabilityTone;
};

type ConnectionLink = {
  label: string;
  to: string;
  tone?: "primary" | "secondary";
};

type ConnectionChannelCardProps = {
  title: string;
  description: string;
  badge: string;
  badgeTone: "ready" | "partial" | "pending" | "needs_setup";
  meta: string;
  capabilities: ConnectionCapability[];
  links: ConnectionLink[];
  onNavigate: (to: string) => void;
};

type ConnectionChannelCardData = Omit<ConnectionChannelCardProps, "onNavigate">;

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function minutesSince(iso: string, baseIso: string): number {
  return Math.max(0, Math.round((Date.parse(baseIso) - Date.parse(iso)) / 60000));
}

function buildPlatformSnapshotCapability(params: {
  t: ReturnType<typeof useTranslation>["t"];
  overview: Awaited<ReturnType<typeof loader>>["connectionOverview"];
  platform: AdsOverviewPlatform["platform"];
}): ConnectionCapability | null {
  const platform = params.overview?.platforms.find((item) => item.platform === params.platform);
  if (!platform) return null;
  return {
    label: params.t("settingsShell.platformSnapshot"),
    value: platform.snapshot
      ? platform.snapshot.stale
        ? params.t("settingsShell.snapshotStale")
        : params.t("settingsShell.snapshotFresh", {
            minutes: minutesSince(platform.snapshot.fetchedAt, params.overview!.generatedAt),
          })
      : params.t("settingsShell.snapshotNone"),
    tone: platform.snapshot ? (platform.snapshot.stale ? "attention" : "ready") : "needs_setup",
  };
}

function buildPlatformHealthCapability(params: {
  t: ReturnType<typeof useTranslation>["t"];
  overview: Awaited<ReturnType<typeof loader>>["connectionOverview"];
  platform: AdsOverviewPlatform["platform"];
}): ConnectionCapability | null {
  const issueCount =
    params.overview?.health.filter((item) => item.platform === params.platform && item.state !== "ok").length ?? 0;
  return {
    label: params.t("settingsShell.platformHealth"),
    value:
      issueCount > 0
        ? params.t("settingsShell.platformHealthIssues", { count: issueCount })
        : params.t("settingsShell.platformHealthOk"),
    tone: issueCount > 0 ? "attention" : "ready",
  };
}

function buildPlatformReadinessCapability(params: {
  t: ReturnType<typeof useTranslation>["t"];
  overview: Awaited<ReturnType<typeof loader>>["connectionOverview"];
  channel: AdsOverviewReview["channel"];
}): ConnectionCapability | null {
  const review = params.overview?.reviews.find((item) => item.channel === params.channel);
  if (!review || review.total <= 0) return null;
  if (review.disapproved > 0) {
    return {
      label: params.t("settingsShell.platformReadiness"),
      value: params.t("settingsShell.platformReadinessDisapproved", { count: review.disapproved }),
      tone: "attention",
    };
  }
  if (review.pending > 0) {
    return {
      label: params.t("settingsShell.platformReadiness"),
      value: params.t("settingsShell.platformReadinessPending", { count: review.pending }),
      tone: "pending",
    };
  }
  return {
    label: params.t("settingsShell.platformReadiness"),
    value: params.t("settingsShell.platformReadinessHealthy"),
    tone: "ready",
  };
}

function buildGoogleSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  connectionOverview: Awaited<ReturnType<typeof loader>>["connectionOverview"],
  t: ReturnType<typeof useTranslation>["t"],
): ConnectionChannelCardData {
  const capabilities: ConnectionCapability[] = [
    {
      label: t("settingsShell.googleCapabilityMerchant"),
      value: summaries.google.merchantConnected
        ? t("settingsShell.statusConnected")
        : summaries.google.merchantPending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.google.merchantConnected
        ? "ready"
        : summaries.google.merchantPending
          ? "pending"
          : "needs_setup",
    },
    {
      label: t("settingsShell.googleCapabilityAds"),
      value: summaries.google.adsConnected
        ? summaries.google.developerTokenConfigured
          ? t("settingsShell.statusReady")
          : t("settingsShell.statusPartial")
        : summaries.google.adsPending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.google.adsConnected
        ? summaries.google.developerTokenConfigured
          ? "ready"
          : "attention"
        : summaries.google.adsPending
          ? "pending"
          : "needs_setup",
    },
    {
      label: t("settingsShell.googleCapabilityGa4"),
      value: summaries.google.ga4Connected
        ? t("settingsShell.summaryGa4Properties", {
            count: summaries.google.ga4PropertyCount,
          })
        : summaries.google.ga4Pending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.google.ga4Connected
        ? "ready"
        : summaries.google.ga4Pending
          ? "pending"
          : "needs_setup",
    },
    {
      label: t("settingsShell.googleCapabilityGsc"),
      value: summaries.google.gscConnected
        ? summaries.google.gscSiteUrl ?? t("settingsShell.statusConnected")
        : summaries.google.gscPending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.google.gscConnected
        ? "ready"
        : summaries.google.gscPending
          ? "pending"
          : "needs_setup",
    },
    buildPlatformSnapshotCapability({ t, overview: connectionOverview, platform: "google" }),
    buildPlatformHealthCapability({ t, overview: connectionOverview, platform: "google" }),
    buildPlatformReadinessCapability({ t, overview: connectionOverview, channel: "gmc" }),
  ].filter(Boolean) as ConnectionCapability[];

  const readyCount = capabilities.filter((item) => item.tone === "ready").length;
  const hasPending = capabilities.some((item) => item.tone === "pending");
  const hasAttention = capabilities.some((item) => item.tone === "attention");

  return {
    title: t("settingsShell.channelGoogleTitle"),
    description: t("settingsShell.channelGoogleSubtitle"),
    badge:
      readyCount === capabilities.length
        ? t("settingsShell.statusReady")
        : readyCount > 0 || hasAttention
          ? t("settingsShell.statusPartial")
          : hasPending
            ? t("settingsShell.statusPending")
            : t("settingsShell.statusNeedsSetup"),
    badgeTone:
      readyCount === capabilities.length
        ? "ready"
        : readyCount > 0 || hasAttention
          ? "partial"
          : hasPending
            ? "pending"
            : "needs_setup",
    meta: hasAttention
      ? t("settingsShell.summaryAdsCreateNeedsToken")
      : t("settingsShell.summaryChannelCoverage", {
          connected: readyCount,
          total: capabilities.length,
        }),
    capabilities,
    links: [
      {
        label: t("settingsShell.openChannelDetail"),
        to: "/app/settings/connections/google",
        tone: "primary",
      },
      {
        label: t("settingsShell.googleManageAdsCatalog"),
        to: "/app/ads-catalog?tab=credentials",
      },
      {
        label: t("settingsShell.googleManageAnalytics"),
        to: "/app/settings/google-analytics",
      },
      {
        label: t("settingsShell.googleManageSearchConsole"),
        to: "/app/settings/google-search-console",
      },
    ] satisfies ConnectionLink[],
  };
}

function buildMetaSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  connectionOverview: Awaited<ReturnType<typeof loader>>["connectionOverview"],
  t: ReturnType<typeof useTranslation>["t"],
): ConnectionChannelCardData {
  const capabilities: ConnectionCapability[] = [
    {
      label: t("settingsShell.metaCapabilityCatalog"),
      value: summaries.meta.catalogConnected
        ? t("settingsShell.statusConnected")
        : summaries.meta.catalogPending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.meta.catalogConnected
        ? "ready"
        : summaries.meta.catalogPending
          ? "pending"
          : "needs_setup",
    },
    {
      label: t("settingsShell.metaCapabilityAds"),
      value: summaries.meta.adsConnected
        ? t("settingsShell.statusConnected")
        : summaries.meta.adsPending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.meta.adsConnected
        ? "ready"
        : summaries.meta.adsPending
          ? "pending"
          : "needs_setup",
    },
    buildPlatformSnapshotCapability({ t, overview: connectionOverview, platform: "meta" }),
    buildPlatformHealthCapability({ t, overview: connectionOverview, platform: "meta" }),
    buildPlatformReadinessCapability({ t, overview: connectionOverview, channel: "meta" }),
  ].filter(Boolean) as ConnectionCapability[];
  const readyCount = capabilities.filter((item) => item.tone === "ready").length;
  const hasPending = capabilities.some((item) => item.tone === "pending");
  return {
    title: t("settingsShell.channelMetaTitle"),
    description: t("settingsShell.channelMetaSubtitle"),
    badge:
      readyCount === capabilities.length
        ? t("settingsShell.statusReady")
        : readyCount > 0
          ? t("settingsShell.statusPartial")
          : hasPending
            ? t("settingsShell.statusPending")
            : t("settingsShell.statusNeedsSetup"),
    badgeTone:
      readyCount === capabilities.length
        ? "ready"
        : readyCount > 0
          ? "partial"
          : hasPending
            ? "pending"
            : "needs_setup",
    meta: t("settingsShell.summaryChannelCoverage", {
      connected: readyCount,
      total: capabilities.length,
    }),
    capabilities,
    links: [
      {
        label: t("settingsShell.openChannelDetail"),
        to: "/app/settings/connections/meta",
        tone: "primary",
      },
      {
        label: t("settingsShell.metaManageCatalog"),
        to: "/app/ads-catalog?tab=credentials",
      },
    ] satisfies ConnectionLink[],
  };
}

function buildTiktokSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  connectionOverview: Awaited<ReturnType<typeof loader>>["connectionOverview"],
  t: ReturnType<typeof useTranslation>["t"],
): ConnectionChannelCardData {
  const capabilities: ConnectionCapability[] = [
    {
      label: t("settingsShell.tiktokCapabilityCatalog"),
      value: summaries.tiktok.catalogConnected
        ? t("settingsShell.statusConnected")
        : summaries.tiktok.catalogPending
          ? t("settingsShell.statusPending")
          : t("settingsShell.statusNeedsSetup"),
      tone: summaries.tiktok.catalogConnected
        ? "ready"
        : summaries.tiktok.catalogPending
          ? "pending"
          : "needs_setup",
    },
    {
      label: t("settingsShell.tiktokCapabilityAds"),
      value: summaries.tiktok.adsConnected
        ? t("settingsShell.statusConnected")
        : t("settingsShell.statusNeedsSetup"),
      tone: summaries.tiktok.adsConnected ? "ready" : "needs_setup",
    },
    buildPlatformSnapshotCapability({ t, overview: connectionOverview, platform: "tiktok" }),
    buildPlatformHealthCapability({ t, overview: connectionOverview, platform: "tiktok" }),
  ].filter(Boolean) as ConnectionCapability[];
  const readyCount = capabilities.filter((item) => item.tone === "ready").length;
  const hasPending = capabilities.some((item) => item.tone === "pending");
  return {
    title: t("settingsShell.channelTiktokTitle"),
    description: t("settingsShell.channelTiktokSubtitle"),
    badge:
      readyCount === capabilities.length
        ? t("settingsShell.statusReady")
        : readyCount > 0
          ? t("settingsShell.statusPartial")
          : hasPending
            ? t("settingsShell.statusPending")
            : t("settingsShell.statusNeedsSetup"),
    badgeTone:
      readyCount === capabilities.length
        ? "ready"
        : readyCount > 0
          ? "partial"
          : hasPending
            ? "pending"
            : "needs_setup",
    meta: t("settingsShell.summaryChannelCoverage", {
      connected: readyCount,
      total: capabilities.length,
    }),
    capabilities,
    links: [
      {
        label: t("settingsShell.openChannelDetail"),
        to: "/app/settings/connections/tiktok",
        tone: "primary",
      },
      {
        label: t("settingsShell.tiktokManageCatalog"),
        to: "/app/ads-catalog?tab=credentials",
      },
    ] satisfies ConnectionLink[],
  };
}

function buildLogisticsSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  t: ReturnType<typeof useTranslation>["t"],
): ConnectionChannelCardData {
  return {
    title: t("settingsShell.channelLogisticsTitle"),
    description: t("settingsShell.channelLogisticsSubtitle"),
    badge:
      summaries.logistics.configuredCount === summaries.logistics.totalCount
        ? t("settingsShell.statusReady")
        : summaries.logistics.configuredCount > 0
          ? t("settingsShell.statusPartial")
          : t("settingsShell.statusNeedsSetup"),
    badgeTone:
      summaries.logistics.configuredCount === summaries.logistics.totalCount
        ? "ready"
        : summaries.logistics.configuredCount > 0
          ? "partial"
          : "needs_setup",
    meta: t("settingsShell.summaryProvidersConfigured", {
      configured: summaries.logistics.configuredCount,
      total: summaries.logistics.totalCount,
    }),
    capabilities: [
      {
        label: "FedEx",
        value: summaries.logistics.fedexConfigured
          ? t("settingsShell.statusConnected")
          : t("settingsShell.statusNeedsSetup"),
        tone: summaries.logistics.fedexConfigured ? "ready" : "needs_setup",
      },
      {
        label: "SF Express",
        value: summaries.logistics.sfConfigured
          ? t("settingsShell.statusConnected")
          : t("settingsShell.statusNeedsSetup"),
        tone: summaries.logistics.sfConfigured ? "ready" : "needs_setup",
      },
    ] satisfies ConnectionCapability[],
    links: [
      {
        label: t("settingsShell.logisticsManageConnections"),
        to: "/app/settings/logistics",
        tone: "primary",
      },
    ] satisfies ConnectionLink[],
  };
}

export default function SettingsIndex() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const { summaries, connectionOverview } = useLoaderData<typeof loader>();
  useFeatureView("settings");

  const connectionCards = [
    buildGoogleSummary(summaries, connectionOverview, t),
    buildMetaSummary(summaries, connectionOverview, t),
    buildTiktokSummary(summaries, connectionOverview, t),
    buildLogisticsSummary(summaries, t),
  ];
  const connectedPlatforms = connectionOverview?.platforms.filter((item) => item.connected).length ?? 0;
  const freshSnapshots =
    connectionOverview?.platforms.filter((item) => item.connected && item.snapshot && !item.snapshot.stale)
      .length ?? 0;
  const healthAttentionCount =
    connectionOverview?.health.filter((item) => item.state !== "ok").length ?? 0;
  const disapprovedProducts =
    connectionOverview?.reviews.reduce((sum, review) => sum + review.disapproved, 0) ?? 0;

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.title")}
        subtitle={t("settingsShell.subtitle")}
        titleBarTitle={t("nav.settings")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app"
      />

      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.sectionConnectionsHubTitle")}
          subtitle={t("settingsShell.sectionConnectionsHubSubtitle")}
          badge={<span style={hubBadgeStyle}>{t("settingsShell.sectionConnectionsHubBadge")}</span>}
        />
        <div style={hubHintStyle}>{t("settingsShell.sectionConnectionsHubFootnote")}</div>
        {connectionOverview ? (
          <div style={diagnosticsOverviewStyle}>
            <div style={diagnosticsHeaderStyle}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={diagnosticsTitleStyle}>{t("settingsShell.diagnosticsTitle")}</div>
                <div style={diagnosticsSubtitleStyle}>{t("settingsShell.diagnosticsSubtitle")}</div>
              </div>
              <span style={hubBadgeStyle}>{t("settingsShell.diagnosticsBadge")}</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
                gap: "0.75rem",
              }}
            >
              <MetricCard
                label={t("settingsShell.metricPlatforms")}
                value={t("settingsShell.metricPlatformsValue", {
                  connected: connectedPlatforms,
                  total: connectionOverview.platforms.length,
                })}
              />
              <MetricCard
                label={t("settingsShell.metricSnapshots")}
                value={t("settingsShell.metricSnapshotsValue", {
                  ready: freshSnapshots,
                  total: connectedPlatforms,
                })}
              />
              <MetricCard
                label={t("settingsShell.metricHealth")}
                value={String(healthAttentionCount)}
              />
              <MetricCard
                label={t("settingsShell.metricReadiness")}
                value={formatInteger(disapprovedProducts)}
              />
            </div>
            <div style={diagnosticsSummaryRowStyle}>
              <div style={diagnosticsHeadlineStyle}>
                {healthAttentionCount > 0 || disapprovedProducts > 0
                  ? t("settingsShell.diagnosticsSummaryAttention", {
                      health: healthAttentionCount,
                      products: formatInteger(disapprovedProducts),
                    })
                  : t("settingsShell.diagnosticsSummaryHealthy", {
                      connected: connectedPlatforms,
                      total: connectionOverview.platforms.length,
                    })}
              </div>
              <div style={diagnosticsSummaryCaptionStyle}>{t("settingsShell.channelSectionSubtitle")}</div>
            </div>
          </div>
        ) : (
          <div style={diagnosticsEmptyStyle}>{t("settingsShell.diagnosticsUnavailable")}</div>
        )}

        <div style={channelSectionStyle}>
          <div style={diagnosticsTitleStyle}>{t("settingsShell.channelSectionTitle")}</div>
          <div style={diagnosticsSubtitleStyle}>{t("settingsShell.channelSectionSubtitle")}</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: "0.85rem",
            }}
          >
            {connectionCards.map((card) => (
              <ConnectionChannelCard
                key={card.title}
                {...card}
                onNavigate={navigate}
              />
            ))}
          </div>
        </div>
      </PageSurface>

      {SETTINGS_SECTIONS.map((section) => (
        <PageSurface key={section.titleKey}>
          <PageSectionHeader
            title={t(section.titleKey)}
            subtitle={t(section.subtitleKey)}
          />
          <DestinationActionGrid
            isMobile={isMobile}
            actions={section.modules.map((mod) => ({
              ...buildModuleSummary(mod.id, summaries, t),
              key: mod.to,
              title: t(mod.labelKey),
              detail: t(mod.descKey),
              onClick: () => navigate(mod.to),
            }))}
          />
        </PageSurface>
      ))}
    </div>
  );
}

function ConnectionChannelCard({
  title,
  description,
  badge,
  badgeTone,
  meta,
  capabilities = [],
  links = [],
  onNavigate,
}: ConnectionChannelCardProps) {
  return (
    <div style={connectionCardStyle}>
      <div style={connectionHeaderStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={connectionTitleStyle}>{title}</div>
          <div style={connectionDescriptionStyle}>{description}</div>
        </div>
        <span style={channelBadgeStyle(badgeTone)}>{badge}</span>
      </div>
      <div style={connectionMetaStyle}>{meta}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {Array.isArray(capabilities) ? capabilities.map((capability) => (
          <div key={capability.label} style={capabilityRowStyle}>
            <span style={capabilityLabelStyle}>{capability.label}</span>
            <span style={capabilityValueStyle(capability.tone)}>{capability.value}</span>
          </div>
        )) : null}
      </div>
      <div style={connectionLinksStyle}>
        {Array.isArray(links) ? links.map((link) => (
          <button
            key={link.to}
            type="button"
            onClick={() => onNavigate(link.to)}
            style={connectionLinkButtonStyle(link.tone === "primary")}
          >
            {link.label}
          </button>
        )) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={diagnosticMetricCardStyle}>
      <div style={diagnosticMetricLabelStyle}>{label}</div>
      <div style={diagnosticMetricValueStyle}>{value}</div>
    </div>
  );
}

const hubBadgeStyle: CSSProperties = {
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.brandBlueDark,
  background: pageColorTokens.brandBlueLight,
  border: `1px solid ${pageColorTokens.brandBlueGlow}`,
};

const hubHintStyle: CSSProperties = {
  marginBottom: "0.85rem",
  fontSize: 12,
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const connectionCardStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  padding: "1rem",
  display: "grid",
  gap: "0.85rem",
};

const connectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.8rem",
};

const connectionTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const connectionDescriptionStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: pageColorTokens.textBody,
};

const connectionMetaStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
};

const capabilityRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.8rem",
  padding: "0.55rem 0.7rem",
  borderRadius: 10,
  background: pageColorTokens.surfaceMuted,
};

const capabilityLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: pageColorTokens.textBody,
};

const capabilityValueStyle = (tone: ConnectionCapabilityTone): CSSProperties => ({
  fontSize: 12,
  fontWeight: 700,
  color:
    tone === "ready"
      ? pageColorTokens.brandGreenDark
      : tone === "pending"
        ? "#8a5a00"
        : tone === "attention"
          ? pageColorTokens.brandBlueDark
          : pageColorTokens.textSecondary,
});

const connectionLinksStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem",
};

const connectionLinkButtonStyle = (primary: boolean): CSSProperties => ({
  padding: "0.52rem 0.85rem",
  borderRadius: 999,
  border: `1px solid ${primary ? pageColorTokens.brandBlue : pageColorTokens.borderSubtle}`,
  background: primary ? pageColorTokens.brandBlueLight : pageColorTokens.surface,
  color: primary ? pageColorTokens.brandBlueDark : pageColorTokens.textPrimary,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
});

const channelBadgeStyle = (
  tone: "ready" | "partial" | "pending" | "needs_setup",
): CSSProperties => ({
  flexShrink: 0,
  padding: "0.2rem 0.5rem",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 750,
  color:
    tone === "ready"
      ? pageColorTokens.brandGreenDark
      : tone === "partial"
        ? pageColorTokens.brandBlueDark
        : tone === "pending"
          ? "#8a5a00"
          : pageColorTokens.textSecondary,
  background:
    tone === "ready"
      ? pageColorTokens.brandGreenLight
      : tone === "partial"
        ? pageColorTokens.brandBlueLight
        : tone === "pending"
          ? "#fff7e0"
          : pageColorTokens.surfaceMuted,
  border: `1px solid ${
    tone === "ready"
      ? "rgba(0, 166, 124, 0.28)"
      : tone === "partial"
        ? pageColorTokens.brandBlueGlow
        : tone === "pending"
          ? "rgba(185, 137, 0, 0.3)"
          : pageColorTokens.borderSubtle
  }`,
});

const diagnosticsOverviewStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  padding: "1rem",
  marginBottom: "1rem",
  borderRadius: 16,
  border: `1px solid ${pageColorTokens.divider}`,
  background: pageColorTokens.surfaceMuted,
};

const diagnosticsHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.85rem",
};

const diagnosticsTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const diagnosticsSubtitleStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const diagnosticsSummaryRowStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
};

const diagnosticsHeadlineStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const diagnosticsSummaryCaptionStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const diagnosticsEmptyStyle: CSSProperties = {
  padding: "0.85rem 0.95rem",
  borderRadius: 12,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: 12,
};

const diagnosticMetricCardStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  padding: "0.85rem 0.95rem",
  display: "grid",
  gap: "0.3rem",
};

const diagnosticMetricLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
};

const diagnosticMetricValueStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 760,
  color: pageColorTokens.textPrimary,
};

const channelSectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
