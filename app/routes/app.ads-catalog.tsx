/**
 * 兼容旧 /app/ads-catalog：跳到 hub 内 catalog。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const target = `/app/ads/catalog${url.search}`;
  throw redirect(buildEmbeddedAppPath(target, request));
};

export default function AppAdsCatalogRedirect() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
