import { describe, expect, it } from "vitest";
import {
  buildBillingReturnUrl,
  SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH,
} from "./buildBillingReturnUrl.server";

describe("buildBillingReturnUrl", () => {
  it("只保留 shop 与 host，不包含 id_token", () => {
    const longToken = "x".repeat(500);
    const request = new Request(
      `https://app.example.com/app/billing?shop=store.myshopify.com&host=encoded-host&id_token=${longToken}&session=abc`,
    );

    const returnUrl = buildBillingReturnUrl(
      "/app/billing",
      request,
      "store.myshopify.com",
    );

    expect(returnUrl.length).toBeLessThanOrEqual(
      SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH,
    );
    expect(returnUrl).toContain("shop=store.myshopify.com");
    expect(returnUrl).toContain("host=encoded-host");
    expect(returnUrl).not.toContain("id_token");
    expect(returnUrl).not.toContain("session=");
  });

  it("无 host 时仅带 shop", () => {
    const request = new Request(
      "https://app.example.com/app/billing?shop=store.myshopify.com",
    );
    const returnUrl = buildBillingReturnUrl(
      "/app/billing",
      request,
      "store.myshopify.com",
    );
    expect(returnUrl).toBe(
      "https://app.example.com/app/billing?shop=store.myshopify.com",
    );
  });
});
