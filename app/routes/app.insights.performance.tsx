/**
 * 旧的投放表现入口，已迁到 `/app/insights/charts/performance`。
 * 这里只做兼容跳转，避免旧书签、站内旧链接和 OAuth 回跳路径失效。
 */
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  throw redirect(`/app/insights/charts/performance${url.search}`);
};

export default function AppInsightsPerformance() {
  return null;
}
