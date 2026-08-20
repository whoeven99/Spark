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
import { loadBillingContext } from "../server/billing/index.server";
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
import type { AdsHealthCheck, AdsHealthState } from "../server/adsCatalog/adsHealth.server";
import {
  buildAdsOverview,
  type AdsOverviewConnection,
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
    billing,
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
    loadBillingContext(shop),
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

  const currentPlan =
    billing.subscription && billing.subscription.status
      ? billing.plans.find((plan) => plan.planKey === billing.subscription?.planKey)?.displayName ??
        billing.subscription.planKey
      : null;

  return {
    summaries: {
      billing: {
        subscriptionStatus: billing.subscription?.status ?? null,
        currentPlan,
        availableTokens: billing.availableTokens,
        hasAccess: billing.hasAccess,
      },
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

type SettingsModuleId = "billing" | "data" | "shopifyReports" | "feedback";

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
    titleKey: "settingsShell.sectionAccountTitle",
    subtitleKey: "settingsShell.sectionAccountSubtitle",
    modules: [
      {
        id: "billing",
        to: "/app/settings/billing",
        labelKey: "settingsShell.navBilling",
        descKey: "settingsShell.descBilling",
      },
    ],
  },
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
    case "billing": {
      if (summaries.billing.subscriptionStatus === "ACTIVE") {
        return {
          badge: t("settingsShell.statusSubscribed"),
          meta: summaries.billing.currentPlan
            ? t("settingsShell.summaryBillingPlan", { plan: summaries.billing.currentPlan })
            : t("settingsShell.summaryBillingTokens", {
                count: summaries.billing.availableTokens,
              }),
        };
      }
      if (summaries.billing.subscriptionStatus === "PENDING") {
        return {
          badge: t("settingsShell.statusPending"),
          meta: summaries.billing.currentPlan
            ? t("settingsShell.summaryBillingPlan", { plan: summaries.billing.currentPlan })
            : t("settingsShell.summaryBillingTokens", {
                count: summaries.billing.availableTokens,
              }),
        };
      }
      return {
        badge: summaries.billing.hasAccess
          ? t("settingsShell.statusReady")
          : t("settingsShell.statusNeedsSetup"),
        meta: t("settingsShell.summaryBillingTokens", {
          count: summaries.billing.availableTokens,
        }),
      };
    }
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

const PLATFORM_LABEL: Record<AdsOverviewPlatform["platform"], string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number, currency: string | null): string {
  const amount = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency ? `${currency} ${amount}` : amount;
}

function formatRatio(value: number | null, suffix: string): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}${suffix}`;
}

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return iso.replace("T", " ").slice(0, 16);
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
) {
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
        label: t("settingsShell.googleManageAdsCatalog"),
        to: "/app/ads-catalog?tab=credentials",
        tone: "primary",
      },
      {
        label: t("settingsShell.googleManageAnalytics"),
        to: "/app/settings/google-analytics",
      },
      {
        label: t("settingsShell.googleManageSearchConsole"),
        to: "/app/settings/google-search-console",
      },
      {
        label: t("settingsShell.openInsights"),
        to: "/app/insights",
      },
    ] satisfies ConnectionLink[],
  };
}

function buildMetaSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  connectionOverview: Awaited<ReturnType<typeof loader>>["connectionOverview"],
  t: ReturnType<typeof useTranslation>["t"],
) {
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
        label: t("settingsShell.metaManageCatalog"),
        to: "/app/ads-catalog?tab=credentials",
        tone: "primary",
      },
      {
        label: t("settingsShell.openInsights"),
        to: "/app/insights/charts/performance?platform=meta",
      },
    ] satisfies ConnectionLink[],
  };
}

function buildTiktokSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  connectionOverview: Awaited<ReturnType<typeof loader>>["connectionOverview"],
  t: ReturnType<typeof useTranslation>["t"],
) {
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
        label: t("settingsShell.tiktokManageCatalog"),
        to: "/app/ads-catalog?tab=credentials",
        tone: "primary",
      },
      {
        label: t("settingsShell.openInsights"),
        to: "/app/insights/charts/performance?platform=tiktok",
      },
    ] satisfies ConnectionLink[],
  };
}

function buildLogisticsSummary(
  summaries: Awaited<ReturnType<typeof loader>>["summaries"],
  t: ReturnType<typeof useTranslation>["t"],
) {
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
          title={t("settingsShell.sectionAccountTitle")}
          subtitle={t("settingsShell.sectionAccountSubtitle")}
        />
        <DestinationActionGrid
          isMobile={isMobile}
          actions={SETTINGS_SECTIONS[0]!.modules.map((mod) => ({
            ...buildModuleSummary(mod.id, summaries, t),
            key: mod.to,
            title: t(mod.labelKey),
            detail: t(mod.descKey),
            onClick: () => navigate(mod.to),
          }))}
        />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.sectionConnectionsHubTitle")}
          subtitle={t("settingsShell.sectionConnectionsHubSubtitle")}
          badge={<span style={hubBadgeStyle}>{t("settingsShell.sectionConnectionsHubBadge")}</span>}
        />
        <div style={hubHintStyle}>{t("settingsShell.sectionConnectionsHubFootnote")}</div>
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

        {connectionOverview ? (
          <div style={diagnosticsWrapStyle}>
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

            <div style={diagnosticsSectionStyle}>
              <div style={diagnosticsTitleStyle}>{t("settingsShell.byPlatformTitle")}</div>
              <div style={platformGridStyle(isMobile)}>
                {connectionOverview.platforms.map((platform) => (
                  <SettingsPlatformCard
                    key={platform.platform}
                    item={platform}
                    generatedAt={connectionOverview.generatedAt}
                    onNavigate={navigate}
                    t={t}
                  />
                ))}
              </div>
            </div>

            <div style={diagnosticsSectionStyle}>
              <div style={diagnosticsTitleStyle}>{t("settingsShell.integrationHealthTitle")}</div>
              <HealthChecksTable checks={connectionOverview.health} t={t} />
            </div>

            <div style={diagnosticsSectionStyle}>
              <div style={diagnosticsTitleStyle}>{t("settingsShell.productReadinessTitle")}</div>
              <ReviewSnapshotTable reviews={connectionOverview.reviews} t={t} />
            </div>

            <div style={diagnosticsSectionStyle}>
              <div style={diagnosticsTitleStyle}>{t("settingsShell.connectionSnapshotTitle")}</div>
              <ConnectionSnapshotTable connections={connectionOverview.connections} t={t} />
            </div>
          </div>
        ) : (
          <div style={diagnosticsEmptyStyle}>{t("settingsShell.diagnosticsUnavailable")}</div>
        )}
      </PageSurface>

      {SETTINGS_SECTIONS.slice(1).map((section) => (
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
  capabilities,
  links,
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
        {capabilities.map((capability) => (
          <div key={capability.label} style={capabilityRowStyle}>
            <span style={capabilityLabelStyle}>{capability.label}</span>
            <span style={capabilityValueStyle(capability.tone)}>{capability.value}</span>
          </div>
        ))}
      </div>
      <div style={connectionLinksStyle}>
        {links.map((link) => (
          <button
            key={link.to}
            type="button"
            onClick={() => onNavigate(link.to)}
            style={connectionLinkButtonStyle(link.tone === "primary")}
          >
            {link.label}
          </button>
        ))}
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

function SettingsPlatformCard({
  item,
  generatedAt,
  onNavigate,
  t,
}: {
  item: AdsOverviewPlatform;
  generatedAt: string;
  onNavigate: (to: string) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const managePath =
    item.platform === "google"
      ? "/app/ads-catalog?tab=credentials"
      : item.platform === "meta"
        ? "/app/ads-catalog?tab=credentials"
        : "/app/ads-catalog?tab=credentials";
  const insightsPath = `/app/insights/charts/performance?platform=${item.platform}`;

  return (
    <div style={connectionCardStyle}>
      <div style={connectionHeaderStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={connectionTitleStyle}>{PLATFORM_LABEL[item.platform]}</div>
          <div style={connectionDescriptionStyle}>
            {item.accountName || item.accountId || t("settingsShell.platformNoAccount")}
          </div>
        </div>
        <span style={channelBadgeStyle(item.connected ? "ready" : "needs_setup")}>
          {item.connected ? t("settingsShell.statusConnected") : t("settingsShell.statusNeedsSetup")}
        </span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={capabilityRowStyle}>
          <span style={capabilityLabelStyle}>{t("settingsShell.platformSnapshot")}</span>
          <span style={capabilityValueStyle(item.snapshot && !item.snapshot.stale ? "ready" : "attention")}>
            {item.snapshot
              ? item.snapshot.stale
                ? t("settingsShell.snapshotStale")
                : t("settingsShell.snapshotFresh", {
                    minutes: minutesSince(item.snapshot.fetchedAt, generatedAt),
                  })
              : t("settingsShell.snapshotNone")}
          </span>
        </div>
        <div style={capabilityRowStyle}>
          <span style={capabilityLabelStyle}>{t("settingsShell.platformSpend")}</span>
          <span style={capabilityValueStyle("ready")}>
            {item.totals ? formatMoney(item.totals.spend, item.currencyCode) : "—"}
          </span>
        </div>
        <div style={capabilityRowStyle}>
          <span style={capabilityLabelStyle}>{t("settingsShell.platformRoas")}</span>
          <span style={capabilityValueStyle("ready")}>
            {item.totals ? formatRatio(item.totals.roas, "x") : "—"}
          </span>
        </div>
      </div>
      <div style={connectionLinksStyle}>
        <button type="button" onClick={() => onNavigate(managePath)} style={connectionLinkButtonStyle(true)}>
          {t("settingsShell.manageConnection")}
        </button>
        <button type="button" onClick={() => onNavigate(insightsPath)} style={connectionLinkButtonStyle(false)}>
          {t("settingsShell.openInsights")}
        </button>
      </div>
    </div>
  );
}

function HealthChecksTable({
  checks,
  t,
}: {
  checks: AdsHealthCheck[];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("insights.health.colPlatform")}</th>
            <th style={thStyle}>{t("insights.health.colItem")}</th>
            <th style={thStyle}>{t("insights.health.colState")}</th>
            <th style={thStyle}>{t("insights.health.colDetail")}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check, index) => {
            const prev = checks[index - 1];
            const isGroupStart = index === 0 || prev?.platform !== check.platform;
            return (
              <tr key={check.key}>
                <td style={{ ...tdStyle, fontWeight: isGroupStart ? 700 : 400 }}>
                  {isGroupStart ? PLATFORM_LABEL[check.platform] : ""}
                </td>
                <td style={tdStyle}>{t(`insights.health.item.${check.key}`)}</td>
                <td style={tdStyle}>
                  <span style={healthStatePillStyle(check.state)}>
                    {t(`insights.health.state.${check.state}`)}
                  </span>
                </td>
                <td style={tdMetaStyle}>
                  {t(`insights.health.detail.${check.detailCode}`)}
                  {check.reference ? ` · ${check.reference}` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewSnapshotTable({
  reviews,
  t,
}: {
  reviews: AdsOverviewReview[];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const hasData = reviews.some((review) => review.total > 0);
  if (!hasData) {
    return <div style={diagnosticsEmptyStyle}>{t("insights.reviewEmpty")}</div>;
  }

  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("insights.reviewChannel")}</th>
            <th style={thNumericStyle}>{t("insights.reviewTotal")}</th>
            <th style={thNumericStyle}>{t("insights.reviewApproved")}</th>
            <th style={thNumericStyle}>{t("insights.reviewPending")}</th>
            <th style={thNumericStyle}>{t("insights.reviewDisapproved")}</th>
            <th style={thStyle}>{t("insights.reviewLastChecked")}</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.channel}>
              <td style={tdStyle}>
                {review.channel === "gmc"
                  ? t("insights.reviewChannelGmc")
                  : t("insights.reviewChannelMeta")}
              </td>
              <td style={tdNumericStyle}>{formatInteger(review.total)}</td>
              <td style={tdNumericStyle}>{formatInteger(review.approved)}</td>
              <td style={tdNumericStyle}>{formatInteger(review.pending)}</td>
              <td style={tdNumericStyle}>{formatInteger(review.disapproved)}</td>
              <td style={tdMetaStyle}>{formatTimestamp(review.lastCheckedAt) ?? t("insights.reviewNever")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConnectionSnapshotTable({
  connections,
  t,
}: {
  connections: AdsOverviewConnection[];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("insights.connectionPlatform")}</th>
            <th style={thStyle}>{t("insights.connectionStatus")}</th>
            <th style={thStyle}>{t("insights.connectionAccount")}</th>
            <th style={thStyle}>{t("insights.connectionUpdatedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {connections.map((connection) => (
            <tr key={connection.platform}>
              <td style={tdMonoStyle}>{connection.platform}</td>
              <td style={tdStyle}>
                {connection.connected ? t("settingsShell.statusConnected") : t("settingsShell.statusNeedsSetup")}
              </td>
              <td style={tdMetaStyle}>{connection.externalAccountId ?? "—"}</td>
              <td style={tdMetaStyle}>{formatTimestamp(connection.updatedAt) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

const diagnosticsWrapStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  marginTop: "1rem",
  paddingTop: "1rem",
  borderTop: `1px solid ${pageColorTokens.divider}`,
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

const diagnosticsSectionStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
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

const platformGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const healthStateTokens: Record<AdsHealthState, { color: string; background: string; border: string }> = {
  ok: {
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: "rgba(0, 166, 124, 0.28)",
  },
  warning: {
    color: "#8a5a00",
    background: "#fff7e0",
    border: "rgba(185, 137, 0, 0.3)",
  },
  missing: {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  },
  unknown: {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  },
};

const healthStatePillStyle = (state: AdsHealthState): CSSProperties => {
  const token = healthStateTokens[state];
  return {
    display: "inline-block",
    padding: "0.12rem 0.45rem",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
    color: token.color,
    background: token.background,
    border: `1px solid ${token.border}`,
  };
};

const tableWrapStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.85rem",
  fontSize: 11,
  fontWeight: 750,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  whiteSpace: "nowrap",
};

const thNumericStyle: CSSProperties = { ...thStyle, textAlign: "right" };

const tdStyle: CSSProperties = {
  padding: "0.6rem 0.85rem",
  color: pageColorTokens.textBody,
  borderBottom: `1px solid ${pageColorTokens.divider}`,
};

const tdNumericStyle: CSSProperties = { ...tdStyle, textAlign: "right" };

const tdMetaStyle: CSSProperties = {
  ...tdStyle,
  color: pageColorTokens.textSecondary,
  fontSize: 12,
};

const tdMonoStyle: CSSProperties = {
  ...tdStyle,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
