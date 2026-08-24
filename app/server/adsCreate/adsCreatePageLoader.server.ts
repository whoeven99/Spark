import type { AdsCreateLoaderData } from "../../routes/component/adsCreate/types";
import {
  getMetaAdsCredential,
  getTiktokAdsInsightsCredential,
  getGoogleAdsCredential,
} from "../adsCatalog/credentialStore.server";
import { fetchAdvertiserCurrency } from "./tiktokAdsApi.server";

export async function loadAdsCreatePageData(shop: string): Promise<AdsCreateLoaderData> {
  const [metaCred, tiktokCred, googleCred] = await Promise.all([
    getMetaAdsCredential(shop),
    getTiktokAdsInsightsCredential(shop),
    getGoogleAdsCredential(shop),
  ]);

  const developerTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());

  let tiktokCurrency = "";
  if (tiktokCred) {
    tiktokCurrency =
      (await fetchAdvertiserCurrency({
        accessToken: tiktokCred.accessToken,
        advertiserId: tiktokCred.advertiserId,
      })) ?? "";
  }

  return {
    meta: {
      connected: Boolean(metaCred),
      adAccountId: metaCred?.adAccountId ?? "",
      adAccountName: metaCred?.adAccountName ?? "",
      currencyCode: metaCred?.currencyCode ?? "",
    },
    tiktok: {
      connected: Boolean(tiktokCred),
      advertiserId: tiktokCred?.advertiserId ?? "",
      currencyCode: tiktokCurrency,
    },
    google: {
      connected: Boolean(googleCred),
      customerId: googleCred?.customerId ?? "",
      developerTokenConfigured,
    },
  };
}
