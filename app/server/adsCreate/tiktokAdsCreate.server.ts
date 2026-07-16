/**
 * TikTok Marketing API — 广告创建服务。
 * 依赖 TiktokAdsInsightsCredential（OAuth 完成即可，无需绑定商品 Catalog）。
 *
 * API 参考：https://business-api.tiktok.com/portal/docs
 */

import type { TiktokAdFormData } from "../../routes/component/adsCreate/types";

const TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

type TiktokApiPayload<T = Record<string, unknown>> = {
  code: number;
  message: string;
  data?: T;
  request_id?: string;
};

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

/** 将 ISO 日期字符串转换为 TikTok 需要的时间戳格式（秒级 Unix 时间戳）。 */
function toTiktokTimestamp(isoStr: string): number {
  return Math.floor(new Date(isoStr).getTime() / 1000);
}

export interface TiktokCreateResult {
  campaignId: string;
  adGroupId: string;
  adId: string;
}

/**
 * 依次创建：Campaign → Ad Group → Ad。
 * TikTok API 使用 advertiser_id 鉴权。
 */
export async function createTiktokAd(params: {
  accessToken: string;
  advertiserId: string;
  form: TiktokAdFormData;
}): Promise<TiktokCreateResult> {
  const { accessToken, advertiserId, form } = params;

  // ── Step 1: Campaign ─────────────────────────────────────────────────────
  const campaignBody: Record<string, unknown> = {
    advertiser_id: advertiserId,
    campaign_name: form.campaignName,
    objective_type: form.campaignObjective,
    budget_mode: form.campaignBudgetMode,
    operation_status: form.campaignStatus,
  };
  if (
    form.campaignBudgetMode !== "BUDGET_MODE_INFINITE" &&
    form.campaignBudget
  ) {
    campaignBody.budget = parseFloat(form.campaignBudget);
  }

  const campaignData = await tiktokPost<{ campaign_id: string }>(
    "/campaign/create/",
    accessToken,
    campaignBody,
  );
  const campaignId = campaignData.campaign_id;

  // ── Step 2: Ad Group ─────────────────────────────────────────────────────
  const adGroupBody: Record<string, unknown> = {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    adgroup_name: form.adGroupName,
    budget_mode: form.adGroupBudgetMode,
    operation_status:
      form.campaignStatus === "ENABLE" ? "ENABLE" : "DISABLE",
    placement_type: "PLACEMENT_TYPE_AUTOMATIC",
    location_ids: [6252001], // 默认美国（TikTok location ID）
    gender: form.gender,
    billing_event: "CPC",
    bid_type: "BID_TYPE_NO_BID",
    optimization_goal: "CLICK",
  };
  if (
    form.adGroupBudgetMode !== "BUDGET_MODE_INFINITE" &&
    form.adGroupBudget
  ) {
    adGroupBody.budget = parseFloat(form.adGroupBudget);
  }
  if (form.adGroupScheduleStart) {
    adGroupBody.schedule_start_time = form.adGroupScheduleStart;
  }
  if (form.adGroupScheduleEnd) {
    adGroupBody.schedule_end_time = form.adGroupScheduleEnd;
  }

  const adGroupData = await tiktokPost<{ adgroup_id: string }>(
    "/adgroup/create/",
    accessToken,
    adGroupBody,
  );
  const adGroupId = adGroupData.adgroup_id;

  // ── Step 3: Ad ────────────────────────────────────────────────────────────
  const adMaterial: Record<string, unknown> = {
    ad_text: form.adText,
    call_to_action: form.adCallToAction,
    landing_page_url: form.adLandingUrl,
  };
  if (form.adImageUrl) {
    adMaterial.image_ids = []; // 图片需通过 Image Upload API 获取 ID；此处预留字段
    adMaterial.image_urls = [form.adImageUrl];
  }

  const adData = await tiktokPost<{ ad_ids: string[] }>("/ad/create/", accessToken, {
    advertiser_id: advertiserId,
    adgroup_id: adGroupId,
    creatives: [
      {
        ad_name: form.adName,
        ad_format: "SINGLE_IMAGE",
        ...adMaterial,
      },
    ],
  });

  const adId = adData.ad_ids?.[0] ?? "";
  return { campaignId, adGroupId, adId };
}
