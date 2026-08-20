/**
 * 洞察首页改为直接进入数据页。
 * 经营报告继续留在 Today，避免把“看数据”和“做判断”混在同一入口里。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  throw redirect(`/app/insights/charts${url.search}`);
};

export default function AppInsightsIndexRedirect() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
