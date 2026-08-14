import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureGoogleRemarketingIngestEndpoint } from "../server/adsCatalog/googleRemarketing.server";
import { GooglePixelActivityPage } from "./page/GooglePixelActivityPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  await ensureGoogleRemarketingIngestEndpoint({ shop: session.shop, admin }).catch(
    () => undefined,
  );
  return null;
};

export default function AppAdsGooglePixelActivity() {
  return <GooglePixelActivityPage />;
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
