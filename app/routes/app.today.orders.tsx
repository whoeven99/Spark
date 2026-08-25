import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Legacy orders detail now folds into the revenue report's orders focus.
 * Keep this route only for compatibility with historical deep links.
 */
export default function TodayOrdersCompatibilityRoute() {
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  params.set("focus", "orders");
  throw redirect(`/app/today/revenue?${params.toString()}`);
};
