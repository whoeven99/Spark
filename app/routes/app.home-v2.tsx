import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { buildEmbeddedAppPath, getAppHomePath } from "../config/appEntry.server";
import { authenticate } from "../shopify.server";

/** 兼容旧链接：home-v2 已并入 `/app`。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  throw redirect(buildEmbeddedAppPath(getAppHomePath(), request));
};

export default function HomeV2Redirect() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
