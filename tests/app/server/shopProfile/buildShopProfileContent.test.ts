import { describe, expect, it } from "vitest";
import {
  buildShopProfileMarkdown,
  buildShopProfilePromptSnippet,
  hashShopBasicFacts,
} from "../../../../app/server/shopProfile/buildShopProfileContent.server";
import type { ShopBasicFacts } from "../../../../app/server/shopProfile/types.server";

const sampleFacts: ShopBasicFacts = {
  shopId: "gid://shopify/Shop/1",
  name: "Demo Store",
  myshopifyDomain: "demo.myshopify.com",
  currencyCode: "USD",
  ianaTimezone: "America/New_York",
  planDisplayName: "Basic",
  primaryDomainHost: "demo.com",
};

describe("buildShopProfileContent", () => {
  it("builds stable hash for same facts", () => {
    const a = hashShopBasicFacts(sampleFacts);
    const b = hashShopBasicFacts({ ...sampleFacts });
    expect(a).toBe(b);
  });

  it("includes shop name in snippet and markdown", () => {
    const snippet = buildShopProfilePromptSnippet(sampleFacts);
    const md = buildShopProfileMarkdown(sampleFacts, {
      distilledAt: "2026-05-20T00:00:00.000Z",
    });
    expect(snippet).toContain("Demo Store");
    expect(md).toContain("Demo Store");
    expect(md).toContain("shopify_basic_v1");
  });
});
