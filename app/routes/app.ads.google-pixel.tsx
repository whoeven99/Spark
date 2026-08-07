/**
 * Google Pixel 布局：向导（_index）与数据页（data）共用鉴权父路由。
 * 父级只做 Outlet；否则 child `/data` 会继续渲染向导页。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppAdsGooglePixelLayout() {
  return <Outlet />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
