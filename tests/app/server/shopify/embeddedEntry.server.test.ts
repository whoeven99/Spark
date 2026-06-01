import { describe, expect, it } from "vitest";
import { buildShopifyAdminHostParam } from "../../../../app/server/billing/buildBillingReturnUrl.server";
import {
  isEmbeddedAdminEntry,
  resolveShopQueryFromRequest,
  shopDomainFromHostParam,
} from "../../../../app/server/shopify/embeddedEntry.server";

describe("shopDomainFromHostParam", () => {
  it("decodes shop domain from host param", () => {
    const host = buildShopifyAdminHostParam("demo-store.myshopify.com");
    expect(shopDomainFromHostParam(host)).toBe("demo-store.myshopify.com");
  });

  it("returns null for invalid base64", () => {
    expect(shopDomainFromHostParam("not-valid!!!")).toBeNull();
  });
});

describe("resolveShopQueryFromRequest", () => {
  it("prefers shop query over host", () => {
    const host = buildShopifyAdminHostParam("other.myshopify.com");
    const request = new Request(
      `https://app.example/?shop=primary.myshopify.com&host=${encodeURIComponent(host)}`,
    );
    expect(resolveShopQueryFromRequest(request)).toBe("primary.myshopify.com");
  });

  it("falls back to host when shop is missing", () => {
    const host = buildShopifyAdminHostParam("fallback.myshopify.com");
    const request = new Request(`https://app.example/?host=${encodeURIComponent(host)}`);
    expect(resolveShopQueryFromRequest(request)).toBe("fallback.myshopify.com");
  });
});

describe("isEmbeddedAdminEntry", () => {
  it("detects embedded=1", () => {
    const request = new Request("https://app.example/?embedded=1");
    expect(isEmbeddedAdminEntry(request)).toBe(true);
  });
});
