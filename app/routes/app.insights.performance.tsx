/**
 * 更旧的投放表现入口继续兼容，但直接跳到 Ads Catalog 凭据页。
 * 这里只做兼容跳转，避免旧书签、站内旧链接和 OAuth 回跳路径失效。
 */
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
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

  throw redirect(`/app/ads-catalog?${params.toString()}`);
};

export default function AppInsightsPerformance() {
  return null;
}
