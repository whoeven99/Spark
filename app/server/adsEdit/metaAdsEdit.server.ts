/**
 * Meta (Facebook) Marketing API — 广告查询与编辑服务。
 * 依赖 MetaAdsCredential（meta_ads 平台）。
 *
 * API 参考：https://developers.facebook.com/docs/marketing-api/reference/
 */

import type {
  AdsListCampaign,
  AdsListAdSet,
  AdsListAd,
  MetaAdsEditDetail,
  MetaEditFormData,
} from "../../routes/component/adsEdit/types";

const META_API_VERSION = "v19.0";
const GRAPH_BASE = "https://graph.facebook.com";

type MetaApiError = { message?: string; type?: string; code?: number };

function graphUrl(path: string): string {
  return `${GRAPH_BASE}/${META_API_VERSION}${path}`;
}

async function metaGet<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(graphUrl(path));
  url.searchParams.set("access_token", accessToken);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const resp = await fetch(url.toString());
  const text = await resp.text();
  let json: { error?: MetaApiError } & Record<string, unknown>;
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`Meta API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (!resp.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API HTTP ${resp.status}`);
  }
  return json as T;
}

async function metaPost<T = Record<string, unknown>>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = graphUrl(path);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, ...body }),
  });
  const text = await resp.text();
  let json: { error?: MetaApiError } & Record<string, unknown>;
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`Meta API HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  if (!resp.ok || json.error) {
    throw new Error(json.error?.message ?? `Meta API HTTP ${resp.status}`);
  }
  return json as T;
}

function normalizeAdAccountId(id: string): string {
  const stripped = id.replace(/^act_/, "");
  return `act_${stripped}`;
}

// ─── 列表 ──────────────────────────────────────────────────────────────────────

export async function listMetaCampaigns(
  accessToken: string,
  adAccountId: string,
): Promise<AdsListCampaign[]> {
  const resp = await metaGet<{ data: Array<{ id: string; name: string; status: string }> }>(
    `/${normalizeAdAccountId(adAccountId)}/campaigns`,
    accessToken,
    { fields: "id,name,status", limit: "50" },
  );
  return (resp.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status }));
}

export async function listMetaAdSets(
  accessToken: string,
  campaignId: string,
): Promise<AdsListAdSet[]> {
  const resp = await metaGet<{ data: Array<{ id: string; name: string; status: string }> }>(
    `/${campaignId}/adsets`,
    accessToken,
    { fields: "id,name,status", limit: "50" },
  );
  return (resp.data ?? []).map((s) => ({ id: s.id, name: s.name, status: s.status }));
}

export async function listMetaAds(
  accessToken: string,
  adSetId: string,
): Promise<AdsListAd[]> {
  const resp = await metaGet<{ data: Array<{ id: string; name: string; status: string }> }>(
    `/${adSetId}/ads`,
    accessToken,
    { fields: "id,name,status", limit: "50" },
  );
  return (resp.data ?? []).map((a) => ({ id: a.id, name: a.name, status: a.status }));
}

// ─── 详情 ──────────────────────────────────────────────────────────────────────

interface MetaRawCampaign {
  id: string;
  name: string;
  status: string;
  daily_budget?: string;
}

interface MetaRawAdSet {
  id: string;
  name: string;
  status: string;
  start_time?: string;
  end_time?: string;
  daily_budget?: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[] };
  };
}

interface MetaRawAd {
  id: string;
  name: string;
  status: string;
  adset_id?: string;
  campaign_id?: string;
  creative?: {
    id?: string;
    name?: string;
    object_story_spec?: {
      link_data?: {
        message?: string;
        link?: string;
        name?: string;
        picture?: string;
        call_to_action?: { type?: string };
      };
    };
  };
}

export async function getMetaAdDetail(
  accessToken: string,
  adId: string,
): Promise<MetaAdsEditDetail> {
  const adFields =
    "id,name,status,adset_id,campaign_id,creative{id,name,object_story_spec}";
  const ad = await metaGet<MetaRawAd>(`/${adId}`, accessToken, { fields: adFields });

  const adSetId = ad.adset_id ?? "";
  const campaignId = ad.campaign_id ?? "";

  const [adSet, campaign] = await Promise.all([
    metaGet<MetaRawAdSet>(`/${adSetId}`, accessToken, {
      fields: "id,name,status,start_time,end_time,daily_budget,targeting",
    }),
    metaGet<MetaRawCampaign>(`/${campaignId}`, accessToken, {
      fields: "id,name,status,daily_budget",
    }),
  ]);

  const linkData = ad.creative?.object_story_spec?.link_data;
  const genders = adSet.targeting?.genders ?? [];
  let gender: "ALL" | "MALE" | "FEMALE" = "ALL";
  if (genders.includes(1) && !genders.includes(2)) gender = "MALE";
  else if (genders.includes(2) && !genders.includes(1)) gender = "FEMALE";

  const countries = adSet.targeting?.geo_locations?.countries ?? [];

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: (campaign.status === "PAUSED" ? "PAUSED" : "ACTIVE") as "ACTIVE" | "PAUSED",
      dailyBudget: campaign.daily_budget
        ? (parseInt(campaign.daily_budget, 10) / 100).toFixed(2)
        : "",
    },
    adSet: {
      id: adSet.id,
      name: adSet.name,
      status: (adSet.status === "PAUSED" ? "PAUSED" : "ACTIVE") as "ACTIVE" | "PAUSED",
      startTime: adSet.start_time ?? "",
      endTime: adSet.end_time ?? "",
      ageMin: String(adSet.targeting?.age_min ?? 18),
      ageMax: String(adSet.targeting?.age_max ?? 65),
      gender,
      geoCountries: countries.join(", "),
    },
    ad: {
      id: ad.id,
      name: ad.name,
      status: (ad.status === "PAUSED" ? "PAUSED" : "ACTIVE") as "ACTIVE" | "PAUSED",
      headline: linkData?.name ?? "",
      body: linkData?.message ?? "",
      callToAction: linkData?.call_to_action?.type ?? "LEARN_MORE",
      imageUrl: linkData?.picture ?? "",
      linkUrl: linkData?.link ?? "",
    },
  };
}

// ─── 更新 ──────────────────────────────────────────────────────────────────────

export async function updateMetaAd(params: {
  accessToken: string;
  adAccountId: string;
  campaignId: string;
  adSetId: string;
  adId: string;
  form: MetaEditFormData;
}): Promise<void> {
  const { accessToken, campaignId, adSetId, adId, form } = params;

  // Campaign 层更新
  const campaignBody: Record<string, unknown> = {
    name: form.campaign.name,
    status: form.campaign.status,
  };
  if (form.campaign.dailyBudget) {
    campaignBody.daily_budget = Math.round(parseFloat(form.campaign.dailyBudget) * 100);
  }
  await metaPost(`/${campaignId}`, accessToken, campaignBody);

  // Ad Set 层更新
  const targeting: Record<string, unknown> = {
    age_min: parseInt(form.adSet.ageMin || "18", 10),
    age_max: parseInt(form.adSet.ageMax || "65", 10),
  };
  if (form.adSet.gender !== "ALL") {
    targeting.genders = form.adSet.gender === "MALE" ? [1] : [2];
  }
  const countries = form.adSet.geoCountries
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (countries.length > 0) {
    targeting.geo_locations = { countries };
  }

  const adSetBody: Record<string, unknown> = {
    name: form.adSet.name,
    status: form.adSet.status,
    targeting,
  };
  if (form.adSet.startTime) adSetBody.start_time = form.adSet.startTime;
  if (form.adSet.endTime) adSetBody.end_time = form.adSet.endTime;

  await metaPost(`/${adSetId}`, accessToken, adSetBody);

  // Ad 层更新（先更新 creative，再更新 ad）
  const adResp = await metaGet<{ id: string; creative?: { id?: string } }>(
    `/${adId}`,
    accessToken,
    { fields: "id,creative{id}" },
  );
  const creativeId = adResp.creative?.id;

  if (creativeId) {
    const existingCreative = await metaGet<{
      object_story_spec?: { page_id?: string };
    }>(`/${creativeId}`, accessToken, { fields: "object_story_spec" });
    const pageId = (existingCreative.object_story_spec?.page_id ?? "").trim();
    if (!pageId) {
      throw new Error(
        "无法从现有广告创意读取 Facebook Page ID，请在 Meta Ads Manager 中确认该广告关联了主页后再编辑",
      );
    }

    const creativeBody: Record<string, unknown> = {
      object_story_spec: {
        page_id: pageId,
        link_data: {
          message: form.ad.body,
          link: form.ad.linkUrl,
          name: form.ad.headline,
          call_to_action: {
            type: form.ad.callToAction,
            value: { link: form.ad.linkUrl },
          },
          ...(form.ad.imageUrl ? { picture: form.ad.imageUrl } : {}),
        },
      },
    };
    await metaPost(`/${creativeId}`, accessToken, creativeBody);
  }

  await metaPost(`/${adId}`, accessToken, {
    name: form.ad.name,
    status: form.ad.status,
  });
}
