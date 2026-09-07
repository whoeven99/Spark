import { describe, expect, it } from "vitest";
import {
  hashShopDomain,
  normalizeShopDomain,
  parseMyshopifyShopDomain,
} from "../../../../../app/server/billing/promo/shopHash.server";

describe("hashShopDomain", () => {
  it("normalizes scheme/case/trailing slash", () => {
    expect(normalizeShopDomain("https://Demo.MyShopify.com/")).toBe(
      "demo.myshopify.com",
    );
    expect(hashShopDomain("Demo.myshopify.com")).toBe(
      hashShopDomain("https://demo.myshopify.com/"),
    );
    expect(hashShopDomain("a.myshopify.com")).not.toBe(
      hashShopDomain("b.myshopify.com"),
    );
    expect(hashShopDomain("x.myshopify.com")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("parseMyshopifyShopDomain", () => {
  it("接受规范化后的 myshopify 域名", () => {
    expect(parseMyshopifyShopDomain("https://Demo-Store.myshopify.com/")).toBe(
      "demo-store.myshopify.com",
    );
    expect(parseMyshopifyShopDomain(" demo.myshopify.com ")).toBe(
      "demo.myshopify.com",
    );
  });

  it("拒绝非 myshopify 域名", () => {
    expect(parseMyshopifyShopDomain("demo.example.com")).toBeNull();
    expect(parseMyshopifyShopDomain("not a shop")).toBeNull();
    expect(parseMyshopifyShopDomain("")).toBeNull();
  });
});
