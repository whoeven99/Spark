/**
 * 旧投放表现入口 → 广告 hub 表现页。
 */
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  throw redirect(buildEmbeddedAppPath(`/app/ads/performance${url.search}`, request));
};

export default function AppInsightsPerformance() {
  return null;
}
