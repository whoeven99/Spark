/**
 * TikTok Marketing API — 广告查询与编辑服务。
 * 依赖 TiktokAdsInsightsCredential（OAuth 完成即可）。
 *
 * API 参考：https://business-api.tiktok.com/portal/docs
 */

import type {
  AdsListCampaign,
  AdsListAdSet,
  AdsListAd,
  TiktokAdsEditDetail,
  TiktokEditFormData,
} from "../../routes/component/adsEdit/types";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

type TiktokApiPayload<T = Record<string, unknown>> = {
  code: number;
  message: string;
  data?: T;
  request_id?: string;
};

async function tiktokGet<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString(), {
    headers: { "Access-Token": accessToken },
  });
  const text = await resp.text();
  let payload: TiktokApiPayload<T>;
  try {
    payload = JSON.parse(text) as TiktokApiPayload<T>;
  } catch {
    throw new Error(`TikTok API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (payload.code !== 0) {
    throw new Error(payload.message ?? `TikTok API error code ${payload.code}`);
  }
  return payload.data as T;
}

async function tiktokPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const resp = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let payload: TiktokApiPayload<T>;
  try {
    payload = JSON.parse(text) as TiktokApiPayload<T>;
  } catch {
    throw new Error(`TikTok API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (payload.code !== 0) {
    throw new Error(payload.message ?? `TikTok API error code ${payload.code}`);
  }
  return payload.data as T;
}

// ─── 列表 ──────────────────────────────────────────────────────────────────────

interface TiktokCampaignItem {
  campaign_id: string;
  campaign_name: string;
  operation_status: string;
  budget_mode: string;
  budget: number;
}

export async function listTiktokCampaigns(
  accessToken: string,
  advertiserId: string,
): Promise<AdsListCampaign[]> {
  const data = await tiktokGet<{ list?: TiktokCampaignItem[] }>(
    "/campaign/get/",
    accessToken,
    { advertiser_id: advertiserId, page_size: "50" },
  );
  return (data.list ?? []).map((c) => ({
    id: c.campaign_id,
    name: c.campaign_name,
    status: c.operation_status,
  }));
}

interface TiktokAdGroupItem {
  adgroup_id: string;
  adgroup_name: string;
  operation_status: string;
  budget_mode: string;
  budget: number;
  schedule_start_time?: string;
  schedule_end_time?: string;
  gender?: string;
}

export async function listTiktokAdGroups(
  accessToken: string,
  advertiserId: string,
  campaignId: string,
): Promise<AdsListAdSet[]> {
  const data = await tiktokGet<{ list?: TiktokAdGroupItem[] }>(
    "/adgroup/get/",
    accessToken,
    { advertiser_id: advertiserId, campaign_id: campaignId, page_size: "50" },
  );
  return (data.list ?? []).map((g) => ({
    id: g.adgroup_id,
    name: g.adgroup_name,
    status: g.operation_status,
  }));
}

interface TiktokAdItem {
  ad_id: string;
  ad_name: string;
  operation_status: string;
  ad_text?: string;
  call_to_action?: string;
  image_ids?: string[];
  landing_page_url?: string;
}

export async function listTiktokAds(
  accessToken: string,
  advertiserId: string,
  adGroupId: string,
): Promise<AdsListAd[]> {
  const data = await tiktokGet<{ list?: TiktokAdItem[] }>(
    "/ad/get/",
    accessToken,
    { advertiser_id: advertiserId, adgroup_id: adGroupId, page_size: "50" },
  );
  return (data.list ?? []).map((a) => ({
    id: a.ad_id,
    name: a.ad_name,
    status: a.operation_status,
  }));
}

// ─── 详情 ──────────────────────────────────────────────────────────────────────

export async function getTiktokAdDetail(
  accessToken: string,
  advertiserId: string,
  adId: string,
): Promise<TiktokAdsEditDetail> {
  const adData = await tiktokGet<{ list?: TiktokAdItem[] }>(
    "/ad/get/",
    accessToken,
    { advertiser_id: advertiserId, ad_ids: `["${adId}"]`, page_size: "1" },
  );
  const ad = adData.list?.[0];
  if (!ad) throw new Error(`TikTok 广告 ${adId} 不存在`);

  // 通过 adgroup 获取 campaign_id
  // TikTok API 需先查 adgroup 拿到 campaign_id
  const adGroupId = "";
  let adGroupData: TiktokAdGroupItem | undefined;
  let campaignData: TiktokCampaignItem | undefined;

  // 搜索所有 adgroup 直到找到包含该 ad 的 adgroup（简化：用全量获取）
  const campaigns = await listTiktokCampaigns(accessToken, advertiserId);
  for (const campaign of campaigns) {
    const groups = await tiktokGet<{ list?: TiktokAdGroupItem[] }>(
      "/adgroup/get/",
      accessToken,
      { advertiser_id: advertiserId, campaign_id: campaign.id, page_size: "50" },
    );
    for (const group of groups.list ?? []) {
      const adsInGroup = await tiktokGet<{ list?: TiktokAdItem[] }>(
        "/ad/get/",
        accessToken,
        { advertiser_id: advertiserId, adgroup_id: group.adgroup_id, page_size: "50" },
      );
      if ((adsInGroup.list ?? []).some((a) => a.ad_id === adId)) {
        adGroupData = group;
        // 获取完整 campaign 数据
        const campList = await tiktokGet<{ list?: TiktokCampaignItem[] }>(
          "/campaign/get/",
          accessToken,
          { advertiser_id: advertiserId, campaign_ids: `["${campaign.id}"]` },
        );
        campaignData = campList.list?.[0];
        break;
      }
    }
    if (adGroupData) break;
  }

  if (!adGroupData || !campaignData) {
    throw new Error(`无法找到广告 ${adId} 所属的广告组/系列`);
  }

  const genderMap: Record<string, "GENDER_UNLIMITED" | "GENDER_MALE" | "GENDER_FEMALE"> = {
    GENDER_MALE: "GENDER_MALE",
    GENDER_FEMALE: "GENDER_FEMALE",
  };

  return {
    campaign: {
      id: campaignData.campaign_id,
      name: campaignData.campaign_name,
      status: campaignData.operation_status === "DISABLE" ? "DISABLE" : "ENABLE",
      budgetMode: campaignData.budget_mode,
      budget: String(campaignData.budget ?? ""),
    },
    adGroup: {
      id: adGroupData.adgroup_id,
      name: adGroupData.adgroup_name,
      status: adGroupData.operation_status === "DISABLE" ? "DISABLE" : "ENABLE",
      budgetMode: adGroupData.budget_mode,
      budget: String(adGroupData.budget ?? ""),
      scheduleStart: adGroupData.schedule_start_time ?? "",
      scheduleEnd: adGroupData.schedule_end_time ?? "",
      gender: genderMap[adGroupData.gender ?? ""] ?? "GENDER_UNLIMITED",
    },
    ad: {
      id: ad.ad_id,
      name: ad.ad_name,
      status: ad.operation_status === "DISABLE" ? "DISABLE" : "ENABLE",
      adText: ad.ad_text ?? "",
      callToAction: ad.call_to_action ?? "",
      imageUrl: "",
      landingUrl: ad.landing_page_url ?? "",
    },
  };
}

// ─── 更新 ──────────────────────────────────────────────────────────────────────

export async function updateTiktokAd(params: {
  accessToken: string;
  advertiserId: string;
  campaignId: string;
  adGroupId: string;
  adId: string;
  form: TiktokEditFormData;
}): Promise<void> {
  const { accessToken, advertiserId, campaignId, adGroupId, adId, form } = params;

  // Campaign 层
  await tiktokPost("/campaign/update/", accessToken, {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    campaign_name: form.campaign.name,
    operation_status: form.campaign.status,
    budget_mode: form.campaign.budgetMode,
    ...(form.campaign.budget ? { budget: parseFloat(form.campaign.budget) } : {}),
  });

  // Ad Group 层
  const adGroupBody: Record<string, unknown> = {
    advertiser_id: advertiserId,
    adgroup_id: adGroupId,
    adgroup_name: form.adGroup.name,
    operation_status: form.adGroup.status,
    budget_mode: form.adGroup.budgetMode,
    gender: form.adGroup.gender,
  };
  if (form.adGroup.budget) adGroupBody.budget = parseFloat(form.adGroup.budget);
  if (form.adGroup.scheduleStart) adGroupBody.schedule_start_time = form.adGroup.scheduleStart;
  if (form.adGroup.scheduleEnd) adGroupBody.schedule_end_time = form.adGroup.scheduleEnd;
  await tiktokPost("/adgroup/update/", accessToken, adGroupBody);

  // Ad 层
  const adBody: Record<string, unknown> = {
    advertiser_id: advertiserId,
    ad_id: adId,
    ad_name: form.ad.name,
    operation_status: form.ad.status,
    ad_text: form.ad.adText,
    landing_page_url: form.ad.landingUrl,
  };
  if (form.ad.callToAction) adBody.call_to_action = form.ad.callToAction;
  await tiktokPost("/ad/update/", accessToken, adBody);
}
