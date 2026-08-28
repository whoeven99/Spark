import { describe, expect, it } from "vitest";
import { isStorefrontPixelCollectionEnabled } from "../../../app/lib/storefrontPixelCollection";
import { maybeTrackTiktokCompletePayment } from "../../../app/server/adsCatalog/tiktokPixelConfig.server";
import { maybeTrackMetaPurchase } from "../../../app/server/adsCatalog/metaPixelConfig.server";

describe("storefront pixel collection gate", () => {
  it("is disabled for the current App Store cut", () => {
    expect(isStorefrontPixelCollectionEnabled()).toBe(false);
  });

  it("skips TikTok CompletePayment without reading credentials", async () => {
    expect(await maybeTrackTiktokCompletePayment({ shop: "s.myshopify.com", orderId: "1" })).toEqual(
      { sent: false, reason: "collection_disabled" },
    );
  });

  it("skips Meta Purchase without reading credentials", async () => {
    expect(await maybeTrackMetaPurchase({ shop: "s.myshopify.com", orderId: "1" })).toEqual({
      sent: false,
      reason: "collection_disabled",
    });
  });
});
