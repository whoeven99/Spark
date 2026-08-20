import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import {
  buildAdsOverview,
  type AdsOverviewSnapshot,
} from "../server/adsInsights/overview.server";
import { InsightsChartsOverviewPage } from "./page/InsightsChartsOverviewPage";

export type InsightsOverviewLoaderData = {
  overview: AdsOverviewSnapshot | null;
  failed: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const rangeDays = parseRangeDays(url.searchParams.get("range"));

  try {
    const overview = await buildAdsOverview({ shop: session.shop, rangeDays });
    return { overview, failed: false } satisfies InsightsOverviewLoaderData;
  } catch (error) {
    console.error("[insights.charts._index] build overview failed:", error);
    return { overview: null, failed: true } satisfies InsightsOverviewLoaderData;
  }
};

export default function AppInsightsChartsOverview() {
  return <InsightsChartsOverviewPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
