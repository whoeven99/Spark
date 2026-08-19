/**
 * 旧的广告洞察入口，已迁到 `/app/insights/charts/performance`。
 * 这里只做重定向兜底：外部书签、已发出的 OAuth state 仍可能命中该路径。
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  // 保留 host / embedded / platform / sandbox 等参数，避免嵌入式鉴权循环与状态丢失。
  return redirect(`/app/insights/charts/performance${url.search}`);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
