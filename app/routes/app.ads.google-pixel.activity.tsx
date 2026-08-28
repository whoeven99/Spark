import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function AppAdsGooglePixelActivity() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
