import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getFacebookCatalogCredential,
  getMetaAdsCredential,
  getMetaPixelDataManualCredential,
} from "../server/adsCatalog/credentialStore.server";
import { getMetaAppEmbedStatus } from "../server/adsCatalog/appEmbedStatus.server";
import { hasMetaCapiAccessAvailable } from "../server/adsCatalog/metaPixelConfig.server";
import { MetaPixelDataPage } from "./page/MetaPixelDataPage";

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
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const [catalog, metaAds, embed, capiAvailable, manualCredential] = await Promise.all([
    getFacebookCatalogCredential(shop),
    getMetaAdsCredential(shop),
    getMetaAppEmbedStatus(admin),
    hasMetaCapiAccessAvailable(shop),
    getMetaPixelDataManualCredential(shop),
  ]);

  const pixelId = catalog?.pixelId?.trim() ?? "";
  const enabledEvents = Array.isArray(catalog?.enabledEvents)
    ? catalog.enabledEvents.filter((e) => typeof e === "string")
    : [];

  return {
    shopDomain: shop,
    shopifyApiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
    metaCatalogConnected: Boolean(catalog?.catalogId),
    catalogId: catalog?.catalogId ?? "",
    businessId: catalog?.businessId ?? "",
    credentialUpdatedAt: catalog?.updatedAt ?? null,
    metaAdsConnected: Boolean(metaAds),
    metaAdsAdAccountId: metaAds?.adAccountId ?? "",
    manualAuthConnected: Boolean(manualCredential?.accessToken),
    manualAuthUpdatedAt: manualCredential?.updatedAt ?? null,
    config: pixelId
      ? {
          pixelId,
          capiEnabled: Boolean(catalog?.capiEnabled),
          hasCapiAccessToken: capiAvailable,
          testEventCode: catalog?.testEventCode?.trim() ?? "",
          enabledEvents,
        }
      : null,
    embed: {
      enabled: embed.enabled,
      checkedAt: embed.checkedAt,
      unavailable: Boolean(embed.unavailable),
    },
  } satisfies MetaPixelDataLoaderData;
};

export default function AppAdsMetaPixelData() {
  return <MetaPixelDataPage />;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
