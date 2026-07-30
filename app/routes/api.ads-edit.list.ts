import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getMetaAdsCredential,
  getTiktokAdsInsightsCredential,
} from "../server/adsCatalog/credentialStore.server";
import { prepareGoogleAdsApiAuth } from "../server/adsCatalog/googleAdsToken.server";
import {
  listMetaCampaigns,
  listMetaAdSets,
  listMetaAds,
  getMetaAdDetail,
} from "../server/adsEdit/metaAdsEdit.server";
import {
  listTiktokCampaigns,
  listTiktokAdGroups,
  listTiktokAds,
  getTiktokAdDetail,
} from "../server/adsEdit/tiktokAdsEdit.server";
import {
  listGoogleCampaigns,
  listGoogleAdGroups,
  listGoogleAds,
  getGoogleAdDetail,
} from "../server/adsEdit/googleAdsEdit.server";
import type { AdsListApiResponse } from "./component/adsEdit/types";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") ?? "";
  const level = url.searchParams.get("level") ?? "";
  const campaignId = url.searchParams.get("campaignId") ?? "";
  const adSetId = url.searchParams.get("adSetId") ?? "";
  const adId = url.searchParams.get("adId") ?? "";

  try {
    if (platform === "meta") {
      const cred = await getMetaAdsCredential(shop);
      if (!cred) {
        return data<AdsListApiResponse>({ ok: false, errorMsg: "Meta 广告账户未连接" });
      }

      if (level === "campaigns") {
        const campaigns = await listMetaCampaigns(cred.accessToken, cred.adAccountId);
        return data<AdsListApiResponse>({ ok: true, campaigns });
      }
      if (level === "adsets" && campaignId) {
        const adSets = await listMetaAdSets(cred.accessToken, campaignId);
        return data<AdsListApiResponse>({ ok: true, adSets });
      }
      if (level === "ads" && adSetId) {
        const ads = await listMetaAds(cred.accessToken, adSetId);
        return data<AdsListApiResponse>({ ok: true, ads });
      }
      if (level === "detail" && adId) {
        const detail = await getMetaAdDetail(cred.accessToken, adId);
        return data<AdsListApiResponse>({ ok: true, detail });
      }
    }

    if (platform === "tiktok") {
      const cred = await getTiktokAdsInsightsCredential(shop);
      if (!cred) {
        return data<AdsListApiResponse>({ ok: false, errorMsg: "TikTok 广告账户未连接" });
      }

      if (level === "campaigns") {
        const campaigns = await listTiktokCampaigns(cred.accessToken, cred.advertiserId);
        return data<AdsListApiResponse>({ ok: true, campaigns });
      }
      if (level === "adsets" && campaignId) {
        const adSets = await listTiktokAdGroups(cred.accessToken, cred.advertiserId, campaignId);
        return data<AdsListApiResponse>({ ok: true, adSets });
      }
      if (level === "ads" && adSetId) {
        const ads = await listTiktokAds(cred.accessToken, cred.advertiserId, adSetId);
        return data<AdsListApiResponse>({ ok: true, ads });
      }
      if (level === "detail" && adId) {
        const detail = await getTiktokAdDetail(cred.accessToken, cred.advertiserId, adId);
        return data<AdsListApiResponse>({ ok: true, detail });
      }
    }

    if (platform === "google") {
      const auth = await prepareGoogleAdsApiAuth(shop);

      if (level === "campaigns") {
        const campaigns = await listGoogleCampaigns({
          accessToken: auth.accessToken,
          customerId: auth.customerId,
          loginCustomerId: auth.loginCustomerId,
        });
        return data<AdsListApiResponse>({ ok: true, campaigns });
      }
      if (level === "adsets" && campaignId) {
        const adSets = await listGoogleAdGroups({
          accessToken: auth.accessToken,
          customerId: auth.customerId,
          loginCustomerId: auth.loginCustomerId,
          campaignId,
        });
        return data<AdsListApiResponse>({ ok: true, adSets });
      }
      if (level === "ads" && adSetId) {
        const ads = await listGoogleAds({
          accessToken: auth.accessToken,
          customerId: auth.customerId,
          loginCustomerId: auth.loginCustomerId,
          adGroupId: adSetId,
        });
        return data<AdsListApiResponse>({ ok: true, ads });
      }
      if (level === "detail" && adId) {
        const detail = await getGoogleAdDetail({
          accessToken: auth.accessToken,
          customerId: auth.customerId,
          loginCustomerId: auth.loginCustomerId,
          adId,
        });
        return data<AdsListApiResponse>({ ok: true, detail });
      }
    }

    return data<AdsListApiResponse>(
      { ok: false, errorMsg: `不支持的参数：platform=${platform} level=${level}` },
      { status: 400 },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "查询失败，请重试";
    console.error(`[AdsEditList][${platform}][${level}]`, errorMsg);
    return data<AdsListApiResponse>({ ok: false, errorMsg });
  }
};
