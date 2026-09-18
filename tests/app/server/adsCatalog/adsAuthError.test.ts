import { describe, expect, it } from "vitest";
import {
  AdsReauthRequiredError,
  classifyAdsFetchFailure,
  isAdsReauthRequiredError,
} from "../../../../app/server/adsCatalog/adsAuthError.server";

describe("adsAuthError", () => {
  it("把主动抛出的重新授权错误判成 reauth_required", () => {
    const error = new AdsReauthRequiredError("google", "Google Ads 授权已失效");
    expect(isAdsReauthRequiredError(error)).toBe(true);
    expect(classifyAdsFetchFailure("google", error)).toBe("reauth_required");
  });

  it("识别 Meta token 失效的原始报文", () => {
    const error = new Error(
      "Error validating access token: Session has expired on Tuesday, 10-Mar-26 00:00:00 PST.",
    );
    expect(classifyAdsFetchFailure("meta", error)).toBe("reauth_required");
  });

  it("识别 TikTok token 失效的原始报文", () => {
    expect(
      classifyAdsFetchFailure("tiktok", new Error("Access token is invalid or expired")),
    ).toBe("reauth_required");
  });

  it("平台限流、网络错误不算授权失效", () => {
    expect(
      classifyAdsFetchFailure("meta", new Error("(#17) User request limit reached")),
    ).toBe("fetch_failed");
    expect(
      classifyAdsFetchFailure("google", new Error("Google Ads API 网络请求失败: ETIMEDOUT")),
    ).toBe("fetch_failed");
    expect(classifyAdsFetchFailure("tiktok", new Error("TikTok HTTP 500"))).toBe(
      "fetch_failed",
    );
  });

  it("判据按平台隔离，不会把 Meta 话术套到 TikTok 上", () => {
    const metaMessage = new Error("OAuthException");
    expect(classifyAdsFetchFailure("meta", metaMessage)).toBe("reauth_required");
    expect(classifyAdsFetchFailure("tiktok", metaMessage)).toBe("fetch_failed");
  });
});
