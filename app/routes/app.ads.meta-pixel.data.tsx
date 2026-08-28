import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export type MetaPixelDataLoaderData = {
  shopDomain: string;
  shopifyApiKey: string;
  metaCatalogConnected: boolean;
  catalogId: string;
  businessId: string;
  credentialUpdatedAt: string | null;
  metaAdsConnected: boolean;
  metaAdsAdAccountId: string;
  manualAuthConnected: boolean;
  manualAuthUpdatedAt: string | null;
  config: {
    pixelId: string;
    capiEnabled: boolean;
    hasCapiAccessToken: boolean;
    testEventCode: string;
    enabledEvents: string[];
  } | null;
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
    metaCatalogConnected: false,
    catalogId: "",
    businessId: "",
    credentialUpdatedAt: null,
    metaAdsConnected: false,
    metaAdsAdAccountId: "",
    manualAuthConnected: false,
    manualAuthUpdatedAt: null,
    config: null,
    embed: { enabled: false, checkedAt: "", unavailable: true },
  } satisfies MetaPixelDataLoaderData;
};

export default function AppAdsMetaPixelData() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
