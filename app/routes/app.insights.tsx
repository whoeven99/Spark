/**
 * 旧洞察路径保留为兼容壳。
 * 经营判断继续留在 Today，渠道连接与授权继续归到 Settings。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppInsights() {
  return <Outlet />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
