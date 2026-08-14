import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getMetaAppEmbedStatus } from "../server/adsCatalog/appEmbedStatus.server";

/** 只读：检测 Spark Meta Pixel App Embed 是否已在当前主题启用。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const status = await getMetaAppEmbedStatus(admin);
  return Response.json({ ok: true, ...status });
};

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
