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
  getMetaCatalogPending,
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
  maskTokenTail,
} from "../server/adsCatalog/credentialStore.server";
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
import { RoutePageFallback } from "./component/RoutePageFallback";
import { hasMetaCapiAccessAvailable } from "../server/adsCatalog/metaPixelConfig.server";

const AdsCatalogPage = lazy(() =>
  import("./page/AdsCatalogPage").then((m) => ({ default: m.AdsCatalogPage })),
);

/** 已绑定 Catalog 的展示用配置快照，避免每次进页都串行等一次 TikTok 接口。 */
const boundCatalogConfCache = createEnumerationCache<TiktokCatalogConfSnapshot | null>();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [initialTaskPage, fb, gg, gmcPending, ads, adsPending, metaPending, metaAds, tiktok, tiktokPending, shopInfo] =
    await Promise.all([
      listTasksPageForShop({
        shop: session.shop,
        view: "current",
        taskType: "ads_catalog_sync",
      }),
      getFacebookCatalogCredential(session.shop),
      getGoogleMerchantCredential(session.shop),
      getGoogleMerchantPending(session.shop),
      getGoogleAdsCredential(session.shop),
      getGoogleAdsPending(session.shop),
      getMetaCatalogPending(session.shop),
      getMetaAdsCredential(session.shop),
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
  if (tiktok?.catalogId && tiktok.bcId) {
    const { accessToken, bcId, catalogId } = tiktok;
    // 这里只用于展示已绑定 Catalog 的币种/地区，之前每次进页都要串行等一次 TikTok 接口。
    // 同步预检与上传确认等需要实时状态的路径仍直接调用 fetchTiktokCatalogConf，不走缓存。
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
        hasCapiAccessToken: fb
          ? await hasMetaCapiAccessAvailable(session.shop, fb)
          : false,
        hasStoredCapiAccessToken: Boolean(fb?.capiAccessToken?.trim()),
        metaOAuthCapiAvailable: Boolean(
          metaAds?.accessToken?.trim() || fb?.accessToken?.trim(),
        ),
        testEventCode: fb?.testEventCode?.trim() ?? "",
        capiEnabled:
          typeof fb?.capiEnabled === "boolean" ? fb.capiEnabled : true,
        enabledEvents: fb?.enabledEvents?.length
          ? normalizeMetaEnabledEvents(fb.enabledEvents)
          : [...META_PIXEL_DEFAULT_EVENTS],
        metaAdsConnected: Boolean(metaAds),
        metaAdsAdAccountId: metaAds?.adAccountId ?? "",
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
