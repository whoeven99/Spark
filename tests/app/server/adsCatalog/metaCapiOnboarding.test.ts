import { describe, expect, it } from "vitest";
import {
  buildMetaCapiBusinessAuthUrl,
  buildMetaUnifiedOAuthStartUrl,
  resolveMetaCapiLoginConfigId,
} from "../../../../app/server/adsCatalog/metaOAuth.server";
import { hasMetaCapiBisuToken } from "../../../../app/server/adsCatalog/metaCapiOnboarding.server";

describe("meta CAPI Business Login", () => {
  it("buildMetaCapiBusinessAuthUrl uses config_id without scope", () => {
    const url = buildMetaCapiBusinessAuthUrl({
      appId: "app-123",
      state: "signed-state",
      redirectUri: "https://example.com/ads/meta-capi/callback",
      configId: "cfg-456",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("app-123");
    expect(parsed.searchParams.get("config_id")).toBe("cfg-456");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBeNull();
  });

  it("resolveMetaCapiLoginConfigId reads env", () => {
    const previous = process.env.META_CAPI_LOGIN_CONFIG_ID;
    process.env.META_CAPI_LOGIN_CONFIG_ID = " cfg-test ";
    expect(resolveMetaCapiLoginConfigId()).toBe("cfg-test");
    if (previous === undefined) delete process.env.META_CAPI_LOGIN_CONFIG_ID;
    else process.env.META_CAPI_LOGIN_CONFIG_ID = previous;
  });

  it("builds the unified Business Login URL with the configured callback", async () => {
    const previousAppId = process.env.META_APP_ID;
    const previousAppSecret = process.env.META_APP_SECRET;
    const previousConfigId = process.env.META_CAPI_LOGIN_CONFIG_ID;
    process.env.META_APP_ID = "app-unified";
    process.env.META_APP_SECRET = "secret-unified";
    process.env.META_CAPI_LOGIN_CONFIG_ID = "cfg-unified";

    const result = await buildMetaUnifiedOAuthStartUrl({
      shop: "shop.myshopify.com",
      requestOrigin: "https://app.example.com",
      popup: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = new URL(result.authUrl);
      expect(parsed.searchParams.get("client_id")).toBe("app-unified");
      expect(parsed.searchParams.get("config_id")).toBe("cfg-unified");
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        "https://app.example.com/ads/meta-unified/callback",
      );
      expect(parsed.searchParams.get("scope")).toBeNull();
    }

    if (previousAppId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousAppId;
    if (previousAppSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previousAppSecret;
    if (previousConfigId === undefined) delete process.env.META_CAPI_LOGIN_CONFIG_ID;
    else process.env.META_CAPI_LOGIN_CONFIG_ID = previousConfigId;
  });

  it("hasMetaCapiBisuToken detects bisu credential", () => {
    expect(
      hasMetaCapiBisuToken({
        accessToken: "catalog",
        catalogId: "cat",
        capiAccessToken: "bisu-token",
        capiTokenType: "bisu",
        updatedAt: new Date().toISOString(),
      }),
    ).toBe(true);
    expect(
      hasMetaCapiBisuToken({
        accessToken: "catalog",
        catalogId: "cat",
        capiAccessToken: "legacy",
        capiTokenType: "legacy_fbe",
        updatedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });
});
