import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGoogleAdsCredential } from "../server/adsCatalog/credentialStore.server";
import { GooglePixelOnboardingPage } from "./page/GooglePixelOnboardingPage";

export type GooglePixelLoaderData = {
  shopDomain: string;
  shopifyApiKey: string;
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
  const ads = await getGoogleAdsCredential(session.shop);
  const remarketing = ads?.remarketing;
  return {
    shopDomain: session.shop,
    shopifyApiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
    connected: Boolean(ads),
    config: remarketing
      ? {
          tagId: remarketing.tagId,
          pixelName: remarketing.pixelName ?? "",
          conversionLabel: remarketing.conversionLabel ?? "",
          enabledEvents: remarketing.enabledEvents ?? [],
          enhancedConversions: remarketing.enhancedConversions ?? false,
          customPixelConfirmedAt: remarketing.customPixelConfirmedAt ?? null,
        }
      : null,
  } satisfies GooglePixelLoaderData;
};

export default function AppAdsGooglePixelIndex() {
  return <GooglePixelOnboardingPage />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
