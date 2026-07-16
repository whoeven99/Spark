import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getMetaAdsCredential,
  getTiktokCatalogCredential,
  getGoogleAdsCredential,
} from "../server/adsCatalog/credentialStore.server";
import { createMetaAd } from "../server/adsCreate/metaAdsCreate.server";
import { createTiktokAd } from "../server/adsCreate/tiktokAdsCreate.server";
import { createGoogleAd } from "../server/adsCreate/googleAdsCreate.server";
import type {
  AdsCreateRequest,
  AdsCreateApiResponse,
} from "./component/adsCreate/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let body: AdsCreateRequest;
  try {
    body = (await request.json()) as AdsCreateRequest;
  } catch {
    return data<AdsCreateApiResponse>(
      { ok: false, platform: "meta", errorMsg: "请求格式错误" },
      { status: 400 },
    );
  }

  const { platform } = body;

  try {
    if (platform === "meta") {
      const form = body.meta;
      if (!form) throw new Error("缺少 meta 表单数据");

      const cred = await getMetaAdsCredential(shop);
      if (!cred) throw new Error("Meta 广告账户未连接，请前往 Ads Catalog 授权");

      const result = await createMetaAd({
        accessToken: cred.accessToken,
        adAccountId: cred.adAccountId,
        form,
      });

      return data<AdsCreateApiResponse>({
        ok: true,
        platform: "meta",
        campaignId: result.campaignId,
        adSetId: result.adSetId,
        adId: result.adId,
      });
    }

    if (platform === "tiktok") {
      const form = body.tiktok;
      if (!form) throw new Error("缺少 tiktok 表单数据");

      const cred = await getTiktokCatalogCredential(shop);
      if (!cred) throw new Error("TikTok 广告主账户未连接，请前往 Ads Catalog 授权");

      const result = await createTiktokAd({
        accessToken: cred.accessToken,
        advertiserId: cred.advertiserId,
        form,
      });

      return data<AdsCreateApiResponse>({
        ok: true,
        platform: "tiktok",
        campaignId: result.campaignId,
        adGroupId: result.adGroupId,
        adId: result.adId,
      });
    }

    if (platform === "google") {
      const form = body.google;
      if (!form) throw new Error("缺少 google 表单数据");

      const cred = await getGoogleAdsCredential(shop);
      if (!cred) throw new Error("Google Ads 账户未连接，请前往 Ads Catalog 授权");

      const result = await createGoogleAd({
        accessToken: cred.accessToken,
        customerId: cred.customerId,
        loginCustomerId: cred.loginCustomerId,
        form,
      });

      return data<AdsCreateApiResponse>({
        ok: true,
        platform: "google",
        campaignId: result.campaignId,
        adGroupId: result.adGroupId,
        adId: result.adId,
      });
    }

    return data<AdsCreateApiResponse>(
      { ok: false, platform, errorMsg: `不支持的平台：${String(platform)}` },
      { status: 400 },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "广告创建失败，请重试";
    console.error(`[AdsCreate][${platform}] error:`, errorMsg);
    return data<AdsCreateApiResponse>({ ok: false, platform, errorMsg });
  }
};
