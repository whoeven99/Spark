import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

function resolveTodayPath(group: string | null) {
  if (group === "acquisition") return "/app/today/traffic";
  if (group === "conversion") return "/app/today/conversion";
  if (group === "operations") return "/app/today/orders";
  return "/app/today/roi";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  throw redirect(`${resolveTodayPath(url.searchParams.get("group"))}${url.search}`);
};

export default function AppInsightsChartsOverview() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
