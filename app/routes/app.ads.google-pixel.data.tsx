import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export type GooglePixelDataLoaderData = {
  shopDomain: string;
  shopifyApiKey: string;
  ingestEndpoint: string;
  adsConnected: boolean;
  customerId: string;
  loginCustomerId: string;
  credentialUpdatedAt: string | null;
  config: {
    tagId: string;
    source: "auto" | "manual";
    confirmedAt: string;
    enabledEvents: string[];
    enabledFieldGroups: string[];
    pixelName: string;
    conversionLabel: string;
    enhancedConversions: boolean;
    customPixelConfirmedAt: string | null;
    metafieldSyncStatus: "synced" | "failed" | "";
    metafieldSyncUpdatedAt: string | null;
    metafieldSyncError: string;
  } | null;
  customPixelScript: string | null;
  embed: {
    enabled: boolean;
    checkedAt: string;
    unavailable: boolean;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return {
    shopDomain: session.shop,
    shopifyApiKey: "",
    ingestEndpoint: "",
    adsConnected: false,
    customerId: "",
    loginCustomerId: "",
    credentialUpdatedAt: null,
    config: null,
    customPixelScript: null,
    embed: { enabled: false, checkedAt: "", unavailable: true },
  } satisfies GooglePixelDataLoaderData;
};

export default function AppAdsGooglePixelData() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
