import { describe, expect, it } from "vitest";
import { resolveAdsCatalogAuthResult } from "../../app/lib/adsCatalogOAuthResult";

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === "adsCatalog.googleAuthPartial") {
    return `partial:${String(options?.detail ?? "")}`;
  }
  return key;
};

describe("resolveAdsCatalogAuthResult google combined", () => {
  it("revalidates on select without banner", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "select",
      gmc: "select",
      ads: "success",
      t,
    });
    expect(result).toEqual({ action: "revalidate", tab: "credentials" });
  });

  it("shows combined success banner", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "success",
      gmc: "success",
      ads: "success",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "adsCatalog.googleAuthSuccess" },
    });
  });

  it("shows partial banner when ads side is empty", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "partial",
      gmc: "success",
      ads: "empty",
      adsReason: "no ads",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "partial:no ads" },
    });
  });

  it("shows partial banner when one side fails after combined consent", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "partial",
      gmc: "success",
      ads: "error",
      adsReason: "ads binding failed",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "partial:ads binding failed" },
    });
  });

  it("keeps the failed-side banner while the other side awaits account selection", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "select",
      gmc: "select",
      ads: "error",
      adsReason: "ads binding failed",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "partial:ads binding failed" },
    });
  });

  it("shows cancelled banner", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "cancelled",
      gmc: "cancelled",
      ads: "cancelled",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: "adsCatalog.authCancelled" },
    });
  });

  it("keeps legacy gmc-only success", () => {
    const result = resolveAdsCatalogAuthResult({
      gmc: "success",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "adsCatalog.authSuccess" },
    });
  });

  it("guides merchants to create a Merchant Center when GMC cannot be listed", () => {
    const result = resolveAdsCatalogAuthResult({
      gmc: "error",
      reason: "gcp_registration_required",
      t: (key) =>
        key === "adsCatalog.gmcGcpRegistrationRequired"
          ? "create mc first"
          : key === "adsCatalog.gmcNoMerchantAccountGuideLink"
            ? "signup"
            : key,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: {
        tone: "error",
        text: "create mc first",
        link: {
          href: "https://merchants.google.com",
          label: "signup",
        },
      },
    });
  });

  it("keeps the same Merchant Center signup guidance after combined GMC list failures", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "partial",
      gmc: "empty",
      ads: "success",
      gmcReason: "gcp_registration_required",
      t: (key) =>
        key === "adsCatalog.gmcGcpRegistrationRequired"
          ? "create mc first"
          : key === "adsCatalog.gmcNoMerchantAccountGuideLink"
            ? "signup"
            : key,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: {
        tone: "error",
        text: "create mc first",
        link: {
          href: "https://merchants.google.com",
          label: "signup",
        },
      },
    });
  });

  it("guides merchants to create a Merchant Center when the Google account has none", () => {
    const result = resolveAdsCatalogAuthResult({
      google: "partial",
      gmc: "empty",
      ads: "success",
      gmcReason: "no_merchant_account",
      t: (key) =>
        key === "adsCatalog.gmcNoMerchantAccount"
          ? "create mc first"
          : key === "adsCatalog.gmcNoMerchantAccountGuideLink"
            ? "signup"
            : key,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: {
        tone: "error",
        text: "create mc first",
        link: {
          href: "https://merchants.google.com",
          label: "signup",
        },
      },
    });
  });

  it("guides merchants to create a Merchant Center on gmc-only empty results", () => {
    const result = resolveAdsCatalogAuthResult({
      gmc: "error",
      reason: "no_merchant_account",
      t: (key) =>
        key === "adsCatalog.gmcNoMerchantAccount"
          ? "create mc first"
          : key === "adsCatalog.gmcNoMerchantAccountGuideLink"
            ? "signup"
            : key,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: {
        tone: "error",
        text: "create mc first",
        link: {
          href: "https://merchants.google.com",
          label: "signup",
        },
      },
    });
  });
});

describe("resolveAdsCatalogAuthResult meta unified", () => {
  it("shows a success banner when every Meta capability is connected", () => {
    const result = resolveAdsCatalogAuthResult({
      metaUnified: "success",
      metaCatalog: "success",
      metaAds: "success",
      metaCapi: "success",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "adsCatalog.metaUnifiedAuthSuccess" },
    });
  });

  it("shows a partial banner when ads is missing", () => {
    const result = resolveAdsCatalogAuthResult({
      metaUnified: "partial",
      metaCatalog: "success",
      metaAds: "empty",
      metaCapi: "success",
      reason: "no ads accounts",
      t: (key, options) =>
        key === "adsCatalog.metaAuthPartial"
          ? `partial:${String(options?.detail ?? "")}`
          : key,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: "partial:no ads accounts" },
    });
  });

  it("shows an error banner when unified auth fails entirely", () => {
    const result = resolveAdsCatalogAuthResult({
      metaUnified: "error",
      reason: "Meta 未返回授权 code",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: "Meta 未返回授权 code" },
    });
  });
});

describe("resolveAdsCatalogAuthResult gsc", () => {
  it("revalidates on select without banner", () => {
    const result = resolveAdsCatalogAuthResult({
      gsc: "select",
      t,
    });
    expect(result).toEqual({ action: "revalidate", tab: "credentials" });
  });

  it("shows success banner", () => {
    const result = resolveAdsCatalogAuthResult({
      gsc: "success",
      gscSiteUrl: "https://example.com/",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "gsc.authSuccess" },
    });
  });

  it("shows no-verified-sites error", () => {
    const result = resolveAdsCatalogAuthResult({
      gsc: "error",
      gscErrorCode: "no_verified_sites",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: "gsc.authNoVerifiedSites" },
    });
  });
});

describe("resolveAdsCatalogAuthResult ga4", () => {
  it("revalidates on select without banner", () => {
    const result = resolveAdsCatalogAuthResult({
      ga4: "select",
      t,
    });
    expect(result).toEqual({ action: "revalidate", tab: "credentials" });
  });

  it("shows success banner", () => {
    const result = resolveAdsCatalogAuthResult({
      ga4: "success",
      ga4PropertyName: "Shop traffic",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "ga4.authSuccess" },
    });
  });

  it("shows no-properties error", () => {
    const result = resolveAdsCatalogAuthResult({
      ga4: "error",
      ga4ErrorCode: "no_properties",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: "ga4.authNoProperties" },
    });
  });
});
