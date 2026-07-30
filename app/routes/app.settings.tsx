/**
 * 设置目的地（PR2）：passthrough 布局。
 * billing/backfill 等子页各自是完整页面（含 s-page / 自有页头），故父级不再叠加页头或子导航，
 * 仅做鉴权 + Outlet；模块入口由 settings._index 的 hub 落地页提供。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppSettings() {
  return <Outlet />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
