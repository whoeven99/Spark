import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadAdsCreatePageData } from "../server/adsCreate/adsCreatePageLoader.server";
import { RoutePageFallback } from "./component/RoutePageFallback";

const AdsCreatePage = lazy(() =>
  import("./page/AdsCreatePage").then((m) => ({ default: m.AdsCreatePage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return data(await loadAdsCreatePageData(session.shop));
};

export default function AppStudioAds() {
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsCreatePage />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
