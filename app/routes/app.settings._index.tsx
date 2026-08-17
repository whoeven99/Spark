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
  pageContentStyle,
} from "./page/pageUiStyles";
import { DestinationActionGrid } from "./component/shared/DestinationPage";
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
import { getGa4Credential, getGa4Pending } from "../server/googleAnalytics/ga4Credentials.server";
import { getGscCredential, getGscPending } from "../server/googleSearchConsole/gscCredentials.server";
import { getFedexCredential, getSfCredential } from "../server/logisticsCredentialStore.server";

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
      adsCatalog: {
        connectedCount: [metaCatalog, googleMerchant, tiktokCatalog].filter(Boolean).length,
        totalCount: 3,
        hasPending: Boolean(
          metaCatalogPending?.accounts.length ||
            googleMerchantPending?.accounts.length ||
            tiktokCatalogPending?.accounts.length,
        ),
      },
      adsCreate: {
        connectedCount: [
          Boolean(metaAds),
          Boolean(googleAds) && developerTokenConfigured,
          Boolean(tiktokAds),
        ].filter(Boolean).length,
        totalCount: 3,
        hasPending: Boolean(
          metaAdsPending?.accounts.length ||
            googleAdsPending?.accounts.length ||
            tiktokCatalogPending?.accounts.length,
        ),
        developerTokenConfigured,
      },
      ga4: {
        connected: Boolean(ga4?.properties.length),
        hasPending: Boolean(ga4Pending?.properties.length),
        propertyCount: ga4?.properties.length ?? 0,
      },
      gsc: {
        connected: Boolean(gsc),
        hasPending: Boolean(gscPending?.sites.length),
        siteUrl: gsc?.siteUrl ?? null,
      },
      googleAttribution: {
        adsConnected: Boolean(googleAds),
        ga4Connected: Boolean(ga4?.properties.length),
        propertyCount: ga4?.properties.length ?? 0,
      },
      logistics: {
        configuredCount: [fedex, sf].filter(Boolean).length,
        totalCount: 2,
      },
    },
  };
};

type SettingsModuleId =
  | "billing"
  | "adsCatalog"
  | "adsCreate"
  | "gsc"
  | "ga4"
  | "googleAttribution"
  | "logistics"
  | "data"
  | "feedback";

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
    titleKey: "settingsShell.sectionIntegrationsTitle",
    subtitleKey: "settingsShell.sectionIntegrationsSubtitle",
    modules: [
      {
        id: "adsCatalog",
        to: "/app/ads-catalog",
        labelKey: "settingsShell.navAdsCatalog",
        descKey: "settingsShell.descAdsCatalog",
      },
      {
        id: "adsCreate",
        to: "/app/settings/ads-create",
        labelKey: "settingsShell.navAdsCreate",
        descKey: "settingsShell.descAdsCreate",
      },
      {
        id: "gsc",
        to: "/app/settings/google-search-console",
        labelKey: "settingsShell.navGsc",
        descKey: "settingsShell.descGsc",
      },
      {
        id: "ga4",
        to: "/app/settings/google-analytics",
        labelKey: "settingsShell.navGa4",
        descKey: "settingsShell.descGa4",
      },
      {
        id: "googleAttribution",
        to: "/app/ads/google-attribution",
        labelKey: "settingsShell.navGoogleAttribution",
        descKey: "settingsShell.descGoogleAttribution",
      },
      {
        id: "logistics",
        to: "/app/settings/logistics",
        labelKey: "settingsShell.navLogistics",
        descKey: "settingsShell.descLogistics",
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
    case "adsCatalog":
      return {
        badge:
          summaries.adsCatalog.connectedCount === summaries.adsCatalog.totalCount
            ? t("settingsShell.statusReady")
            : summaries.adsCatalog.connectedCount > 0
              ? t("settingsShell.statusPartial")
              : summaries.adsCatalog.hasPending
                ? t("settingsShell.statusPending")
                : t("settingsShell.statusNeedsSetup"),
        meta: t("settingsShell.summaryChannelsConnected", {
          connected: summaries.adsCatalog.connectedCount,
          total: summaries.adsCatalog.totalCount,
        }),
      };
    case "adsCreate":
      return {
        badge:
          summaries.adsCreate.connectedCount === summaries.adsCreate.totalCount
            ? t("settingsShell.statusReady")
            : summaries.adsCreate.connectedCount > 0
              ? t("settingsShell.statusPartial")
              : summaries.adsCreate.hasPending
                ? t("settingsShell.statusPending")
                : t("settingsShell.statusNeedsSetup"),
        meta: summaries.adsCreate.developerTokenConfigured
          ? t("settingsShell.summaryChannelsConnected", {
              connected: summaries.adsCreate.connectedCount,
              total: summaries.adsCreate.totalCount,
            })
          : t("settingsShell.summaryAdsCreateNeedsToken"),
      };
    case "gsc":
      return {
        badge: summaries.gsc.connected
          ? t("settingsShell.statusConnected")
          : summaries.gsc.hasPending
            ? t("settingsShell.statusPending")
            : t("settingsShell.statusNeedsSetup"),
        meta: summaries.gsc.siteUrl
          ? t("settingsShell.summaryGscSite", { siteUrl: summaries.gsc.siteUrl })
          : t("settingsShell.summaryNeedsConnection"),
      };
    case "ga4":
      return {
        badge: summaries.ga4.connected
          ? t("settingsShell.statusConnected")
          : summaries.ga4.hasPending
            ? t("settingsShell.statusPending")
            : t("settingsShell.statusNeedsSetup"),
        meta: summaries.ga4.connected
          ? t("settingsShell.summaryGa4Properties", {
              count: summaries.ga4.propertyCount,
            })
          : t("settingsShell.summaryNeedsConnection"),
      };
    case "googleAttribution":
      return {
        badge:
          summaries.googleAttribution.adsConnected && summaries.googleAttribution.ga4Connected
            ? t("settingsShell.statusReady")
            : summaries.googleAttribution.adsConnected || summaries.googleAttribution.ga4Connected
              ? t("settingsShell.statusPartial")
              : t("settingsShell.statusNeedsSetup"),
        meta:
          summaries.googleAttribution.adsConnected && summaries.googleAttribution.ga4Connected
            ? t("settingsShell.summaryGoogleAttributionReady", {
                count: summaries.googleAttribution.propertyCount,
              })
            : t("settingsShell.summaryGoogleAttributionPartial"),
      };
    case "logistics":
      return {
        badge:
          summaries.logistics.configuredCount === summaries.logistics.totalCount
            ? t("settingsShell.statusReady")
            : summaries.logistics.configuredCount > 0
              ? t("settingsShell.statusPartial")
              : t("settingsShell.statusNeedsSetup"),
        meta: t("settingsShell.summaryProvidersConfigured", {
          configured: summaries.logistics.configuredCount,
          total: summaries.logistics.totalCount,
        }),
      };
    case "data":
      return {
        badge: t("settingsShell.statusTool"),
        meta: t("settingsShell.summaryDataTools"),
      };
    case "feedback":
      return {
        badge: t("settingsShell.statusSupport"),
        meta: t("settingsShell.summaryFeedback"),
      };
  }
}

export default function SettingsIndex() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const { summaries } = useLoaderData<typeof loader>();
  useFeatureView("settings");

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.title")}
        subtitle={t("settingsShell.subtitle")}
        titleBarTitle={t("nav.settings")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app"
      />

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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
