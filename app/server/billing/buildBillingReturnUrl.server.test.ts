import { afterEach, describe, expect, it } from "vitest";
import {
  BILLING_PAGE_PATH,
  buildBillingReturnUrl,
  buildShopifyAdminHostParam,
  SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH,
} from "./buildBillingReturnUrl.server";

describe("buildBillingReturnUrl", () => {
  afterEach(() => {
    delete process.env.SHOPIFY_APP_URL;
  });

  it("只保留 shop、host 与计费回跳标记，不包含 id_token", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    const longToken = "x".repeat(500);
    const request = new Request(
      `https://proxy.internal/app/billing?shop=store.myshopify.com&host=encoded-host&id_token=${longToken}&session=abc`,
    );

    const returnUrl = buildBillingReturnUrl(
      BILLING_PAGE_PATH,
      request,
      "store.myshopify.com",
    );

    expect(returnUrl.length).toBeLessThanOrEqual(
      SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH,
    );
    expect(returnUrl).toBe(
      "https://app.example.com/app/billing?shop=store.myshopify.com&billing_return=1&embedded=1&host=encoded-host",
    );
    expect(returnUrl).not.toContain("id_token");
    expect(returnUrl).not.toContain("session=");
  });

  it("无 host 时从 shop 推导 host，避免回跳后进登录页", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    const request = new Request(
      "https://app.example.com/app/billing?shop=store.myshopify.com",
    );
    const host = buildShopifyAdminHostParam("store.myshopify.com");
    const returnUrl = buildBillingReturnUrl(
      BILLING_PAGE_PATH,
      request,
      "store.myshopify.com",
    );
    expect(returnUrl).toBe(
      `https://app.example.com/app/billing?shop=store.myshopify.com&billing_return=1&embedded=1&host=${encodeURIComponent(host)}`,
    );
  });
});
