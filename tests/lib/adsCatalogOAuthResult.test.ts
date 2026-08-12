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

  it("shows meta business unified success banner", () => {
    const result = resolveAdsCatalogAuthResult({
      metaBusiness: "success",
      t,
    });
    expect(result).toEqual({
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: "adsCatalog.metaBusinessAuthSuccess" },
    });
  });
});
