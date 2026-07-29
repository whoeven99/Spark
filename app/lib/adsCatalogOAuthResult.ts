export type AdsCatalogAuthBanner = { tone: "ok" | "error"; text: string };

type AuthResultInput = {
  gmc?: string | null;
  ads?: string | null;
  meta?: string | null;
  tiktok?: string | null;
  reason?: string | null;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export type AdsCatalogAuthResult =
  | { action: "revalidate"; tab: "credentials"; banner?: AdsCatalogAuthBanner }
  | { action: "none" };

export function resolveAdsCatalogAuthResult(input: AuthResultInput): AdsCatalogAuthResult {
  const { gmc, ads, meta, tiktok, reason, t } = input;

  if (gmc === "select" || ads === "select" || meta === "select" || tiktok === "select") {
    return { action: "revalidate", tab: "credentials" };
  }

  if (gmc === "success" || ads === "success" || meta === "success" || tiktok === "success") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: t("adsCatalog.authSuccess") },
    };
  }

  if (tiktok === "authorized") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "ok", text: t("adsCatalog.tiktokAuthorizedBanner") },
    };
  }

  if (gmc === "error" || ads === "error" || meta === "error" || tiktok === "error") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: reason || t("adsCatalog.authError") },
    };
  }

  if (gmc === "cancelled" || ads === "cancelled" || meta === "cancelled" || tiktok === "cancelled") {
    return {
      action: "revalidate",
      tab: "credentials",
      banner: { tone: "error", text: t("adsCatalog.authCancelled") },
    };
  }

  return { action: "none" };
}
