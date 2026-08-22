import type { AdsEditLoaderData } from "../../routes/component/adsEdit/types";
import {
  getMetaAdsCredential,
  getTiktokAdsInsightsCredential,
  getGoogleAdsCredential,
} from "../adsCatalog/credentialStore.server";

export async function loadAdsEditPageData(shop: string): Promise<AdsEditLoaderData> {
  const [metaCred, tiktokCred, googleCred] = await Promise.all([
    getMetaAdsCredential(shop),
    getTiktokAdsInsightsCredential(shop),
    getGoogleAdsCredential(shop),
  ]);

  const developerTokenConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());

  return {
    meta: {
      connected: Boolean(metaCred),
      adAccountId: metaCred?.adAccountId ?? "",
      adAccountName: metaCred?.adAccountName ?? "",
    },
    tiktok: {
      connected: Boolean(tiktokCred),
      advertiserId: tiktokCred?.advertiserId ?? "",
    },
    google: {
      connected: Boolean(googleCred) && developerTokenConfigured,
      customerId: googleCred?.customerId ?? "",
      developerTokenConfigured,
    },
  };
}
