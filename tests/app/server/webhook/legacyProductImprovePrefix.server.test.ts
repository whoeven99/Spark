import { describe, expect, it } from "vitest";
import {
  canonicalPathFromLegacyProductImproveSplat,
  isShopifyWebhookPath,
} from "../../../../app/server/webhook/legacyProductImprovePrefix.server";

describe("canonicalPathFromLegacyProductImproveSplat", () => {
  it("maps the prefixed uninstall webhook from Shopify retries", () => {
    expect(
      canonicalPathFromLegacyProductImproveSplat("webhooks/app/uninstalled"),
    ).toBe("/webhooks/app/uninstalled");
  });

  it("strips extra slashes", () => {
    expect(
      canonicalPathFromLegacyProductImproveSplat("/webhooks/app/uninstalled/"),
    ).toBe("/webhooks/app/uninstalled");
  });

  it("returns null for the exact legacy app entry", () => {
    expect(canonicalPathFromLegacyProductImproveSplat(undefined)).toBeNull();
    expect(canonicalPathFromLegacyProductImproveSplat("")).toBeNull();
  });
});

describe("isShopifyWebhookPath", () => {
  it("accepts webhook routes and rejects UI paths", () => {
    expect(isShopifyWebhookPath("/webhooks/app/uninstalled")).toBe(true);
    expect(isShopifyWebhookPath("/webhooks/compliance")).toBe(true);
    expect(isShopifyWebhookPath("/app/studio/copy")).toBe(false);
  });
});
