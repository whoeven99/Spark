import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGoogleAdsCredential } from "../server/adsCatalog/credentialStore.server";
import { getGoogleAppEmbedStatus } from "../server/adsCatalog/appEmbedStatus.server";
import { generateGooglePurchaseCustomPixel } from "../lib/googleCustomPixel";
import type { GooglePixelEventConversions } from "../lib/googlePixelEvents";
import { resolveEventConversionLabel } from "../lib/googlePixelEvents";
import { GooglePixelsPage } from "./page/GooglePixelsPage";

export type GooglePixelLoaderData = {
  shopDomain: string;
  shopifyApiKey: string;
  connected: boolean;
  customerId: string;
  customerName: string;
  config: {
    tagId: string;
    pixelName: string;
    conversionLabel: string;
    enabledEvents: string[];
    enhancedConversions: boolean;
    eventConversions?: GooglePixelEventConversions;
  } | null;
  customPixelScript: string | null;
  embed: {
    enabled: boolean;
    checkedAt: string;
    unavailable: boolean;
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const [ads, embed] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    getGoogleAppEmbedStatus(admin),
  ]);
  const remarketing = ads?.remarketing;
  const purchaseLabel = remarketing
    ? resolveEventConversionLabel(
        remarketing.eventConversions,
        "purchase",
        remarketing.conversionLabel,
      )
    : "";
  const account = ads?.availableAccounts?.find((item) => item.id === ads.customerId);
  return {
    shopDomain: session.shop,
    shopifyApiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
    connected: Boolean(ads),
    customerId: ads?.customerId ?? "",
    customerName: account?.name ?? "",
    config: remarketing
      ? {
          tagId: remarketing.tagId,
          pixelName: remarketing.pixelName ?? "",
          conversionLabel: remarketing.conversionLabel ?? "",
          enabledEvents: remarketing.enabledEvents ?? [],
          enhancedConversions: remarketing.enhancedConversions ?? false,
          eventConversions: remarketing.eventConversions,
        }
      : null,
    customPixelScript: remarketing
      ? generateGooglePurchaseCustomPixel({
          tagId: remarketing.tagId,
          enabledFieldGroups: remarketing.enabledFieldGroups,
          conversionLabel: purchaseLabel,
          enhancedConversions: remarketing.enhancedConversions,
        })
      : null,
    embed: {
      enabled: embed.enabled,
      checkedAt: embed.checkedAt,
      unavailable: Boolean(embed.unavailable),
    },
  } satisfies GooglePixelLoaderData;
};

export default function AppAdsGooglePixelIndex() {
  return <GooglePixelsPage />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
