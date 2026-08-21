/**
 * 旧 Product Improve 单页入口。生产 App URL / 硬刷新仍可能打到 `/app/product-improve`。
 * 只做重定向兜底：进入 Spark 首页，并保留 shop / host / embedded 等查询参数。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { buildEmbeddedAppPath, getAppHomePath } from "../config/appEntry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return redirect(buildEmbeddedAppPath(getAppHomePath(), request));
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
