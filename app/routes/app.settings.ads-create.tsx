import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getMetaAdsCredential,
  getTiktokCatalogCredential,
  getGoogleAdsCredential,
} from "../server/adsCatalog/credentialStore.server";
import { RoutePageFallback } from "./component/RoutePageFallback";
import type { AdsCreateLoaderData } from "./component/adsCreate/types";

const AdsCreatePage = lazy(() =>
  import("./page/AdsCreatePage").then((m) => ({ default: m.AdsCreatePage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [metaCred, tiktokCred, googleCred] = await Promise.all([
    getMetaAdsCredential(shop),
    getTiktokCatalogCredential(shop),
    getGoogleAdsCredential(shop),
  ]);

  const developerTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());

  return data<AdsCreateLoaderData>({
    meta: {
      connected: Boolean(metaCred),
      adAccountId: metaCred?.adAccountId ?? "",
      adAccountName: metaCred?.adAccountName ?? "",
      currencyCode: metaCred?.currencyCode ?? "",
    },
    tiktok: {
      connected: Boolean(tiktokCred),
      advertiserId: tiktokCred?.advertiserId ?? "",
    },
    google: {
      connected: Boolean(googleCred),
      customerId: googleCred?.customerId ?? "",
      developerTokenConfigured,
    },
  });
};

export default function AppSettingsAdsCreate() {
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsCreatePage />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
