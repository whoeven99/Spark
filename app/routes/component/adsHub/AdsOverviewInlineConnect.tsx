/**
 * 总览空态内嵌三平台主授权（方案 B）。
 * 只开 Combined / Unified / TikTok 主路径；选账户、GA4、GSC、断开仍在「连接账户」。
 */
import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup, type OAuthPopupMessage } from "../../../hooks/useOAuthPopup";
import {
  resolveAdsCatalogAuthResult,
  type AdsCatalogAuthBanner,
} from "../../../lib/adsCatalogOAuthResult";
import { buildAdsHubConnectPath } from "../../../lib/adsHubNav";
import type { AdsOverviewPlatform } from "../../../server/adsInsights/overview.server";
import { pageColorTokens } from "../../page/pageUiStyles";

export type AdsOverviewBindingPending = {
  google: boolean;
  meta: boolean;
  tiktok: boolean;
};

type PlatformKey = AdsOverviewPlatform["platform"];

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content",
};

const secondaryLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
  width: "fit-content",
};

type Props = {
  platforms: AdsOverviewPlatform[];
  bindingPending: AdsOverviewBindingPending;
  locationSearch: string;
  onAuthSettled: () => void;
};

export function AdsOverviewInlineConnect({
  platforms,
  bindingPending,
  locationSearch,
  onAuthSettled,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<AdsCatalogAuthBanner | null>(null);
  const googleOAuth = useOAuthPopup("google_oauth");
  const metaOAuth = useOAuthPopup("meta_unified_oauth");
  const tiktokOAuth = useOAuthPopup("tiktok_catalog_oauth");
  const anyRedirecting =
    googleOAuth.redirecting || metaOAuth.redirecting || tiktokOAuth.redirecting;
  const disabled = busy || anyRedirecting;

  function applyPopupResult(platform: PlatformKey, data: OAuthPopupMessage) {
    const result =
      platform === "google"
        ? resolveAdsCatalogAuthResult({
            google: data.googleAuth,
            gmc: data.gmcAuth,
            ads: data.adsAuth,
            reason: data.reason,
            gmcReason: data.gmcReason,
            adsReason: data.adsReason,
            t,
          })
        : platform === "meta"
          ? resolveAdsCatalogAuthResult({
              metaUnified: data.metaUnifiedAuth,
              metaCatalog: data.metaCatalog,
              metaAds: data.metaAds,
              metaCapi: data.metaCapi,
              reason: data.reason,
              t,
            })
          : resolveAdsCatalogAuthResult({
              tiktok: data.tiktokAuth,
              reason: data.reason,
              t,
            });

    if (result.action === "none") return;
    if (result.banner) setBanner(result.banner);
    onAuthSettled();
  }

  function startOAuth(platform: PlatformKey) {
    const endpoint =
      platform === "google"
        ? "/api/ads-catalog/google-auth-url"
        : platform === "meta"
          ? "/api/ads-catalog/meta-unified-auth-url"
          : "/api/ads-catalog/tiktok-auth-url";
    const oauth =
      platform === "google" ? googleOAuth : platform === "meta" ? metaOAuth : tiktokOAuth;

    void (async () => {
      setBusy(true);
      setBanner(null);
      try {
        await oauth.startOAuth(`${endpoint}${locationSearch}`, (data) =>
          applyPopupResult(platform, data),
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {banner ? (
        <div
          style={{
            padding: "10px 16px",
            background:
              banner.tone === "ok" ? pageColorTokens.brandGreenLight : "#fdecec",
            color:
              banner.tone === "ok" ? pageColorTokens.brandGreenDeep : "#c0392b",
            borderBottom: `1px solid ${pageColorTokens.divider}`,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {banner.text}
          {banner.link ? (
            <>
              {" "}
              <a
                href={banner.link.href}
                target="_blank"
                rel="noreferrer"
                style={{ color: "inherit", fontWeight: 700, textDecoration: "underline" }}
              >
                {banner.link.label}
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {platforms.map((platform, index) => {
        const key = platform.platform;
        const pending = bindingPending[key];
        const needsFinish = pending || platform.catalogConnected;
        const hint = needsFinish
          ? platform.catalogConnected
            ? t("adsHub.overview.catalogOnly")
            : t("adsHub.overview.finishBindingHint")
          : t(`adsHub.overview.inlineAuthHint.${key}`);

        return (
          <div
            key={key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "12px 16px",
              borderTop: index === 0 && !banner ? "none" : `1px solid ${pageColorTokens.divider}`,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: pageColorTokens.textPrimary }}>
                {PLATFORM_LABELS[key] ?? key}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: pageColorTokens.textSecondary,
                  lineHeight: 1.45,
                }}
              >
                {hint}
              </div>
            </div>

            {needsFinish ? (
              <Link to={buildAdsHubConnectPath(key, locationSearch)} style={secondaryLink}>
                {platform.catalogConnected
                  ? t("adsHub.overview.connectAdsAccount")
                  : t("adsHub.overview.finishBinding")}
              </Link>
            ) : (
              <button
                type="button"
                style={{
                  ...primaryBtn,
                  opacity: disabled ? 0.65 : 1,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
                disabled={disabled}
                onClick={() => startOAuth(key)}
              >
                {t(`adsHub.overview.inlineAuthButton.${key}`)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
