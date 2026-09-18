import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

function toInsightsPlatform(platform: string | null) {
  if (platform === "facebook") return "meta";
  if (platform === "meta" || platform === "google" || platform === "tiktok") {
    return platform;
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  params.delete("tab");

  const platform = toInsightsPlatform(url.searchParams.get("platform"));
  if (platform) {
    params.set("platform", platform);
  } else {
    params.delete("platform");
  }

  const query = params.toString();
  throw redirect(query ? `/app/ads/performance?${query}` : "/app/ads/performance");
};

export default function AppInsightsChartsPerformanceRedirect() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
