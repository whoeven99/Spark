import { useState } from "react";
import { Link, useLoaderData, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  PageHeaderNav,
  PageSurface,
  pageColorTokens,
  pageContentStyle,
  pageHintTextStyle,
} from "./pageUiStyles";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { MetaAdsForm } from "../component/adsCreate/MetaAdsForm";
import { TiktokAdsForm } from "../component/adsCreate/TiktokAdsForm";
import { GoogleAdsForm } from "../component/adsCreate/GoogleAdsForm";
import type { AdsCreateLoaderData } from "../component/adsCreate/types";

type Platform = "meta" | "tiktok" | "google";

interface CreateRecord {
  platform: Platform;
  campaignId: string;
  adId: string;
  createdAt: string;
}

export function AdsCreatePage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const loaderData = useLoaderData<AdsCreateLoaderData>();
  const locationSearch = location.search || "";

  const [platform, setPlatform] = useState<Platform>("meta");
  const [recentAds, setRecentAds] = useState<CreateRecord[]>([]);

  function handleSuccess(pl: Platform, campaignId: string, adId: string) {
    setRecentAds((prev) => [
      { platform: pl, campaignId, adId, createdAt: new Date().toLocaleString(i18n.language) },
      ...prev.slice(0, 9),
    ]);
  }

  const platformTabs = [
    { key: "meta" as const, label: t("adsCreate.tabMeta") },
    { key: "tiktok" as const, label: t("adsCreate.tabTiktok") },
    { key: "google" as const, label: t("adsCreate.tabGoogle") },
  ];

  const connections: Record<Platform, boolean> = {
    meta: loaderData.meta.connected,
    tiktok: loaderData.tiktok.connected,
    google: loaderData.google.connected,
  };

  const currentConnected = connections[platform];

  return (
    <PageSurface>
      <PageHeaderNav
        workspaceOnly={false}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
        title={t("adsCreate.pageTitle")}
        subtitle={t("adsCreate.pageSubtitle")}
      />

      <div style={pageContentStyle}>
        <SegmentedPageTabs
          activeTab={platform}
          onTabChange={setPlatform}
          ariaLabel={t("adsCreate.platformTabsAria")}
          items={platformTabs}
        />

        {/* 账户状态提示 */}
        <ConnectionStatus platform={platform} loaderData={loaderData} locationSearch={locationSearch} t={t} />

        {/* 表单区域 */}
        {currentConnected ? (
          <div>
            {platform === "meta" && (
              <MetaAdsForm locationSearch={locationSearch} onSuccess={(c, a) => handleSuccess("meta", c, a)} />
            )}
            {platform === "tiktok" && (
              <TiktokAdsForm locationSearch={locationSearch} onSuccess={(c, a) => handleSuccess("tiktok", c, a)} />
            )}
            {platform === "google" && (
              <GoogleAdsForm locationSearch={locationSearch} onSuccess={(c, a) => handleSuccess("google", c, a)} />
            )}
          </div>
        ) : null}

        {/* 本次会话的创建记录 */}
        {recentAds.length > 0 && (
          <div style={recentSectionStyle}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
              {t("adsCreate.recentTitle")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentAds.map((rec) => (
                <div key={`${rec.adId}-${rec.createdAt}`} style={recentRowStyle}>
                  <span style={platformBadgeStyle(rec.platform)}>{rec.platform.toUpperCase()}</span>
                  <span style={{ fontSize: 13, color: pageColorTokens.textPrimary, flex: 1 }}>
                    {t("adsCreate.recentAdId", { id: rec.adId })}
                    {rec.campaignId && (
                      <span style={{ color: pageColorTokens.textSecondary, marginLeft: 8 }}>
                        {t("adsCreate.recentCampaignId", { id: rec.campaignId })}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: pageColorTokens.textSecondary }}>{rec.createdAt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageSurface>
  );
}

// ─── 连接状态提示组件 ─────────────────────────────────────────────────────────

interface ConnectionStatusProps {
  platform: Platform;
  loaderData: AdsCreateLoaderData;
  locationSearch: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function ConnectionStatus({ platform, loaderData, locationSearch, t }: ConnectionStatusProps) {
  const { meta, tiktok, google } = loaderData;

  if (platform === "meta") {
    if (!meta.connected) {
      return (
        <NotConnectedBanner
          msg={t("adsCreate.meta.notConnected")}
          linkTo={`/app/settings/ads-insights${locationSearch}`}
          linkLabel={t("adsCreate.goConnectMeta")}
        />
      );
    }
    return (
      <ConnectedBadge
        label={t("adsCreate.meta.connectedAs", {
          account: meta.adAccountName || meta.adAccountId,
        })}
      />
    );
  }

  if (platform === "tiktok") {
    if (!tiktok.connected) {
      return (
        <NotConnectedBanner
          msg={t("adsCreate.tiktok.notConnected")}
          linkTo={`/app/ads-catalog${locationSearch}`}
          linkLabel={t("adsCreate.goConnectTiktok")}
        />
      );
    }
    return (
      <ConnectedBadge
        label={t("adsCreate.tiktok.connectedAs", { id: tiktok.advertiserId })}
      />
    );
  }

  if (platform === "google") {
    if (!google.connected) {
      return (
        <NotConnectedBanner
          msg={t("adsCreate.google.notConnected")}
          linkTo={`/app/ads-catalog${locationSearch}`}
          linkLabel={t("adsCreate.goConnectGoogle")}
        />
      );
    }
    if (!google.developerTokenConfigured) {
      return (
        <div style={warnBoxStyle}>
          {t("adsCreate.google.devTokenMissing")}
        </div>
      );
    }
    return (
      <ConnectedBadge
        label={t("adsCreate.google.connectedAs", { id: google.customerId })}
      />
    );
  }

  return null;
}

function NotConnectedBanner({ msg, linkTo, linkLabel }: { msg: string; linkTo: string; linkLabel: string }) {
  return (
    <div style={notConnectedStyle}>
      <span>{msg}</span>
      <Link to={linkTo} style={{ color: pageColorTokens.brandBlueDark, fontWeight: 600, fontSize: 13 }}>
        {linkLabel}
      </Link>
    </div>
  );
}

function ConnectedBadge({ label }: { label: string }) {
  return (
    <div style={connectedStyle}>
      <span style={{ color: pageColorTokens.brandGreenDeep }}>✓</span>
      <span>{label}</span>
    </div>
  );
}

// ─── 样式 ──────────────────────────────────────────────────────────────────────

const notConnectedStyle = {
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  padding: "12px 16px",
  borderRadius: pageColorTokens.radiusControl,
  fontSize: 13,
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 10,
  alignItems: "center",
};

const connectedStyle = {
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  padding: "8px 14px",
  borderRadius: pageColorTokens.radiusControl,
  fontSize: 13,
  fontWeight: 600,
  display: "flex",
  gap: 6,
  alignItems: "center",
};

const warnBoxStyle = {
  background: "#fff7e0",
  color: "#b98900",
  padding: "10px 14px",
  borderRadius: pageColorTokens.radiusControl,
  fontSize: 13,
};

const recentSectionStyle = {
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 16,
};

const recentRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  background: pageColorTokens.surface,
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

function platformBadgeStyle(platform: Platform) {
  const colors: Record<Platform, { bg: string; color: string }> = {
    meta: { bg: "#e7f0fd", color: "#1877f2" },
    tiktok: { bg: "#f0f0f0", color: "#111" },
    google: { bg: "#fce8e6", color: "#ea4335" },
  };
  const { bg, color } = colors[platform];
  return {
    background: bg,
    color,
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  };
}
