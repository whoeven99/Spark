import type { CSSProperties, ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEmbeddedLocationSearch } from "../../../hooks/useEmbeddedLocationSearch";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import {
  isAdsHubBarePath,
  listVisibleAdsHubCapabilities,
  resolveActiveAdsHubCap,
  type AdsHubCapability,
} from "../../../lib/adsHubNav";
import { pageColorTokens } from "../../page/pageUiStyles";

function appendSearchToPath(path: string, search: string): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (!q) return path;
  const [base, existing] = path.split("?");
  if (!existing) return `${base}?${q}`;
  const merged = new URLSearchParams(existing);
  const incoming = new URLSearchParams(q);
  for (const [key, value] of incoming.entries()) {
    if (!merged.has(key)) merged.set(key, value);
  }
  const s = merged.toString();
  return s ? `${base}?${s}` : base;
}

const tabStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 12px",
  borderRadius: pageColorTokens.radiusControl,
  textDecoration: "none",
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textBody,
  background: active ? pageColorTokens.brandGreenLight : "transparent",
  border: active ? `1px solid ${pageColorTokens.brandGreenGlow}` : "1px solid transparent",
  whiteSpace: "nowrap",
});

/**
 * 顶栏与正文共用同一条内容轴，否则宽屏下标题/分段贴两边、正文贴左边，看着是两套栅格。
 * 取值与 `analysisPageContentStyle` 一致，投放表现/归因这类宽表页不会因此变窄。
 */
const HUB_CONTENT_MAX_WIDTH = 1440;

const hubContainerStyle: CSSProperties = {
  width: "100%",
  maxWidth: HUB_CONTENT_MAX_WIDTH,
  marginInline: "auto",
};

const connectBtnStyle = (active: boolean): CSSProperties => ({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: pageColorTokens.radiusControl,
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 600,
  background: active ? pageColorTokens.brandGreen : pageColorTokens.surface,
  color: active ? "#fff" : pageColorTokens.textPrimary,
  border: active ? "none" : `1px solid ${pageColorTokens.borderInput}`,
  whiteSpace: "nowrap",
});

/**
 * 广告 hub 壳：顶部分段（总览 / 投放表现 / 归因…）+ 右侧「连接账户」。
 * 不再用左栏能力目录；路由与能力清单不变。
 */
export function AdsHubShell({
  children,
  showReviewHidden = false,
}: {
  children: ReactNode;
  showReviewHidden?: boolean;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const locationSearch = useEmbeddedLocationSearch();
  const { isMobile } = useResponsiveLayout();
  const bare = isAdsHubBarePath(location.pathname);

  if (bare) {
    return <>{children}</>;
  }

  const caps = listVisibleAdsHubCapabilities({ showReviewHidden });
  const active = resolveActiveAdsHubCap(location.pathname, location.search);
  const connectCap = caps.find((cap) => cap.key === "connect");
  const mainCaps = caps.filter((cap) => cap.key !== "connect");

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <TitleBar title={t("adsHub.title")} />
      <div
        style={{
          borderBottom: `1px solid ${pageColorTokens.border}`,
          background: pageColorTokens.surface,
          padding: isMobile ? "12px 12px 10px" : "16px 20px 12px",
        }}
      >
        <div
          style={{
            ...hubContainerStyle,
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
            justifyContent: "space-between",
            gap: isMobile ? 12 : 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: pageColorTokens.textPrimary,
              }}
            >
              {t("adsHub.title")}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: pageColorTokens.textSecondary,
                lineHeight: 1.4,
              }}
            >
              {t("adsHub.subtitle")}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 6,
              justifyContent: isMobile ? "flex-start" : "flex-end",
            }}
          >
            <nav
              aria-label={t("adsHub.title")}
              style={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 2,
                padding: 2,
                borderRadius: pageColorTokens.radiusControl,
                background: pageColorTokens.surfaceMuted,
              }}
            >
              {mainCaps.map((cap) => (
                <HubTabLink
                  key={cap.key}
                  cap={cap}
                  active={active === cap.key}
                  locationSearch={locationSearch}
                  label={t(cap.labelKey)}
                />
              ))}
            </nav>
            {connectCap ? (
              <Link
                to={appendSearchToPath(connectCap.path, locationSearch)}
                style={connectBtnStyle(active === "connect")}
              >
                {t(connectCap.labelKey)}
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? 12 : 20 }}>
        <div style={hubContainerStyle}>{children}</div>
      </main>
    </div>
  );
}

function HubTabLink({
  cap,
  active,
  locationSearch,
  label,
}: {
  cap: AdsHubCapability;
  active: boolean;
  locationSearch: string;
  label: string;
}) {
  return (
    <Link
      to={appendSearchToPath(cap.path, locationSearch)}
      aria-current={active ? "page" : undefined}
      style={tabStyle(active)}
    >
      {label}
    </Link>
  );
}
