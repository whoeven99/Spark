import {
  GMC_GCP_REGISTRATION_GUIDE_URL,
  isGmcGcpRegistrationRequiredError,
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
  meta?: string | null;
  metaCapi?: string | null;
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

function buildGmcGcpRegistrationBanner(
  t: AuthResultInput["t"],
): AdsCatalogAuthBanner {
  return {
    tone: "error",
    text: t("adsCatalog.gmcGcpRegistrationRequired"),
    link: {
      href: GMC_GCP_REGISTRATION_GUIDE_URL,
      label: t("adsCatalog.gmcGcpRegistrationGuideLink"),
    },
  };
}

function resolveGmcRegistrationBanner(
  input: Pick<AuthResultInput, "reason" | "gmcReason" | "gmc" | "google" | "t">,
): AdsCatalogAuthBanner | undefined {
  const { reason, gmcReason, gmc, google, t } = input;
  const gmcSideFailed = gmc === "error" || gmc === "empty" || google === "error";
  if (!gmcSideFailed) return undefined;
  if (!isGmcGcpRegistrationRequiredError(reason) && !isGmcGcpRegistrationRequiredError(gmcReason)) {
    return undefined;
  }
  return buildGmcGcpRegistrationBanner(t);
}

function formatGmcAuthDetail(
  reason: string | null | undefined,
  t: AuthResultInput["t"],
): string {
  if (isGmcGcpRegistrationRequiredError(reason)) {
    return t("adsCatalog.gmcGcpRegistrationRequired");
  }
  return reason || t("adsCatalog.googlePartialGmcMissing");
}

function resolveGoogleBanner(input: AuthResultInput): AdsCatalogAuthBanner | undefined {
  const { google, gmc, ads, reason, gmcReason, adsReason, t } = input;

  const registrationBanner = resolveGmcRegistrationBanner(input);
  if (registrationBanner) return registrationBanner;

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

export function resolveAdsCatalogAuthResult(input: AuthResultInput): AdsCatalogAuthResult {
  const { google, gmc, ads, meta, metaCapi, tiktok, reason, t } = input;

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
