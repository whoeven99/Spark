import { beforeEach, describe, expect, it, vi } from "vitest";

const getGoogleAdsCredential = vi.hoisted(() => vi.fn());
const getGoogleMerchantCredential = vi.hoisted(() => vi.fn());
const setGoogleAdsCredential = vi.hoisted(() => vi.fn());
const refreshGoogleAccessTokenDetailed = vi.hoisted(() => vi.fn());
const getGoogleOAuthClient = vi.hoisted(() => vi.fn());

vi.mock("../../../../app/server/adsCatalog/credentialStore.server", () => ({
  getGoogleAdsCredential: (...args: unknown[]) => getGoogleAdsCredential(...args),
  getGoogleMerchantCredential: (...args: unknown[]) => getGoogleMerchantCredential(...args),
  setGoogleAdsCredential: (...args: unknown[]) => setGoogleAdsCredential(...args),
}));

vi.mock("../../../../app/server/adsCatalog/clients/googleMerchantClient.server", () => ({
  refreshGoogleAccessTokenDetailed: (...args: unknown[]) =>
    refreshGoogleAccessTokenDetailed(...args),
  isGoogleOAuthRefreshAuthError: (oauthError?: string) =>
    oauthError === "unauthorized_client" || oauthError === "invalid_grant",
}));

vi.mock("../../../../app/server/adsCatalog/googleOAuth.server", () => ({
  getGoogleOAuthClient: () => getGoogleOAuthClient(),
  getGoogleAdsDeveloperToken: () => "dev-token",
}));

vi.mock("../../../../app/server/adsCatalog/googleAdsApi.server", () => ({
  normalizeCustomerId: (id: string) => id.replace(/\D/g, ""),
  resolveLoginCustomerId: vi.fn(),
}));

import {
  GOOGLE_ADS_REAUTH_REQUIRED_MESSAGE,
  maybeRefreshGoogleAdsToken,
  resolveGoogleAdsOAuthClient,
} from "../../../../app/server/adsCatalog/googleAdsToken.server";

describe("googleAdsToken", () => {
  beforeEach(() => {
    getGoogleAdsCredential.mockReset();
    getGoogleMerchantCredential.mockReset();
    setGoogleAdsCredential.mockReset();
    refreshGoogleAccessTokenDetailed.mockReset();
    getGoogleOAuthClient.mockReset();
    setGoogleAdsCredential.mockResolvedValue(undefined);
    getGoogleMerchantCredential.mockResolvedValue(null);
    getGoogleOAuthClient.mockReturnValue({
      clientId: "env-client-id",
      clientSecret: "env-client-secret",
    });
  });

  it("resolveGoogleAdsOAuthClient 优先使用 Ads 凭证中的 client", async () => {
    const client = await resolveGoogleAdsOAuthClient("shop.myshopify.com", {
      accessToken: "token",
      customerId: "123",
      clientId: "ads-client",
      clientSecret: "ads-secret",
      updatedAt: new Date().toISOString(),
    });
    expect(client).toEqual({ clientId: "ads-client", clientSecret: "ads-secret" });
    expect(getGoogleMerchantCredential).not.toHaveBeenCalled();
  });

  it("resolveGoogleAdsOAuthClient 回退到 GMC 凭证", async () => {
    getGoogleMerchantCredential.mockResolvedValue({
      accessToken: "gmc-token",
      merchantId: "999",
      clientId: "gmc-client",
      clientSecret: "gmc-secret",
      updatedAt: new Date().toISOString(),
    });

    const client = await resolveGoogleAdsOAuthClient("shop.myshopify.com", {
      accessToken: "token",
      customerId: "123",
      updatedAt: new Date().toISOString(),
    });

    expect(client).toEqual({ clientId: "gmc-client", clientSecret: "gmc-secret" });
  });

  it("refresh 成功时写回 accessToken 并将 GMC client 持久化到 Ads 凭证", async () => {
    getGoogleAdsCredential.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      customerId: "123",
      updatedAt: new Date().toISOString(),
    });
    getGoogleMerchantCredential.mockResolvedValue({
      accessToken: "gmc-token",
      merchantId: "999",
      clientId: "gmc-client",
      clientSecret: "gmc-secret",
      updatedAt: new Date().toISOString(),
    });
    refreshGoogleAccessTokenDetailed.mockResolvedValue({
      ok: true,
      accessToken: "new-token",
      expiresIn: 3600,
    });

    const token = await maybeRefreshGoogleAdsToken("shop.myshopify.com");

    expect(token).toBe("new-token");
    expect(refreshGoogleAccessTokenDetailed).toHaveBeenCalledWith({
      clientId: "gmc-client",
      clientSecret: "gmc-secret",
      refreshToken: "refresh-token",
    });
    expect(setGoogleAdsCredential).toHaveBeenCalledWith(
      "shop.myshopify.com",
      expect.objectContaining({
        accessToken: "new-token",
        clientId: "gmc-client",
        clientSecret: "gmc-secret",
        accessTokenExpiresAt: expect.any(String),
      }),
    );
  });

  it("refresh 返回 unauthorized_client 时抛出需重新授权", async () => {
    getGoogleAdsCredential.mockResolvedValue({
      accessToken: "old-token",
      refreshToken: "refresh-token",
      customerId: "123",
      clientId: "ads-client",
      clientSecret: "ads-secret",
      updatedAt: new Date().toISOString(),
    });
    refreshGoogleAccessTokenDetailed.mockResolvedValue({
      ok: false,
      error: "Unauthorized",
      oauthError: "unauthorized_client",
    });

    await expect(maybeRefreshGoogleAdsToken("shop.myshopify.com")).rejects.toThrow(
      GOOGLE_ADS_REAUTH_REQUIRED_MESSAGE,
    );
    expect(setGoogleAdsCredential).not.toHaveBeenCalled();
  });

  it("access token 仍有效时，临时 refresh 失败可继续用旧 token", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    getGoogleAdsCredential.mockResolvedValue({
      accessToken: "still-valid-token",
      refreshToken: "refresh-token",
      customerId: "123",
      accessTokenExpiresAt: expiresAt,
      clientId: "ads-client",
      clientSecret: "ads-secret",
      updatedAt: new Date().toISOString(),
    });

    expect(await maybeRefreshGoogleAdsToken("shop.myshopify.com")).toBe("still-valid-token");
    expect(refreshGoogleAccessTokenDetailed).not.toHaveBeenCalled();
  });
});
