import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGoogleAdsCredential } from "../server/adsCatalog/credentialStore.server";
import { getGoogleAppEmbedStatus } from "../server/adsCatalog/appEmbedStatus.server";
import { generateGooglePurchaseCustomPixel } from "../lib/googleCustomPixel";
import { GooglePixelDataPage } from "./page/GooglePixelDataPage";

export type GooglePixelDataLoaderData = {
  shopDomain: string;
  shopifyApiKey: string;
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
  const { session, admin } = await authenticate.admin(request);
  const [ads, embed] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    getGoogleAppEmbedStatus(admin),
  ]);
  const remarketing = ads?.remarketing ?? null;
  return {
    shopDomain: session.shop,
    shopifyApiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
    adsConnected: Boolean(ads),
    customerId: ads?.customerId ?? "",
    loginCustomerId: ads?.loginCustomerId ?? "",
    credentialUpdatedAt: ads?.updatedAt ?? null,
    config: remarketing
      ? {
          tagId: remarketing.tagId,
          source: remarketing.source,
          confirmedAt: remarketing.confirmedAt,
          enabledEvents: remarketing.enabledEvents ?? [],
          enabledFieldGroups: remarketing.enabledFieldGroups ?? [],
          pixelName: remarketing.pixelName ?? "",
          conversionLabel: remarketing.conversionLabel ?? "",
          enhancedConversions: Boolean(remarketing.enhancedConversions),
          customPixelConfirmedAt: remarketing.customPixelConfirmedAt ?? null,
          metafieldSyncStatus: remarketing.metafieldSync?.status ?? "",
          metafieldSyncUpdatedAt: remarketing.metafieldSync?.updatedAt ?? null,
          metafieldSyncError: remarketing.metafieldSync?.error ?? "",
        }
      : null,
    customPixelScript: remarketing
      ? generateGooglePurchaseCustomPixel({
          tagId: remarketing.tagId,
          enabledFieldGroups: remarketing.enabledFieldGroups,
          conversionLabel: remarketing.conversionLabel,
          enhancedConversions: remarketing.enhancedConversions,
        })
      : null,
    embed: {
      enabled: embed.enabled,
      checkedAt: embed.checkedAt,
      unavailable: Boolean(embed.unavailable),
    },
  } satisfies GooglePixelDataLoaderData;
};

export default function AppAdsGooglePixelData() {
  return <GooglePixelDataPage />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
