import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { hasReadReportsScope, parseRangeKey, parseReportTab } from "../lib/shopifyReports";
import { loadShopifyReports } from "../server/shopifyql/shopifyReports.server";
import { ShopifyReportsPage } from "./page/ShopifyReportsPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  return loadShopifyReports({
    admin,
    tab: parseReportTab(url.searchParams.get("tab")),
    range: parseRangeKey(url.searchParams.get("range")),
    hasReadReports: hasReadReportsScope(session.scope),
  });
};

export default function AppSettingsShopifyReports() {
  return <ShopifyReportsPage />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
