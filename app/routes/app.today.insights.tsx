import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

function resolveLegacyTodayInsightsPath(moduleKey: string | null) {
  if (moduleKey === "roi") return "/app/today/roi";
  if (moduleKey === "traffic") return "/app/today/traffic";
  if (moduleKey === "conversion") return "/app/today/conversion";
  if (moduleKey === "orders") return "/app/today/orders";
  return "/app/today";
}

/**
 * Legacy Today Insights route is compatibility-only.
 * Historical deep links now resolve into formal Today destinations.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  throw redirect(`${resolveLegacyTodayInsightsPath(url.searchParams.get("module"))}${url.search}`);
};

export default function AppTodayInsightsCompatibilityRoute() {
  return null;
}
