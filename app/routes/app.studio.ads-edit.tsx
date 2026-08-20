import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { lazy, Suspense } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadAdsEditPageData } from "../server/adsEdit/adsEditPageLoader.server";
import { RoutePageFallback } from "./component/RoutePageFallback";

const AdsEditPage = lazy(() =>
  import("./page/AdsEditPage").then((m) => ({ default: m.AdsEditPage })),
);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return data(await loadAdsEditPageData(session.shop));
};

export default function AppStudioAdsEdit() {
  return (
    <Suspense fallback={<RoutePageFallback />}>
      <AdsEditPage />
    </Suspense>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
