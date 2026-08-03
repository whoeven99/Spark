import { describe, expect, it } from "vitest";
import {
  META_DEV_MODE_CREATIVE_POST_SUBCODE,
  isMetaDevModeCreativePostError,
  normalizeObjectStoryId,
} from "~/server/adsInsights/metaSandbox.server";
import { formatMetaSandboxSeedFailure } from "~/server/adsInsights/metaSandboxSeed.server";

describe("meta sandbox seed helpers", () => {
  it("normalizes object_story_id with page prefix", () => {
    expect(normalizeObjectStoryId("123", "456")).toBe("123_456");
    expect(normalizeObjectStoryId("123", "123_456")).toBe("123_456");
  });

  it("detects dev-mode creative post error by subcode", () => {
    expect(
      isMetaDevModeCreativePostError({
        error_subcode: META_DEV_MODE_CREATIVE_POST_SUBCODE,
        message: "Invalid parameter",
      }),
    ).toBe(true);
  });

  it("detects dev-mode creative post error by message", () => {
    expect(
      isMetaDevModeCreativePostError({
        error_user_msg:
          "Ads creative post was created by an app that is in development mode. It must be in public to create this ad.",
      }),
    ).toBe(true);
  });

  it("formats aggregate seed failure message", () => {
    const message = formatMetaSandboxSeedFailure([
      { strategy: "catalog_dpa", ok: false, message: "no catalog" },
      { strategy: "traffic_link_spec", ok: false, message: "dev mode" },
    ]);
    expect(message).toContain("catalog_dpa");
    expect(message).toContain("traffic_link_spec");
  });
});
