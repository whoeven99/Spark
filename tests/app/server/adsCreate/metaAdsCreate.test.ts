import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMetaAd } from "~/server/adsCreate/metaAdsCreate.server";
import type { MetaAdFormData } from "~/routes/component/adsCreate/types";

const baseForm: MetaAdFormData = {
  campaignName: "Test Campaign",
  campaignObjective: "OUTCOME_TRAFFIC",
  campaignDailyBudget: "",
  campaignStatus: "PAUSED",
  adSetName: "Test AdSet",
  adSetStartTime: "",
  adSetEndTime: "",
  ageMin: "18",
  ageMax: "65",
  gender: "ALL",
  geoCountries: "US",
  adName: "Test Ad",
  pageId: "1234567890",
  adHeadline: "Hello",
  adBody: "Body",
  adCallToAction: "LEARN_MORE",
  adImageUrl: "",
  adLinkUrl: "https://example.com",
};

describe("createMetaAd", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = new URLSearchParams(String(init?.body ?? ""));
        if (url.includes("/campaigns")) {
          expect(body.get("objective")).toBe("OUTCOME_TRAFFIC");
          expect(body.get("special_ad_categories")).toBe("[]");
          return Response.json({ id: "camp_1" });
        }
        if (url.includes("/adsets")) {
          expect(body.get("optimization_goal")).toBe("LINK_CLICKS");
          expect(body.get("destination_type")).toBe("WEBSITE");
          expect(body.get("billing_event")).toBe("IMPRESSIONS");
          const targeting = JSON.parse(body.get("targeting") || "{}") as {
            geo_locations?: { countries?: string[] };
          };
          expect(targeting.geo_locations?.countries).toEqual(["US"]);
          expect(body.get("daily_budget")).toBe("500");
          return Response.json({ id: "adset_1" });
        }
        if (url.includes("/adcreatives")) {
          const spec = JSON.parse(body.get("object_story_spec") || "{}") as {
            page_id?: string;
          };
          expect(spec.page_id).toBe("1234567890");
          return Response.json({ id: "creative_1" });
        }
        if (url.includes("/ads")) {
          return Response.json({ id: "ad_1" });
        }
        return Response.json({ error: { message: `unexpected ${url}` } }, { status: 400 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates traffic campaign with website link-click delivery", async () => {
    const result = await createMetaAd({
      accessToken: "token",
      adAccountId: "act_999",
      form: baseForm,
    });
    expect(result).toEqual({
      campaignId: "camp_1",
      adSetId: "adset_1",
      adId: "ad_1",
    });
  });

  it("rejects sales objective with a clear message", async () => {
    await expect(
      createMetaAd({
        accessToken: "token",
        adAccountId: "act_999",
        form: { ...baseForm, campaignObjective: "OUTCOME_SALES" },
      }),
    ).rejects.toThrow(/销售转化/);
  });

  it("surfaces Meta error_user_msg instead of bare Invalid parameter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              message: "Invalid parameter",
              error_user_title: "Performance goal isn't available",
              error_user_msg: "You can't use the selected performance goal",
              error_data: '{"blame_field_specs":[["optimization_goal"]]}',
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      createMetaAd({
        accessToken: "token",
        adAccountId: "act_999",
        form: baseForm,
      }),
    ).rejects.toThrow(/optimization_goal/);
  });
});
