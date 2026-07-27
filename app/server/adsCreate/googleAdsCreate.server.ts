/**
 * Google Ads REST API v24 — 广告创建服务。
 * 复用现有 GoogleAdsCredential（google 平台）和 GOOGLE_ADS_DEVELOPER_TOKEN 环境变量。
 *
 * API 参考：https://developers.google.com/google-ads/api/rest/reference/rest/v24
 */

import type { GoogleAdFormData } from "../../routes/component/adsCreate/types";
import {
  buildGoogleAdsHeaders,
  googleAdsApiUrl,
  normalizeCustomerId,
  parseGoogleAdsError,
} from "../adsCatalog/googleAdsApi.server";

function getDeveloperToken(): string {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
  if (!token) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN 环境变量未配置");
  return token;
}

/** 将金额字符串（如 "5.00"）转换为 Google Ads 使用的 micros（微单位）。 */
function toMicros(amount: string): number {
  return Math.round(parseFloat(amount || "0") * 1_000_000);
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

export interface GoogleCreateResult {
  campaignId: string;
  adGroupId: string;
  adId: string;
}

/**
 * 依次创建：Campaign Budget → Campaign → Ad Group → Responsive Search Ad。
 */
export async function createGoogleAd(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string;
  form: GoogleAdFormData;
}): Promise<GoogleCreateResult> {
  const { accessToken, form } = params;
  const customerId = normalizeCustomerId(params.customerId);
  const developerToken = getDeveloperToken();
  const headers = buildGoogleAdsHeaders({
    accessToken,
    developerToken,
    loginCustomerId: params.loginCustomerId,
  });

  const customerPath = `/customers/${customerId}`;

  // ── Step 1: Campaign Budget ───────────────────────────────────────────────
  const budgetResult = await googleMutate<{
    results: Array<{ resourceName: string }>;
  }>(
    `${customerPath}/campaignBudgets:mutate`,
    headers,
    [
      {
        create: {
          name: `${form.campaignName}_budget`,
          amountMicros: toMicros(form.campaignDailyBudget),
          deliveryMethod: "STANDARD",
        },
      },
    ],
  );
  const budgetResourceName = budgetResult.results[0]?.resourceName ?? "";
  if (!budgetResourceName) throw new Error("Campaign budget 创建失败");

  // ── Step 2: Campaign ─────────────────────────────────────────────────────
  const campaignResult = await googleMutate<{
    results: Array<{ resourceName: string }>;
  }>(
    `${customerPath}/campaigns:mutate`,
    headers,
    [
      {
        create: {
          name: form.campaignName,
          status: form.campaignStatus,
          advertisingChannelType: "SEARCH",
          campaignBudget: budgetResourceName,
          biddingStrategyType: "MAXIMIZE_CLICKS",
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
          },
        },
      },
    ],
  );
  const campaignResourceName = campaignResult.results[0]?.resourceName ?? "";
  if (!campaignResourceName) throw new Error("Campaign 创建失败");
  const campaignId = campaignResourceName.split("/").pop() ?? "";

  // ── Step 3: Ad Group ─────────────────────────────────────────────────────
  const adGroupResult = await googleMutate<{
    results: Array<{ resourceName: string }>;
  }>(
    `${customerPath}/adGroups:mutate`,
    headers,
    [
      {
        create: {
          name: form.adGroupName,
          status: form.adGroupStatus,
          campaign: campaignResourceName,
          type: "SEARCH_STANDARD",
          cpcBidMicros: toMicros(form.adGroupCpcBid),
        },
      },
    ],
  );
  const adGroupResourceName = adGroupResult.results[0]?.resourceName ?? "";
  if (!adGroupResourceName) throw new Error("Ad Group 创建失败");
  const adGroupId = adGroupResourceName.split("/").pop() ?? "";

  // ── Step 4: Responsive Search Ad ─────────────────────────────────────────
  const headlines = form.adHeadlines
    .filter((h) => h.trim())
    .map((text, i) => ({ text: text.trim(), pinnedField: i < 1 ? "HEADLINE_1" : undefined }));
  const descriptions = form.adDescriptions
    .filter((d) => d.trim())
    .map((text) => ({ text: text.trim() }));

  const adResult = await googleMutate<{
    results: Array<{ resourceName: string }>;
  }>(
    `${customerPath}/ads:mutate`,
    headers,
    [
      {
        create: {
          adGroup: adGroupResourceName,
          status: form.adGroupStatus,
          ad: {
            finalUrls: [form.adFinalUrl],
            responsiveSearchAd: { headlines, descriptions },
          },
        },
      },
    ],
  );
  const adResourceName = adResult.results[0]?.resourceName ?? "";
  if (!adResourceName) throw new Error("Ad 创建失败");
  const adId = adResourceName.split("/").pop() ?? "";

  return { campaignId, adGroupId, adId };
}
