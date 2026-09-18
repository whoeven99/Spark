import { describe, expect, it } from "vitest";
import {
  GMC_OAUTH_ERROR_GCP_REGISTRATION,
  GMC_OAUTH_ERROR_NO_ACCOUNT,
  isGmcGcpRegistrationRequiredError,
  isGmcNoMerchantAccountError,
  normalizeGmcOAuthError,
} from "../../app/lib/gmcOAuthErrors";

describe("gmcOAuthErrors", () => {
  it("detects Google Merchant API GCP registration errors", () => {
    expect(
      isGmcGcpRegistrationRequiredError(
        "GCP project with id decoded-tesla-499706-t5 and number 1074639222573 is not registered with the merchant account.",
      ),
    ).toBe(true);
    expect(isGmcGcpRegistrationRequiredError(GMC_OAUTH_ERROR_GCP_REGISTRATION)).toBe(true);
    expect(isGmcGcpRegistrationRequiredError("GMC 账户列表获取失败")).toBe(false);
  });

  it("detects missing Merchant Center accounts without treating them as GCP registration", () => {
    expect(isGmcNoMerchantAccountError(GMC_OAUTH_ERROR_NO_ACCOUNT)).toBe(true);
    expect(isGmcNoMerchantAccountError("该 Google 账号未关联任何 Merchant Center 账户")).toBe(true);
    expect(isGmcGcpRegistrationRequiredError(GMC_OAUTH_ERROR_NO_ACCOUNT)).toBe(false);
  });

  it("normalizes registration errors to a stable code", () => {
    expect(
      normalizeGmcOAuthError(
        "GCP project with id foo is not registered with the merchant account.",
      ),
    ).toBe(GMC_OAUTH_ERROR_GCP_REGISTRATION);
    expect(normalizeGmcOAuthError("该 Google 账号未关联任何 Merchant Center 账户")).toBe(
      GMC_OAUTH_ERROR_NO_ACCOUNT,
    );
    expect(normalizeGmcOAuthError("other error")).toBe("other error");
  });
});
