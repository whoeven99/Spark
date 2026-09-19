import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { data } from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listTasksPageForShop } from "../server/aiTask/aiTaskStore.server";
import {
  getFacebookCatalogCredential,
  getGoogleAdsCredential,
  getGoogleAdsPending,
  getGoogleMerchantCredential,
  getGoogleMerchantPending,
  getMetaAdsCredential,
  getMetaAdsPending,
  getMetaCatalogPending,
  getMetaCapiPending,
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
  maskTokenTail,
} from "../server/adsCatalog/credentialStore.server";
import {
  getGa4Credential,
  getGa4Pending,
} from "../server/googleAnalytics/ga4Credentials.server";
import {
  getGscCredential,
  getGscPending,
} from "../server/googleSearchConsole/gscCredentials.server";
import { formatCustomerId } from "../server/adsCatalog/googleOAuth.server";
import { fetchShopBasicInfo } from "../server/shopify/fetchShopBasicInfo.server";
import {
  fetchTiktokCatalogConf,
  resolveTiktokCatalogRegion,
  type TiktokCatalogConfSnapshot,
} from "../server/adsCatalog/clients/tiktokCatalogClient.server";
import { createEnumerationCache } from "../server/adsCatalog/enumerationCache.server";
import {
  normalizeTiktokEnabledEvents,
  TIKTOK_PIXEL_DEFAULT_EVENTS,
} from "../lib/tiktokPixelEvents";
import {
  normalizeMetaEnabledEvents,
  META_PIXEL_DEFAULT_EVENTS,
} from "../lib/metaPixelEvents";
import { useFeatureView } from "../lib/featureTrack";
import type { AITaskListPageData } from "../lib/aiTaskTypes";
import { RoutePageFallback } from "./component/RoutePageFallback";
import { hasMetaCapiAccessAvailable, isMetaCapiAutoConnectAvailable } from "../server/adsCatalog/metaPixelConfig.server";
import { isMetaCapiBisuOnboardingConfigured } from "../server/adsCatalog/metaCapiOnboarding.server";

const AdsCatalogPage = lazy(() =>
  import("./page/AdsCatalogPage").then((m) => ({ default: m.AdsCatalogPage })),
);

/** 已绑定 Catalog 的展示用配置快照，避免每次进页都串行等一次 TikTok 接口。 */
const boundCatalogConfCache = createEnumerationCache<TiktokCatalogConfSnapshot | null>();

const EMPTY_TASK_PAGE: AITaskListPageData = {
  tasks: [],
  view: "current",
  page: 1,
  pageSize: 20,
  totalCount: 0,
  totalPages: 1,
  metrics: {
    currentCount: 0,
    historyCount: 0,
    runningCount: 0,
    totalCount: 0,
  },
};

/** 连接账户（credentials）不需要任务列表与 TikTok 目录远程快照；同步/任务 tab 才要。 */
function isCredentialsOnlyTab(requestUrl: string): boolean {
  const tab = new URL(requestUrl).searchParams.get("tab");
  return tab !== "sync" && tab !== "tasks";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const credentialsOnly = isCredentialsOnlyTab(request.url);

  const [
    initialTaskPage,
    fb,
    gg,
    gmcPending,
    ads,
    adsPending,
    ga4,
    ga4Pending,
    gsc,
    gscPending,
    metaPending,
    metaCapiPending,
    metaAds,
    metaAdsPending,
    tiktok,
    tiktokPending,
    shopInfo,
  ] = await Promise.all([
    credentialsOnly
      ? Promise.resolve(EMPTY_TASK_PAGE)
      : listTasksPageForShop({
          shop: session.shop,
          view: "current",
          taskType: "ads_catalog_sync",
        }),
    getFacebookCatalogCredential(session.shop),
    getGoogleMerchantCredential(session.shop),
    getGoogleMerchantPending(session.shop),
    getGoogleAdsCredential(session.shop),
    getGoogleAdsPending(session.shop),
    getGa4Credential(session.shop),
    getGa4Pending(session.shop),
    getGscCredential(session.shop),
    getGscPending(session.shop),
    getMetaCatalogPending(session.shop),
    getMetaCapiPending(session.shop),
    getMetaAdsCredential(session.shop),
    getMetaAdsPending(session.shop),
    getTiktokCatalogCredential(session.shop),
    getTiktokCatalogPending(session.shop),
    fetchShopBasicInfo(admin),
  ]);

  const inferredTiktokRegion = resolveTiktokCatalogRegion(
    shopInfo?.currencyCode,
    shopInfo?.countryCode,
  ).regionCode;
  const tiktokCatalogRegionCode =
    tiktok?.catalogRegionCode ?? tiktokPending?.catalogRegionCode ?? "";

  let boundTiktokCatalogName = tiktok?.catalogName ?? "";
  let boundTiktokCatalogCurrency = "";
  let boundTiktokCatalogRegion = "";
  let boundTiktokCatalogChannel = "";
  // 同步 tab 才拉 TikTok 远程 conf；连接账户只读库内 catalogName。
  if (!credentialsOnly && tiktok?.catalogId && tiktok.bcId) {
    const { accessToken, bcId, catalogId } = tiktok;
    const conf = await boundCatalogConfCache.get(`${session.shop}:${catalogId}`, () =>
      fetchTiktokCatalogConf({ accessToken, bcId, catalogId }),
    );
    if (conf) {
      boundTiktokCatalogName = conf.catalogName ?? boundTiktokCatalogName;
      boundTiktokCatalogCurrency = conf.currency ?? "";
      boundTiktokCatalogRegion = conf.regionCode ?? "";
      boundTiktokCatalogChannel = conf.channel ?? "";
    }
  }

  const [hasCapiAccessToken, metaOAuthCapiAvailable] = fb
    ? await Promise.all([
        hasMetaCapiAccessAvailable(session.shop, fb),
        isMetaCapiAutoConnectAvailable({ shop: session.shop, credential: fb }),
      ])
    : [false, isMetaCapiBisuOnboardingConfigured()];

  return data({
    shopDomain: session.shop,
    shopifyApiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
    initialTaskPage,
    inferredTiktokRegion,
    boundTiktokCatalogName,
    boundTiktokCatalogCurrency,
    boundTiktokCatalogRegion,
    boundTiktokCatalogChannel,
    credentials: {
      facebook: {
        configured: Boolean(fb),
        updatedAt: fb?.updatedAt ?? null,
        fields: {
          accessTokenMasked: fb ? maskTokenTail(fb.accessToken) : "",
          catalogId: fb?.catalogId ?? "",
          businessId: fb?.businessId ?? "",
          apiVersion: fb?.apiVersion ?? "",
        },
      },
      meta: {
        connected: Boolean(fb),
        catalogId: fb?.catalogId ?? "",
        businessId: fb?.businessId ?? "",
        updatedAt: fb?.updatedAt ?? null,
        pixelId: fb?.pixelId ?? "",
        hasCapiAccessToken,
        // CAPI Token 只保留在服务端；UI 仅显示是否已配置，避免通过 loader 泄露完整凭证。
        capiAccessToken: "",
        hasStoredCapiAccessToken: Boolean(fb?.capiAccessToken?.trim()),
        metaOAuthCapiAvailable,
        metaCapiBisuConfigured: isMetaCapiBisuOnboardingConfigured(),
        capiTokenType: fb?.capiTokenType ?? "",
        pendingCapiPixels:
          metaCapiPending?.accounts.map((a) => ({
            pixelId: a.id,
            pixelName: a.name || a.id,
            businessId: a.businessId,
          })) ?? [],
        testEventCode: fb?.testEventCode?.trim() ?? "",
        capiEnabled:
          typeof fb?.capiEnabled === "boolean" ? fb.capiEnabled : true,
        enabledEvents: fb?.enabledEvents?.length
          ? normalizeMetaEnabledEvents(fb.enabledEvents)
          : [...META_PIXEL_DEFAULT_EVENTS],
        metaAdsConnected: Boolean(metaAds),
        metaAdsAdAccountId: metaAds?.adAccountId ?? "",
        metaAdsAdAccountName: metaAds?.adAccountName ?? "",
        pendingAdsAccounts: metaAdsPending?.accounts ?? [],
        availableAdsAccounts: metaAds?.availableAccounts ?? [],
        pendingCatalogs:
          metaPending?.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            businessId: a.businessId,
          })) ?? [],
      },
      googleMerchant: {
        connected: Boolean(gg),
        merchantId: gg?.merchantId ?? "",
        updatedAt: gg?.updatedAt ?? null,
        pendingAccounts: gmcPending?.accounts ?? [],
      },
      googleAds: {
        connected: Boolean(ads),
        customerId: ads?.customerId ?? "",
        customerIdFormatted: ads ? formatCustomerId(ads.customerId) : "",
        updatedAt: ads?.updatedAt ?? null,
        remarketing: {
          tagId: ads?.remarketing?.tagId ?? "",
          source: ads?.remarketing?.source ?? "",
          confirmedAt: ads?.remarketing?.confirmedAt ?? null,
          enabledEvents: ads?.remarketing?.enabledEvents ?? [],
          enabledFieldGroups: ads?.remarketing?.enabledFieldGroups ?? [],
          pixelName: ads?.remarketing?.pixelName ?? "",
          conversionLabel: ads?.remarketing?.conversionLabel ?? "",
          enhancedConversions: ads?.remarketing?.enhancedConversions ?? false,
          customPixelConfirmedAt:
            ads?.remarketing?.customPixelConfirmedAt ?? null,
          metafieldSyncStatus: ads?.remarketing?.metafieldSync?.status ?? "",
          metafieldSyncError: ads?.remarketing?.metafieldSync?.error ?? "",
        },
        pendingAccounts: adsPending?.accounts ?? [],
        availableAccounts:
          ads?.availableAccounts?.map((a) => ({
            id: a.id,
            name: a.name,
            formatted: a.formatted,
          })) ?? [],
      },
      googleAnalytics: {
        connected: Boolean(ga4?.properties.length),
        updatedAt: ga4?.updatedAt ?? null,
        properties:
          ga4?.properties.map((property) => ({
            propertyId: property.propertyId,
            propertyName: property.propertyName,
            accountName: property.accountName,
          })) ?? [],
        allProperties:
          ga4?.allProperties?.map((property) => ({
            propertyId: property.propertyId,
            propertyName: property.propertyName,
            accountName: property.accountName,
          })) ?? [],
        pendingProperties:
          ga4Pending?.properties.map((property) => ({
            propertyId: property.propertyId,
            propertyName: property.propertyName,
            accountName: property.accountName,
          })) ?? [],
      },
      googleSearchConsole: {
        connected: Boolean(gsc),
        siteUrl: gsc?.siteUrl ?? null,
        updatedAt: gsc?.updatedAt ?? null,
        pendingSites: gscPending?.sites ?? [],
      },
      tiktok: {
        connected: Boolean(tiktok),
        authorized: Boolean(tiktok || tiktokPending),
        awaitingCatalog: Boolean(tiktokPending && !tiktok && (tiktokPending.accounts?.length ?? 0) === 0),
        catalogId: tiktok?.catalogId ?? "",
        advertiserId: tiktok?.advertiserId ?? tiktokPending?.advertiserId ?? "",
        bindingMode: tiktok?.bindingMode ?? "",
        catalogRegionCode: tiktokCatalogRegionCode,
        updatedAt: tiktok?.updatedAt ?? null,
        pixelCode: tiktok?.pixelCode ?? "",
        hasEventsApiAccessToken: Boolean(tiktok?.eventsApiAccessToken?.trim()),
        testEventCode: tiktok?.testEventCode?.trim() ?? "",
        eventsApiEnabled:
          typeof tiktok?.eventsApiEnabled === "boolean" ? tiktok.eventsApiEnabled : true,
        enabledEvents: tiktok?.enabledEvents?.length
          ? normalizeTiktokEnabledEvents(tiktok.enabledEvents)
          : [...TIKTOK_PIXEL_DEFAULT_EVENTS],
        pendingCatalogs:
          tiktokPending?.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            businessId: a.businessId,
            isShopifyOfficial: a.isShopifyOfficial,
          })) ?? [],
      },
    },
  });
};

export default function AppAdsCatalog() {
  useFeatureView("ads-catalog");
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsCatalogPage />
    </Suspense>
  );
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname) {
    return defaultShouldRevalidate;
  }
  return defaultShouldRevalidate;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
