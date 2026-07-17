/**
 * TikTok Marketing API — 广告创建服务。
 * 依赖 TiktokAdsInsightsCredential（OAuth 完成即可，无需绑定商品 Catalog）。
 *
 * API 参考：https://business-api.tiktok.com/portal/docs
 */

import type { TiktokAdFormData } from "../../routes/component/adsCreate/types";
import {
  formatTiktokScheduleTime,
  isTiktokSparkIdentityType,
  resolveScheduleType,
  tiktokPost,
  uploadAdImageByUrl,
  uploadAdVideoByUrl,
} from "./tiktokAdsApi.server";

export interface TiktokCreateResult {
  campaignId: string;
  adGroupId: string;
  adId: string;
}

export function parseLocationIds(raw: string | undefined): string[] {
  const ids = (raw ?? "")
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : ["6252001"];
}

/** 构建 Campaign 请求体（可单测）。 */
export function buildTiktokCampaignBody(params: {
  advertiserId: string;
  form: TiktokAdFormData;
}): Record<string, unknown> {
  const { advertiserId, form } = params;
  const body: Record<string, unknown> = {
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
    body.budget = parseFloat(form.campaignBudget);
  }
  return body;
}

/** 构建 Ad Group 请求体（可单测）。 */
export function buildTiktokAdGroupBody(params: {
  advertiserId: string;
  campaignId: string;
  form: TiktokAdFormData;
}): Record<string, unknown> {
  const { advertiserId, campaignId, form } = params;
  const scheduleType = resolveScheduleType(form.adGroupScheduleEnd);
  const body: Record<string, unknown> = {
    advertiser_id: advertiserId,
    campaign_id: campaignId,
    adgroup_name: form.adGroupName,
    promotion_type: "WEBSITE",
    placement_type: "PLACEMENT_TYPE_NORMAL",
    placements: ["PLACEMENT_TIKTOK"],
    location_ids: parseLocationIds(form.locationIds),
    budget_mode: form.adGroupBudgetMode,
    schedule_type: scheduleType,
    schedule_start_time: formatTiktokScheduleTime(form.adGroupScheduleStart),
    optimization_goal: "CLICK",
    billing_event: "CPC",
    bid_type: "BID_TYPE_NO_BID",
    pacing: "PACING_MODE_SMOOTH",
    gender: form.gender,
    operation_status: form.campaignStatus === "ENABLE" ? "ENABLE" : "DISABLE",
    identity_id: form.identityId,
    identity_type: form.identityType,
  };

  if (
    form.adGroupBudgetMode !== "BUDGET_MODE_INFINITE" &&
    form.adGroupBudget
  ) {
    body.budget = parseFloat(form.adGroupBudget);
  }
  if (scheduleType === "SCHEDULE_START_END" && form.adGroupScheduleEnd) {
    body.schedule_end_time = formatTiktokScheduleTime(form.adGroupScheduleEnd);
  }
  return body;
}

/** 构建单条 creative（可单测；资产 ID 需已解析）。 */
export function buildTiktokAdCreative(params: {
  form: TiktokAdFormData;
  imageId?: string | null;
  videoId?: string | null;
}): Record<string, unknown> {
  const { form, imageId, videoId } = params;
  const base: Record<string, unknown> = {
    ad_name: form.adName,
    identity_id: form.identityId,
    identity_type: form.identityType,
    ad_text: form.adText,
    call_to_action: form.adCallToAction,
    landing_page_url: form.adLandingUrl,
  };

  if (form.identityType === "CUSTOMIZED_USER" && form.identityDisplayName) {
    base.display_name = form.identityDisplayName;
  }

  if (form.creativeMode === "SPARK_POST") {
    const itemId = form.tiktokItemId?.trim();
    if (!itemId) {
      throw new Error("Spark 帖子模式需要选择 tiktok_item_id");
    }
    return {
      ...base,
      tiktok_item_id: itemId,
    };
  }

  if (form.creativeMode === "SINGLE_VIDEO") {
    if (!videoId) throw new Error("视频广告需要有效的 video_id");
    const creative: Record<string, unknown> = {
      ...base,
      ad_format: "SINGLE_VIDEO",
      video_id: videoId,
    };
    if (imageId) creative.image_ids = [imageId];
    return creative;
  }

  // SINGLE_IMAGE
  if (!imageId) throw new Error("图片广告需要有效的 image_id");
  return {
    ...base,
    ad_format: "SINGLE_IMAGE",
    image_ids: [imageId],
  };
}

async function resolveCreativeAssets(params: {
  accessToken: string;
  advertiserId: string;
  form: TiktokAdFormData;
}): Promise<{ imageId: string | null; videoId: string | null }> {
  const { accessToken, advertiserId, form } = params;
  let imageId = form.adImageId?.trim() || null;
  let videoId = form.adVideoId?.trim() || null;

  if (form.creativeMode === "SPARK_POST") {
    return { imageId: null, videoId: null };
  }

  if (form.creativeMode === "SINGLE_IMAGE") {
    if (!imageId) {
      const url = form.adImageUrl?.trim();
      if (!url) throw new Error("请提供图片 URL 或已上传的 image_id");
      imageId = await uploadAdImageByUrl({
        accessToken,
        advertiserId,
        imageUrl: url,
      });
    }
    return { imageId, videoId: null };
  }

  // SINGLE_VIDEO
  if (!videoId) {
    const url = form.adVideoUrl?.trim();
    if (!url) throw new Error("请提供视频 URL 或已上传的 video_id");
    videoId = await uploadAdVideoByUrl({
      accessToken,
      advertiserId,
      videoUrl: url,
    });
  }
  if (!imageId && form.adImageUrl?.trim()) {
    imageId = await uploadAdImageByUrl({
      accessToken,
      advertiserId,
      imageUrl: form.adImageUrl.trim(),
    });
  }
  return { imageId, videoId };
}

function assertFormReady(form: TiktokAdFormData): void {
  if (!form.identityId?.trim() || !form.identityType?.trim()) {
    throw new Error("请选择 TikTok Identity（投放身份）");
  }
  if (form.creativeMode === "SPARK_POST") {
    if (!isTiktokSparkIdentityType(form.identityType)) {
      throw new Error("当前 Identity 类型不支持 Spark 帖子创意，请改用图片或视频");
    }
    if (!form.tiktokItemId?.trim()) {
      throw new Error("请选择要推广的 Spark 帖子");
    }
  }
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
  assertFormReady(form);

  const campaignData = await tiktokPost<{ campaign_id: string }>(
    "/campaign/create/",
    accessToken,
    buildTiktokCampaignBody({ advertiserId, form }),
  );
  const campaignId = campaignData.campaign_id;

  const adGroupData = await tiktokPost<{ adgroup_id: string }>(
    "/adgroup/create/",
    accessToken,
    buildTiktokAdGroupBody({ advertiserId, campaignId, form }),
  );
  const adGroupId = adGroupData.adgroup_id;

  const { imageId, videoId } = await resolveCreativeAssets({
    accessToken,
    advertiserId,
    form,
  });
  const creative = buildTiktokAdCreative({ form, imageId, videoId });

  const adData = await tiktokPost<{ ad_ids: string[] }>("/ad/create/", accessToken, {
    advertiser_id: advertiserId,
    adgroup_id: adGroupId,
    creatives: [creative],
  });

  const adId = adData.ad_ids?.[0] ?? "";
  return { campaignId, adGroupId, adId };
}
