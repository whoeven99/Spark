/**
 * 广告一级目的地布局：顶部分段 + Outlet。
 */
import type {
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { hasEmbeddedAuthContext } from "../lib/embeddedLocationSearch";
import { useFeatureView } from "../lib/featureTrack";
import { AdsHubShell } from "./component/adsHub/AdsHubShell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

/** hub 内切 tab 不重跑壳层鉴权；丢 shop/host 时仍重跑以补嵌入式会话。 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formAction) return defaultShouldRevalidate;

  const stillInAds =
    currentUrl.pathname.startsWith("/app/ads") &&
    nextUrl.pathname.startsWith("/app/ads");
  if (stillInAds) {
    if (!hasEmbeddedAuthContext(nextUrl.search)) return true;
    return false;
  }

  return defaultShouldRevalidate;
}

export default function AppAdsLayout() {
  useFeatureView("ads");
  return (
    <AdsHubShell>
      <Outlet />
    </AdsHubShell>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
