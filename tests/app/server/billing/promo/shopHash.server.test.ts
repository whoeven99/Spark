import { describe, expect, it } from "vitest";
import {
  hashShopDomain,
  normalizeShopDomain,
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
