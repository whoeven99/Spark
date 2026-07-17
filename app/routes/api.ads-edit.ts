import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getMetaAdsCredential,
  getTiktokAdsInsightsCredential,
} from "../server/adsCatalog/credentialStore.server";
import { prepareGoogleAdsApiAuth } from "../server/adsCatalog/googleAdsToken.server";
import { updateMetaAd } from "../server/adsEdit/metaAdsEdit.server";
import { updateTiktokAd } from "../server/adsEdit/tiktokAdsEdit.server";
import { updateGoogleAd } from "../server/adsEdit/googleAdsEdit.server";
import type { AdsEditRequest, AdsEditApiResponse } from "./component/adsEdit/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let body: AdsEditRequest;
  try {
    body = (await request.json()) as AdsEditRequest;
  } catch {
    return data<AdsEditApiResponse>(
      { ok: false, platform: "meta", errorMsg: "请求格式错误" },
      { status: 400 },
    );
  }

  const { platform, campaignId, adSetId, adGroupId, adId } = body;

  try {
    if (platform === "meta") {
      const form = body.meta;
      if (!form) throw new Error("缺少 meta 表单数据");

      const cred = await getMetaAdsCredential(shop);
      if (!cred) throw new Error("Meta 广告账户未连接");

      await updateMetaAd({
        accessToken: cred.accessToken,
        adAccountId: cred.adAccountId,
        campaignId,
        adSetId: adSetId ?? "",
        adId,
        form,
      });

      return data<AdsEditApiResponse>({ ok: true, platform: "meta" });
    }

    if (platform === "tiktok") {
      const form = body.tiktok;
      if (!form) throw new Error("缺少 tiktok 表单数据");

      const cred = await getTiktokAdsInsightsCredential(shop);
      if (!cred) throw new Error("TikTok 广告账户未连接");

      await updateTiktokAd({
        accessToken: cred.accessToken,
        advertiserId: cred.advertiserId,
        campaignId,
        adGroupId: adGroupId ?? adSetId ?? "",
        adId,
        form,
      });

      return data<AdsEditApiResponse>({ ok: true, platform: "tiktok" });
    }

    if (platform === "google") {
      const form = body.google;
      if (!form) throw new Error("缺少 google 表单数据");

      const auth = await prepareGoogleAdsApiAuth(shop);

      await updateGoogleAd({
        accessToken: auth.accessToken,
        customerId: auth.customerId,
        loginCustomerId: auth.loginCustomerId,
        form,
      });

      return data<AdsEditApiResponse>({ ok: true, platform: "google" });
    }

    return data<AdsEditApiResponse>(
      { ok: false, platform, errorMsg: `不支持的平台：${String(platform)}` },
      { status: 400 },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "广告更新失败，请重试";
    console.error(`[AdsEdit][${platform}] error:`, errorMsg);
    return data<AdsEditApiResponse>({ ok: false, platform, errorMsg });
  }
};
