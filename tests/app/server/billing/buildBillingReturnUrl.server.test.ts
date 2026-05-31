import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BILLING_PAGE_PATH,
  buildBillingReturnUrl,
  buildShopifyAdminHostParam,
  SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH,
} from "../../../../app/server/billing/buildBillingReturnUrl.server";

describe("buildBillingReturnUrl", () => {
  beforeEach(() => {
    delete process.env.SHOPIFY_ADMIN_APP_HANDLE;
    delete process.env.SHOPIFY_APP_HANDLE;
    delete process.env.SHOPIFY_API_KEY;
  });

  afterEach(() => {
    delete process.env.SHOPIFY_APP_URL;
    delete process.env.SHOPIFY_ADMIN_APP_HANDLE;
    delete process.env.SHOPIFY_APP_HANDLE;
    delete process.env.SHOPIFY_API_KEY;
  });

  it("prefers the Shopify Admin embedded billing page when the app handle is available", () => {
    process.env.SHOPIFY_APP_URL = "https://app.example.com";
    const request = new Request(
      "https://app.example.com/app/billing?shop=ciwishop.myshopify.com&host=encoded-host",
      {
        headers: {
          referer:
            "https://admin.shopify.com/store/ciwishop/apps/desc-test-1/app/billing?shop=ciwishop.myshopify.com",
        },
      },
    );

    const returnUrl = buildBillingReturnUrl(
      BILLING_PAGE_PATH,
      request,
      "ciwishop.myshopify.com",
    );

    expect(returnUrl).toBe(
      "https://admin.shopify.com/store/ciwishop/apps/desc-test-1/app/billing?billing_return=1",
    );
    expect(returnUrl.length).toBeLessThanOrEqual(
      SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH,
    );
  });

  it("uses the production app handle when the Admin referer is unavailable", () => {
    process.env.SHOPIFY_APP_URL = "https://product-improve.onrender.com/app/product-improve";
    process.env.SHOPIFY_API_KEY = "b896c10abe3ca220b1efbc333ef41ad1";
    const request = new Request(
      "https://product-improve.onrender.com/app/billing?shop=ciwishop.myshopify.com&host=encoded-host",
    );

    const returnUrl = buildBillingReturnUrl(
      BILLING_PAGE_PATH,
      request,
      "ciwishop.myshopify.com",
    );

    expect(returnUrl).toBe(
      "https://admin.shopify.com/store/ciwishop/apps/ciwi-image-translation/app/billing?billing_return=1",
    );
  });

  it("falls back to the app origin and keeps only shop, host, and billing markers", () => {
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

  it("derives host from shop when host is missing in the app-origin fallback", () => {
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
