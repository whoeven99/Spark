/**
 * 旧 Settings 广告连接详情：重定向到广告 hub 连接账户。
 * GA4 / GSC 仍留在 Settings，不走这条路由。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { toAdsHubCatalogPlatform } from "../lib/adsHubNav";

type PlatformParam = "google" | "meta" | "tiktok";

function isPlatformParam(value: string | undefined): value is PlatformParam {
  return value === "google" || value === "meta" || value === "tiktok";
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  if (!isPlatformParam(params.platform)) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const catalogPlatform = toAdsHubCatalogPlatform(params.platform) ?? "google";
  url.searchParams.set("tab", "credentials");
  url.searchParams.set("platform", catalogPlatform);
  throw redirect(`/app/ads/catalog?${url.searchParams.toString()}`);
};

export default function AppSettingsConnectionDetailRedirect() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
