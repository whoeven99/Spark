import {
  GMC_MERCHANT_SIGNUP_URL,
  isGmcGcpRegistrationRequiredError,
  isGmcNoMerchantAccountError,
} from "./gmcOAuthErrors";

export type AdsCatalogAuthBanner = {
  tone: "ok" | "error";
  text: string;
  link?: { href: string; label: string };
};

type AuthResultInput = {
  google?: string | null;
  gmc?: string | null;
  ads?: string | null;
  ga4?: string | null;
  ga4ErrorCode?: string | null;
  ga4PropertyName?: string | null;
  gsc?: string | null;
  gscErrorCode?: string | null;
  gscSiteUrl?: string | null;
  meta?: string | null;
  metaCapi?: string | null;
  metaUnified?: string | null;
  metaCatalog?: string | null;
  metaAds?: string | null;
  tiktok?: string | null;
  reason?: string | null;
  gmcReason?: string | null;
  adsReason?: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export type AdsCatalogAuthResult =
  | { action: "revalidate"; tab: "credentials"; banner?: AdsCatalogAuthBanner }
  | { action: "none" };

function hasValue(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function gmcSideFailed(
  input: Pick<AuthResultInput, "gmc" | "google">,
): boolean {
  return input.gmc === "error" || input.gmc === "empty" || input.google === "error";
}

function resolveGmcGcpPlatformBanner(
  input: Pick<AuthResultInput, "reason" | "gmcReason" | "gmc" | "google" | "t">,
): AdsCatalogAuthBanner | undefined {
  if (!gmcSideFailed(input)) return undefined;
  if (
    !isGmcGcpRegistrationRequiredError(input.reason) &&
    !isGmcGcpRegistrationRequiredError(input.gmcReason)
  ) {
    return undefined;
  }
  return {
    tone: "error",
    text: input.t("adsCatalog.gmcGcpRegistrationRequired"),
    link: {
      href: GMC_MERCHANT_SIGNUP_URL,
      label: input.t("adsCatalog.gmcNoMerchantAccountGuideLink"),
    },
  };
}

function resolveGmcNoAccountBanner(
  input: Pick<AuthResultInput, "reason" | "gmcReason" | "gmc" | "google" | "t">,
): AdsCatalogAuthBanner | undefined {
  if (!gmcSideFailed(input)) return undefined;
  if (
    !isGmcNoMerchantAccountError(input.reason) &&
    !isGmcNoMerchantAccountError(input.gmcReason)
  ) {
    return undefined;
  }
  return {
    tone: "error",
    text: input.t("adsCatalog.gmcNoMerchantAccount"),
    link: {
      href: GMC_MERCHANT_SIGNUP_URL,
      label: input.t("adsCatalog.gmcNoMerchantAccountGuideLink"),
    },
  };
}

function formatGmcAuthDetail(
  reason: string | null | undefined,
  t: AuthResultInput["t"],
): string {
  if (isGmcGcpRegistrationRequiredError(reason)) {
    return t("adsCatalog.gmcGcpRegistrationRequired");
  }
  if (isGmcNoMerchantAccountError(reason)) {
    return t("adsCatalog.gmcNoMerchantAccount");
  }
  return reason || t("adsCatalog.googlePartialGmcMissing");
}

function resolveGoogleBanner(input: AuthResultInput): AdsCatalogAuthBanner | undefined {
  const { google, gmc, ads, reason, gmcReason, adsReason, t } = input;

  const gcpBanner = resolveGmcGcpPlatformBanner(input);
  if (gcpBanner) return gcpBanner;
  const noAccountBanner = resolveGmcNoAccountBanner(input);
  if (noAccountBanner) return noAccountBanner;

  if (google === "cancelled" || gmc === "cancelled" || ads === "cancelled") {
    return { tone: "error", text: t("adsCatalog.authCancelled") };
  }

  if (google === "error" || (gmc === "error" && ads === "error")) {
    return { tone: "error", text: reason || t("adsCatalog.authError") };
  }

  const gmcMissing = gmc === "empty" || gmc === "error";
  const adsMissing = ads === "empty" || ads === "error";
  const gmcOk = gmc === "success";
  const adsOk = ads === "success";
  const hasSelect = google === "select" || gmc === "select" || ads === "select";

  if (hasSelect && !gmcMissing && !adsMissing) {
    return undefined;
  }

  if (
    google === "partial" ||
    (gmcOk && adsMissing) ||
    (adsOk && gmcMissing) ||
    (hasSelect && (gmcMissing || adsMissing))
  ) {
    const detail = gmcMissing
      ? formatGmcAuthDetail(gmcReason || reason, t)
      : adsReason || reason || t("adsCatalog.googlePartialAdsMissing");
    return { tone: "ok", text: t("adsCatalog.googleAuthPartial", { detail }) };
  }

  if (google === "success" || gmcOk || adsOk) {
    if (google || (gmcOk && adsOk)) {
      return { tone: "ok", text: t("adsCatalog.googleAuthSuccess") };
    }
    // 旧单侧 popup（仅 gmc / 仅 ads）
    return { tone: "ok", text: t("adsCatalog.authSuccess") };
  }

  if (gmc === "error" || ads === "error") {
    return { tone: "error", text: reason || t("adsCatalog.authError") };
  }

  return undefined;
}

function resolveGscBanner(input: AuthResultInput): AdsCatalogAuthBanner | undefined {
  const { gsc, gscErrorCode, gscSiteUrl, reason, t } = input;
  if (gsc === "cancelled") {
    return { tone: "error", text: t("gsc.authCancelled") };
  }
  if (gsc === "error") {
    if (gscErrorCode === "no_verified_sites") {
      return { tone: "error", text: t("gsc.authNoVerifiedSites") };
    }
    return {
      tone: "error",
      text: reason ? `${t("gsc.authError")} (${reason})` : t("gsc.authError"),
    };
  }
  if (gsc === "success") {
    return {
      tone: "ok",
      text: t("gsc.authSuccess", { siteUrl: gscSiteUrl ?? "" }),
    };
  }
  return undefined;
}

function resolveGa4Banner(input: AuthResultInput): AdsCatalogAuthBanner | undefined {
  const { ga4, ga4ErrorCode, ga4PropertyName, reason, t } = input;
  if (ga4 === "cancelled") {
    return { tone: "error", text: t("ga4.authCancelled") };
  }
  if (ga4 === "error") {
    if (ga4ErrorCode === "no_properties") {
      return { tone: "error", text: t("ga4.authNoProperties") };
    }
    return {
      tone: "error",
      text: reason ? `${t("ga4.authError")} (${reason})` : t("ga4.authError"),
    };
  }
  if (ga4 === "success") {
    return {
      tone: "ok",
      text: t("ga4.authSuccess", { propertyName: ga4PropertyName ?? "" }),
    };
  }
  return undefined;
}

function formatMetaUnifiedDetail(input: AuthResultInput): string {
  const { reason, t } = input;
  if (reason?.trim()) return reason.trim();
  const missing: string[] = [];
  if (input.metaAds === "empty" || input.metaAds === "error") {
    missing.push(t("adsCatalog.metaAdsMissing"));
  }
  if (input.metaCatalog === "empty" || input.metaCatalog === "error") {
    missing.push(t("adsCatalog.metaCatalogMissing"));
  }
  if (input.metaCapi === "empty" || input.metaCapi === "error" || input.metaCapi === "blocked") {
    missing.push(t("adsCatalog.metaCapiMissing"));
  }
  return missing.join("；") || t("adsCatalog.authError");
}

function resolveMetaUnifiedBanner(input: AuthResultInput): AdsCatalogAuthBanner | undefined {
  const { metaUnified, t } = input;
  if (!hasValue(metaUnified)) return undefined;
  if (metaUnified === "cancelled") {
    return { tone: "error", text: t("adsCatalog.authCancelled") };
  }
  if (metaUnified === "error") {
    return { tone: "error", text: input.reason || t("adsCatalog.authError") };
  }
  if (metaUnified === "partial") {
    return {
      tone: "error",
      text: t("adsCatalog.metaAuthPartial", { detail: formatMetaUnifiedDetail(input) }),
    };
  }
  if (metaUnified === "success") {
    return { tone: "ok", text: t("adsCatalog.metaUnifiedAuthSuccess") };
  }
  return undefined;
}

export function resolveAdsCatalogAuthResult(input: AuthResultInput): AdsCatalogAuthResult {
  const { google, gmc, ads, ga4, gsc, meta, metaCapi, metaUnified, tiktok, reason, t } = input;

  if (hasValue(gsc)) {
    const banner = resolveGscBanner(input);
    if (
      banner ||
      gsc === "success" ||
      gsc === "select" ||
      gsc === "error" ||
      gsc === "cancelled"
    ) {
      return { action: "revalidate", tab: "credentials", ...(banner ? { banner } : {}) };
    }
  }

  if (hasValue(ga4)) {
    const banner = resolveGa4Banner(input);
    if (
      banner ||
      ga4 === "success" ||
      ga4 === "select" ||
      ga4 === "error" ||
      ga4 === "cancelled"
    ) {
      return { action: "revalidate", tab: "credentials", ...(banner ? { banner } : {}) };
    }
  }

  if (hasValue(metaUnified)) {
    const banner = resolveMetaUnifiedBanner(input);
    if (
      banner ||
      metaUnified === "success" ||
      metaUnified === "partial" ||
      metaUnified === "error" ||
      metaUnified === "cancelled" ||
      input.metaCatalog === "select" ||
      input.metaAds === "select" ||
      metaCapi === "select"
    ) {
      return { action: "revalidate", tab: "credentials", ...(banner ? { banner } : {}) };
    }
  }

  if (
    google === "select" ||
    gmc === "select" ||
    ads === "select" ||
    meta === "select" ||
    metaCapi === "select" ||
    tiktok === "select"
  ) {
    const banner = resolveGoogleBanner(input);
    return { action: "revalidate", tab: "credentials", ...(banner ? { banner } : {}) };
  }

  if (hasValue(google) || hasValue(gmc) || hasValue(ads)) {
    const banner = resolveGoogleBanner(input);
    if (
      banner ||
      google === "success" ||
      google === "partial" ||
      google === "error" ||
      google === "cancelled" ||
      gmc === "success" ||
      ads === "success" ||
      gmc === "empty" ||
      ads === "empty" ||
      gmc === "error" ||
      ads === "error" ||
      gmc === "cancelled" ||
      ads === "cancelled"
    ) {
      return { action: "revalidate", tab: "credentials", banner };
    }
  }

  if (meta === "success" || metaCapi === "success" || tiktok === "success") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: {
        tone: "ok",
        text:
          metaCapi === "success"
            ? t("adsCatalog.metaCapiAuthSuccess")
            : t("adsCatalog.authSuccess"),
      },
    };
  }

  if (tiktok === "authorized") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: t("adsCatalog.tiktokAuthorizedBanner") },
    };
  }

  if (meta === "error" || metaCapi === "error" || tiktok === "error") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: reason || t("adsCatalog.authError") },
    };
  }

  if (meta === "cancelled" || metaCapi === "cancelled" || tiktok === "cancelled") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: t("adsCatalog.authCancelled") },
    };
  }

  return { action: "none" };
}
