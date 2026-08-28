import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export type GooglePixelLoaderData = {
  shopDomain: string;
  shopifyApiKey: string;
  ingestEndpoint: string;
  connected: boolean;
  config: {
    tagId: string;
    pixelName: string;
    conversionLabel: string;
    enabledEvents: string[];
    enhancedConversions: boolean;
    customPixelConfirmedAt: string | null;
  } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    shopDomain: session.shop,
    shopifyApiKey: "",
    ingestEndpoint: "",
    connected: false,
    config: null,
  } satisfies GooglePixelLoaderData;
};

export default function AppAdsGooglePixelIndex() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
