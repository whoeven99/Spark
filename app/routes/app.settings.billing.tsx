import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { buildEmbeddedAppPath } from "../config/appEntry.server";
import { BILLING_PAGE_PATH } from "../server/billing/buildBillingReturnUrl.server";

/** 旧 Settings 计费入口：兼容深链，统一跳到一级「账户与订阅」。 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  throw redirect(buildEmbeddedAppPath(BILLING_PAGE_PATH, request));
};

export default function AppSettingsBillingRedirect() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
