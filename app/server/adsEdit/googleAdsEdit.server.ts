/**
 * Google Ads REST API v24 — 广告查询与编辑服务。
 * 复用现有 GoogleAdsCredential 和 GOOGLE_ADS_DEVELOPER_TOKEN。
 *
 * API 参考：https://developers.google.com/google-ads/api/rest/reference/rest/v24
 */

import type {
  AdsListCampaign,
  AdsListAdSet,
  AdsListAd,
  GoogleAdsEditDetail,
  GoogleEditFormData,
} from "../../routes/component/adsEdit/types";
import {
  buildGoogleAdsHeaders,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
} from "../adsCatalog/googleAdsApi.server";
import { getGoogleAdsDeveloperToken } from "../adsCatalog/googleOAuth.server";

function getDeveloperToken(): string {
  const token = getGoogleAdsDeveloperToken();
  if (!token) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN 环境变量未配置");
  return token;
}

function toMicros(amount: string): number {
  return Math.round(parseFloat(amount || "0") * 1_000_000);
}

function fromMicros(micros: number | string | undefined): string {
  if (!micros) return "";
  return (Number(micros) / 1_000_000).toFixed(2);
}

async function gaqlSearch<T = unknown>(params: {
  accessToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
  query: string;
}): Promise<T[]> {
  const customerId = normalizeCustomerId(params.customerId);
  const url = googleAdsApiUrl(`/customers/${customerId}/googleAds:searchStream`);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...buildGoogleAdsHeaders({
        accessToken: params.accessToken,
        developerToken: params.developerToken,
        loginCustomerId: params.loginCustomerId,
      }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: params.query }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(parseGoogleAdsError(text, resp.status));
  }
  const lines = text.trim().split("\n").filter(Boolean);
  const rows: T[] = [];
  for (const line of lines) {
    try {
      const batch = JSON.parse(line) as { results?: T[] };
      rows.push(...(batch.results ?? []));
    } catch {
      // 忽略非 JSON 行
    }
  }
  return rows;
}

async function googleMutate<T = unknown>(
  path: string,
  headers: Record<string, string>,
  operations: unknown[],
): Promise<T> {
  const url = googleAdsApiUrl(path);
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ operations }),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(parseGoogleAdsError(text, resp.status));
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Google Ads API parse error: ${text.slice(0, 200)}`);
  }
  return json as T;
}

// ─── 列表 ──────────────────────────────────────────────────────────────────────

interface CampaignRow {
  campaign?: { id?: string; name?: string; status?: string; resourceName?: string };
}

export async function listGoogleCampaigns(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
}): Promise<AdsListCampaign[]> {
  const developerToken = getDeveloperToken();
  const rows = await gaqlSearch<CampaignRow>({
    ...params,
    developerToken,
    query: `SELECT campaign.id, campaign.name, campaign.status
            FROM campaign
            WHERE campaign.status != 'REMOVED'
            LIMIT 100`,
  });
  return rows.map((r) => ({
    id: r.campaign?.id ?? "",
    name: r.campaign?.name ?? "",
    status: r.campaign?.status ?? "",
  }));
}

interface AdGroupRow {
  adGroup?: { id?: string; name?: string; status?: string; resourceName?: string; cpcBidMicros?: string };
}

export async function listGoogleAdGroups(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  campaignId: string;
}): Promise<AdsListAdSet[]> {
  const developerToken = getDeveloperToken();
  const rows = await gaqlSearch<AdGroupRow>({
    accessToken: params.accessToken,
    developerToken,
    customerId: params.customerId,
    loginCustomerId: params.loginCustomerId,
    query: `SELECT ad_group.id, ad_group.name, ad_group.status
            FROM ad_group
            WHERE campaign.id = ${params.campaignId}
              AND ad_group.status != 'REMOVED'
            LIMIT 100`,
  });
  return rows.map((r) => ({
    id: r.adGroup?.id ?? "",
    name: r.adGroup?.name ?? "",
    status: r.adGroup?.status ?? "",
  }));
}

interface AdRow {
  adGroupAd?: {
    ad?: {
      id?: string;
      name?: string;
      resourceName?: string;
      finalUrls?: string[];
      responsiveSearchAd?: {
        headlines?: Array<{ text?: string }>;
        descriptions?: Array<{ text?: string }>;
      };
    };
    status?: string;
  };
  adGroup?: { resourceName?: string; id?: string; name?: string; status?: string; cpcBidMicros?: string };
  campaign?: { resourceName?: string; id?: string; campaignBudget?: string };
  campaignBudget?: { amountMicros?: string; resourceName?: string };
}

export async function listGoogleAds(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  adGroupId: string;
}): Promise<AdsListAd[]> {
  const developerToken = getDeveloperToken();
  const rows = await gaqlSearch<AdRow>({
    accessToken: params.accessToken,
    developerToken,
    customerId: params.customerId,
    loginCustomerId: params.loginCustomerId,
    query: `SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status
            FROM ad_group_ad
            WHERE ad_group.id = ${params.adGroupId}
              AND ad_group_ad.status != 'REMOVED'
            LIMIT 100`,
  });
  return rows.map((r) => ({
    id: r.adGroupAd?.ad?.id ?? "",
    name: r.adGroupAd?.ad?.name ?? r.adGroupAd?.ad?.id ?? "",
    status: r.adGroupAd?.status ?? "",
  }));
}

// ─── 详情 ──────────────────────────────────────────────────────────────────────

export async function getGoogleAdDetail(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  adId: string;
}): Promise<GoogleAdsEditDetail> {
  const developerToken = getDeveloperToken();
  const rows = await gaqlSearch<AdRow>({
    accessToken: params.accessToken,
    developerToken,
    customerId: params.customerId,
    loginCustomerId: params.loginCustomerId,
    query: `SELECT
              ad_group_ad.ad.id,
              ad_group_ad.ad.name,
              ad_group_ad.ad.final_urls,
              ad_group_ad.ad.responsive_search_ad.headlines,
              ad_group_ad.ad.responsive_search_ad.descriptions,
              ad_group_ad.ad.resource_name,
              ad_group_ad.status,
              ad_group.id,
              ad_group.name,
              ad_group.status,
              ad_group.cpc_bid_micros,
              ad_group.resource_name,
              campaign.id,
              campaign.resource_name,
              campaign.campaign_budget,
              campaign_budget.amount_micros,
              campaign_budget.resource_name
            FROM ad_group_ad
            WHERE ad_group_ad.ad.id = ${params.adId}
            LIMIT 1`,
  });

  const row = rows[0];
  if (!row) throw new Error(`Google Ads 广告 ${params.adId} 不存在`);

  const ad = row.adGroupAd?.ad;
  const adGroup = row.adGroup;
  const campaign = row.campaign;
  const budget = row.campaignBudget;

  return {
    campaign: {
      id: campaign?.id ?? "",
      name: "",
      status: "ENABLED",
      dailyBudget: fromMicros(budget?.amountMicros),
      resourceName: campaign?.resourceName ?? "",
      budgetResourceName: budget?.resourceName ?? campaign?.campaignBudget ?? "",
    },
    adGroup: {
      id: adGroup?.id ?? "",
      name: adGroup?.name ?? "",
      status: (adGroup?.status === "PAUSED" ? "PAUSED" : "ENABLED") as "ENABLED" | "PAUSED",
      cpcBid: fromMicros(adGroup?.cpcBidMicros),
      resourceName: adGroup?.resourceName ?? "",
    },
    ad: {
      id: ad?.id ?? "",
      name: ad?.name ?? "",
      finalUrl: ad?.finalUrls?.[0] ?? "",
      headlines: (ad?.responsiveSearchAd?.headlines ?? []).map((h) => h.text ?? ""),
      descriptions: (ad?.responsiveSearchAd?.descriptions ?? []).map((d) => d.text ?? ""),
      resourceName: ad?.resourceName ?? "",
    },
  };
}

// ─── 更新 ──────────────────────────────────────────────────────────────────────

export async function updateGoogleAd(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  form: GoogleEditFormData;
}): Promise<void> {
  const { accessToken, form } = params;
  const customerId = normalizeCustomerId(params.customerId);
  const developerToken = getDeveloperToken();
  const headers = buildGoogleAdsHeaders({
    accessToken,
    developerToken,
    loginCustomerId: params.loginCustomerId,
  });
  const customerPath = `/customers/${customerId}`;

  // Campaign Budget 层
  if (form.campaign.budgetResourceName && form.campaign.dailyBudget) {
    await googleMutate(
      `${customerPath}/campaignBudgets:mutate`,
      headers,
      [
        {
          update: {
            resourceName: form.campaign.budgetResourceName,
            amountMicros: toMicros(form.campaign.dailyBudget),
          },
          updateMask: "amountMicros",
        },
      ],
    );
  }

  // Campaign 层
  if (form.campaign.resourceName) {
    await googleMutate(
      `${customerPath}/campaigns:mutate`,
      headers,
      [
        {
          update: {
            resourceName: form.campaign.resourceName,
            name: form.campaign.name,
            status: form.campaign.status,
          },
          updateMask: "name,status",
        },
      ],
    );
  }

  // Ad Group 层
  if (form.adGroup.resourceName) {
    await googleMutate(
      `${customerPath}/adGroups:mutate`,
      headers,
      [
        {
          update: {
            resourceName: form.adGroup.resourceName,
            name: form.adGroup.name,
            status: form.adGroup.status,
            cpcBidMicros: toMicros(form.adGroup.cpcBid),
          },
          updateMask: "name,status,cpcBidMicros",
        },
      ],
    );
  }

  // Ad 层（RSA）
  if (form.ad.resourceName) {
    await googleMutate(
      `${customerPath}/adGroupAds:mutate`,
      headers,
      [
        {
          update: {
            resourceName: form.ad.resourceName,
            ad: {
              resourceName: form.ad.resourceName.replace(/\/adGroupAds\/.*$/, `/ads/${form.ad.resourceName.split("~")[1] ?? ""}`),
              name: form.ad.name,
              finalUrls: [form.ad.finalUrl],
              responsiveSearchAd: {
                headlines: form.ad.headlines.filter(Boolean).map((t) => ({ text: t })),
                descriptions: form.ad.descriptions.filter(Boolean).map((t) => ({ text: t })),
              },
            },
          },
          updateMask: "ad.name,ad.final_urls,ad.responsive_search_ad.headlines,ad.responsive_search_ad.descriptions",
        },
      ],
    );
  }
}
