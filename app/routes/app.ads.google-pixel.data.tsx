import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGoogleAdsCredential } from "../server/adsCatalog/credentialStore.server";
import { getGoogleAppEmbedStatus } from "../server/adsCatalog/appEmbedStatus.server";
import { ensureGoogleRemarketingIngestEndpoint } from "../server/adsCatalog/googleRemarketing.server";
// 审核期临时关闭 5.1.1：不下发 purchase Custom Pixel 脚本。过审后恢复。
// import { generateGooglePurchaseCustomPixel } from "../lib/googleCustomPixel";
import { resolvePixelIngestEndpoint } from "../server/webPixel/ensureWebPixel.server";
import { GooglePixelDataPage } from "./page/GooglePixelDataPage";

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
  const { session, admin } = await authenticate.admin(request);
  const [ads, embed] = await Promise.all([
    getGoogleAdsCredential(session.shop),
    getGoogleAppEmbedStatus(admin),
    // 已配置店铺补写 ingestEndpoint，避免必须重新保存向导才能双写 SLS。
    ensureGoogleRemarketingIngestEndpoint({ shop: session.shop, admin }).catch(() => undefined),
  ]);
  const remarketing = ads?.remarketing ?? null;
  const ingestEndpoint = resolvePixelIngestEndpoint() ?? "";
  return {
    shopDomain: session.shop,
    shopifyApiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
    ingestEndpoint,
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
    // 审核期临时关闭 5.1.1：不下发 purchase Custom Pixel 脚本。过审后恢复 generateGooglePurchaseCustomPixel。
    customPixelScript: null,
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
