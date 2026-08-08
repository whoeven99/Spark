import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGoogleAdsCredential } from "../server/adsCatalog/credentialStore.server";
import { getGa4Credential } from "../server/googleAnalytics/ga4Credentials.server";
import { GoogleAttributionPage } from "./page/GoogleAttributionPage";

export type GoogleAttributionLoaderData = {
  adsConnected: boolean;
  ga4Connected: boolean;
  adsCustomerId: string | null;
  ga4PropertyCount: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [ads, ga4] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    getGa4Credential(session.shop),
  ]);

  return {
    adsConnected: Boolean(ads),
    ga4Connected: Boolean(ga4?.properties.length),
    adsCustomerId: ads?.customerId ?? null,
    ga4PropertyCount: ga4?.properties.length ?? 0,
  } satisfies GoogleAttributionLoaderData;
};

export default function AppAdsGoogleAttribution() {
  return <GoogleAttributionPage />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
