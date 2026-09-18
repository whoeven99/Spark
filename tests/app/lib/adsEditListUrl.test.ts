import { describe, expect, it } from "vitest";
import {
  ADS_EDIT_LIST_PATH,
  buildAdsEditListUrl,
} from "../../../app/lib/adsEditListUrl";

describe("buildAdsEditListUrl", () => {
  it("uses slash path matching api.ads-edit.list.ts file routing", () => {
    expect(ADS_EDIT_LIST_PATH).toBe("/api/ads-edit/list");
    expect(buildAdsEditListUrl("", { platform: "tiktok", level: "campaigns" })).toBe(
      "/api/ads-edit/list?platform=tiktok&level=campaigns",
    );
  });

  it("keeps a valid query when embedded search is empty", () => {
    expect(buildAdsEditListUrl("", { platform: "google", level: "campaigns" })).toBe(
      "/api/ads-edit/list?platform=google&level=campaigns",
    );
  });

  it("merges shop/host without dropping platform params", () => {
    expect(
      buildAdsEditListUrl("?shop=demo.myshopify.com&host=abc", {
        platform: "meta",
        level: "campaigns",
      }),
    ).toBe(
      "/api/ads-edit/list?platform=meta&level=campaigns&shop=demo.myshopify.com&host=abc",
    );
  });
});
