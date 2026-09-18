/**
 * 广告一级目的地布局：左栏能力目录 + Outlet。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useFeatureView } from "../lib/featureTrack";
import { AdsHubShell } from "./component/adsHub/AdsHubShell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppAdsLayout() {
  useFeatureView("ads");
  return (
    <AdsHubShell>
      <Outlet />
    </AdsHubShell>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
