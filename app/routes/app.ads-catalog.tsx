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
  getMetaCatalogPending,
  getTiktokCatalogCredential,
  getTiktokCatalogPending,
  maskTokenTail,
} from "../server/adsCatalog/credentialStore.server";
import { formatCustomerId } from "../server/adsCatalog/googleOAuth.server";
import { useFeatureView } from "../lib/featureTrack";
import { RoutePageFallback } from "./component/RoutePageFallback";

const AdsCatalogPage = lazy(() =>
  import("./page/AdsCatalogPage").then((m) => ({ default: m.AdsCatalogPage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [initialTaskPage, fb, gg, gmcPending, ads, adsPending, metaPending, tiktok, tiktokPending] =
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
      getTiktokCatalogCredential(session.shop),
      getTiktokCatalogPending(session.shop),
    ]);

  return data({
    initialTaskPage,
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
        pendingAccounts: adsPending?.accounts ?? [],
      },
      tiktok: {
        connected: Boolean(tiktok),
        catalogId: tiktok?.catalogId ?? "",
        advertiserId: tiktok?.advertiserId ?? "",
        updatedAt: tiktok?.updatedAt ?? null,
        pendingCatalogs:
          tiktokPending?.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            businessId: a.businessId,
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
