/**
 * 旧的广告洞察设置入口改为回到渠道连接页。
 * 广告账户连接、授权和账户选择逐步收回 Settings / Ads Catalog。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

function toAdsCatalogPlatform(platform: string | null) {
  if (platform === "meta") return "facebook";
  if (platform === "google" || platform === "tiktok" || platform === "facebook") {
    return platform;
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  params.set("tab", "credentials");

  const platform = toAdsCatalogPlatform(url.searchParams.get("platform"));
  if (platform) {
    params.set("platform", platform);
  } else {
    params.delete("platform");
  }

  return redirect(`/app/ads-catalog?${params.toString()}`);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
