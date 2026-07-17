import { describe, expect, it } from "vitest";
import type { TiktokAdFormData } from "../../../../app/routes/component/adsCreate/types";
import {
  buildTiktokAdCreative,
  buildTiktokAdGroupBody,
  buildTiktokCampaignBody,
  parseLocationIds,
} from "../../../../app/server/adsCreate/tiktokAdsCreate.server";
import {
  formatTiktokScheduleTime,
  resolveScheduleType,
  isTiktokSparkIdentityType,
  extractFirstTiktokItemId,
} from "../../../../app/server/adsCreate/tiktokAdsApi.server";

function baseForm(overrides: Partial<TiktokAdFormData> = {}): TiktokAdFormData {
  return {
    campaignName: "Camp",
    campaignObjective: "TRAFFIC",
    campaignBudgetMode: "BUDGET_MODE_DAY",
    campaignBudget: "50",
    campaignStatus: "ENABLE",
    adGroupName: "AG",
    adGroupBudgetMode: "BUDGET_MODE_DAY",
    adGroupBudget: "20",
    adGroupScheduleStart: "2026-07-17T10:00",
    adGroupScheduleEnd: "",
    gender: "GENDER_UNLIMITED",
    locationIds: "6252001",
    identityId: "id-1",
    identityType: "TT_USER",
    identityDisplayName: "Shop",
    adName: "Ad",
    adText: "Hello",
    adCallToAction: "LEARN_MORE",
    creativeMode: "SINGLE_IMAGE",
    adImageUrl: "https://example.com/a.jpg",
    adVideoUrl: "",
    adImageId: "img-1",
    adVideoId: "",
    tiktokItemId: "",
    adLandingUrl: "https://example.com",
    ...overrides,
  };
}

describe("tiktokAdsApi helpers", () => {
  it("formats datetime-local to TikTok schedule string", () => {
    expect(formatTiktokScheduleTime("2026-07-17T10:30")).toBe("2026-07-17 10:30:00");
  });

  it("resolves schedule_type from end time", () => {
    expect(resolveScheduleType("")).toBe("SCHEDULE_FROM_NOW");
    expect(resolveScheduleType("2026-08-01T00:00")).toBe("SCHEDULE_START_END");
  });

  it("detects spark identity types", () => {
    expect(isTiktokSparkIdentityType("TT_USER")).toBe(true);
    expect(isTiktokSparkIdentityType("CUSTOMIZED_USER")).toBe(false);
  });

  it("extracts first tiktok item id", () => {
    expect(
      extractFirstTiktokItemId([{ tiktok_item_id: " 111 " }, { item_id: "222" }]),
    ).toBe("111");
    expect(extractFirstTiktokItemId([])).toBeNull();
  });
});

describe("buildTiktokCampaignBody", () => {
  it("includes budget when not infinite", () => {
    const body = buildTiktokCampaignBody({
      advertiserId: "adv",
      form: baseForm(),
    });
    expect(body).toMatchObject({
      advertiser_id: "adv",
      campaign_name: "Camp",
      objective_type: "TRAFFIC",
      budget_mode: "BUDGET_MODE_DAY",
      budget: 50,
      operation_status: "ENABLE",
    });
  });

  it("omits budget for infinite mode", () => {
    const body = buildTiktokCampaignBody({
      advertiserId: "adv",
      form: baseForm({ campaignBudgetMode: "BUDGET_MODE_INFINITE", campaignBudget: "" }),
    });
    expect(body.budget).toBeUndefined();
  });
});

describe("buildTiktokAdGroupBody", () => {
  it("includes schedule_type and sandbox-aligned fields", () => {
    const body = buildTiktokAdGroupBody({
      advertiserId: "adv",
      campaignId: "camp-1",
      form: baseForm(),
    });
    expect(body).toMatchObject({
      advertiser_id: "adv",
      campaign_id: "camp-1",
      promotion_type: "WEBSITE",
      placement_type: "PLACEMENT_TYPE_NORMAL",
      placements: ["PLACEMENT_TIKTOK"],
      location_ids: ["6252001"],
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: "2026-07-17 10:00:00",
      pacing: "PACING_MODE_SMOOTH",
      identity_id: "id-1",
      identity_type: "TT_USER",
      optimization_goal: "CLICK",
      billing_event: "CPC",
      bid_type: "BID_TYPE_NO_BID",
    });
    expect(body.schedule_end_time).toBeUndefined();
  });

  it("uses SCHEDULE_START_END when end time is set", () => {
    const body = buildTiktokAdGroupBody({
      advertiserId: "adv",
      campaignId: "camp-1",
      form: baseForm({ adGroupScheduleEnd: "2026-08-01T12:00" }),
    });
    expect(body.schedule_type).toBe("SCHEDULE_START_END");
    expect(body.schedule_end_time).toBe("2026-08-01 12:00:00");
  });

  it("defaults location ids", () => {
    expect(parseLocationIds("")).toEqual(["6252001"]);
    expect(parseLocationIds("1, 2")).toEqual(["1", "2"]);
  });
});

describe("buildTiktokAdCreative", () => {
  it("builds single image creative", () => {
    const creative = buildTiktokAdCreative({
      form: baseForm({ creativeMode: "SINGLE_IMAGE" }),
      imageId: "img-9",
    });
    expect(creative).toMatchObject({
      ad_format: "SINGLE_IMAGE",
      image_ids: ["img-9"],
      identity_id: "id-1",
      identity_type: "TT_USER",
      landing_page_url: "https://example.com",
    });
  });

  it("builds single video creative", () => {
    const creative = buildTiktokAdCreative({
      form: baseForm({ creativeMode: "SINGLE_VIDEO" }),
      videoId: "vid-1",
      imageId: "cover-1",
    });
    expect(creative).toMatchObject({
      ad_format: "SINGLE_VIDEO",
      video_id: "vid-1",
      image_ids: ["cover-1"],
    });
  });

  it("builds spark post creative", () => {
    const creative = buildTiktokAdCreative({
      form: baseForm({
        creativeMode: "SPARK_POST",
        tiktokItemId: "item-99",
      }),
    });
    expect(creative).toMatchObject({
      tiktok_item_id: "item-99",
      identity_id: "id-1",
    });
    expect(creative.ad_format).toBeUndefined();
  });

  it("adds display_name for CUSTOMIZED_USER", () => {
    const creative = buildTiktokAdCreative({
      form: baseForm({
        identityType: "CUSTOMIZED_USER",
        identityDisplayName: "My Brand",
        creativeMode: "SINGLE_IMAGE",
      }),
      imageId: "img-1",
    });
    expect(creative.display_name).toBe("My Brand");
  });
});
