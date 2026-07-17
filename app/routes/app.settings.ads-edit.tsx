import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getMetaAdsCredential,
  getTiktokAdsInsightsCredential,
  getGoogleAdsCredential,
} from "../server/adsCatalog/credentialStore.server";
import { RoutePageFallback } from "./component/RoutePageFallback";
import type { AdsEditLoaderData } from "./component/adsEdit/types";

const AdsEditPage = lazy(() =>
  import("./page/AdsEditPage").then((m) => ({ default: m.AdsEditPage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [metaCred, tiktokCred, googleCred] = await Promise.all([
    getMetaAdsCredential(shop),
    getTiktokAdsInsightsCredential(shop),
    getGoogleAdsCredential(shop),
  ]);

  const developerTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());

  return data<AdsEditLoaderData>({
    meta: {
      connected: Boolean(metaCred),
      adAccountId: metaCred?.adAccountId ?? "",
      adAccountName: metaCred?.adAccountName ?? "",
    },
    tiktok: {
      connected: Boolean(tiktokCred),
      advertiserId: tiktokCred?.advertiserId ?? "",
    },
    google: {
      connected: Boolean(googleCred) && developerTokenConfigured,
      customerId: googleCred?.customerId ?? "",
      developerTokenConfigured,
    },
  });
};

export default function AppSettingsAdsEdit() {
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsEditPage />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
