/**
 * 洞察 › 总览：跨平台广告数据的只读汇总。
 * loader 直接读库聚合（不回源平台 API），区间切换走 query，刷新走 revalidate。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { parseRangeDays } from "../server/adsInsights/dateRange.server";
import {
  buildAdsOverview,
  type AdsOverviewSnapshot,
} from "../server/adsInsights/overview.server";
import { InsightsOverviewPage } from "./page/InsightsOverviewPage";

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
    console.error("[insights._index] build overview failed:", error);
    return { overview: null, failed: true } satisfies InsightsOverviewLoaderData;
  }
};

export default function AppInsightsOverview() {
  return <InsightsOverviewPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
