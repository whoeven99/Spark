import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import type { AdsOverviewSnapshot } from "../server/adsInsights/overview.server";
import {
  loadBusinessReportLiveData,
} from "../server/operations/businessReportSnapshot.server";
import type { LiveSnapshotData } from "../server/operations/businessReportSnapshot.shared";
import { InsightsChartsOverviewPage } from "./page/InsightsChartsOverviewPage";

export type InsightsOverviewLoaderData = {
  overview: AdsOverviewSnapshot | null;
  liveData: LiveSnapshotData | null;
  failed: boolean;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authContext = await authenticate.admin(request);
  const url = new URL(request.url);
  const groupParam = url.searchParams.get("group");
  const group =
    groupParam === "acquisition" ||
    groupParam === "conversion" ||
    groupParam === "operations"
      ? groupParam
      : "roi";

  try {
    const businessReportData = await loadBusinessReportLiveData(request, {
      mode: "insights_charts",
      group,
      authContext,
    });
    return {
      overview: null,
      liveData: businessReportData.liveData,
      failed: false,
    } satisfies InsightsOverviewLoaderData;
  } catch (error) {
    console.error("[insights.charts._index] loader failed:", error);
    return {
      overview: null,
      liveData: null,
      failed: true,
    } satisfies InsightsOverviewLoaderData;
  }
};

export default function AppInsightsChartsOverview() {
  return <InsightsChartsOverviewPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
