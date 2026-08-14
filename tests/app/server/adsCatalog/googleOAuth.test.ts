import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADS_SCOPE,
  GMC_SCOPE,
  buildGoogleOAuthStartUrl,
  verifyOAuthState,
} from "../../../../app/server/adsCatalog/googleOAuth.server";

describe("Google Catalog OAuth flows", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("SHOPIFY_API_SECRET", "test-shopify-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["gmc", GMC_SCOPE, "/ads/google-merchant/callback"],
    ["ads", ADS_SCOPE, "/ads/google-merchant/callback"],
    ["gmc_ads", `${GMC_SCOPE} ${ADS_SCOPE}`, "/ads/google-merchant/callback"],
  ] as const)("builds the %s scope and callback", (flow, scope, callbackPath) => {
    const result = buildGoogleOAuthStartUrl({
      flow,
      shop: "shop.myshopify.com",
      host: "admin-host",
      requestOrigin: "https://spark.example.com",
      popup: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const authUrl = new URL(result.authUrl);
    expect(authUrl.searchParams.get("scope")).toBe(scope);
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      `https://spark.example.com${callbackPath}`,
    );
    expect(verifyOAuthState(authUrl.searchParams.get("state") ?? "")).toMatchObject({
      shop: "shop.myshopify.com",
      flow,
      popup: true,
    });
  });
});
