import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

function resolveLegacyTodayInsightsPath(moduleKey: string | null) {
  if (moduleKey === "roi") return "/app/today/roi";
  if (moduleKey === "traffic") return "/app/today/traffic";
  if (moduleKey === "conversion") return "/app/today/conversion";
  if (moduleKey === "orders") return "/app/today/revenue?focus=orders";
  return "/app/today";
}

/**
 * Legacy Today Insights route is compatibility-only.
 * Historical deep links now resolve into formal Today destinations.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const path = resolveLegacyTodayInsightsPath(url.searchParams.get("module"));
  const [pathname, rawSearch] = path.split("?");
  const params = new URLSearchParams(rawSearch ?? "");

  url.searchParams.forEach((value, key) => {
    if (key === "module") return;
    params.set(key, value);
  });

  const query = params.toString();
  throw redirect(query ? `${pathname}?${query}` : pathname);
};

export default function AppTodayInsightsCompatibilityRoute() {
  return null;
}
