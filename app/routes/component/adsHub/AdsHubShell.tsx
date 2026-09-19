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

/**
 * 广告 hub 壳：顶栏 C（标题与分段同行）+ 四目的地同级 tab。
 * 顶栏与正文共用同一内容轴与水平 padding，白条左右缘与下方内容对齐。
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
  const pagePad = isMobile ? 12 : 20;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <TitleBar title={t("adsHub.title")} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: pagePad,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            ...hubContainerStyle,
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? 12 : 16,
          }}
        >
          <header
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              gap: isMobile ? 10 : 14,
              width: "100%",
              boxSizing: "border-box",
              padding: isMobile ? "12px 12px" : "12px 16px",
              borderRadius: pageColorTokens.radiusCard,
              border: `1px solid ${pageColorTokens.border}`,
              background: pageColorTokens.surface,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.2,
                color: pageColorTokens.textPrimary,
              }}
            >
              {t("adsHub.title")}
            </div>

            <nav
              aria-label={t("adsHub.title")}
              style={{
                display: "inline-flex",
                flexWrap: "wrap",
                alignItems: "center",
                alignSelf: isMobile ? "flex-start" : undefined,
                gap: 2,
                padding: 2,
                borderRadius: pageColorTokens.radiusControl,
                background: pageColorTokens.surfaceMuted,
              }}
            >
              {caps.map((cap) => (
                <HubTabLink
                  key={cap.key}
                  cap={cap}
                  active={active === cap.key}
                  locationSearch={locationSearch}
                  label={t(cap.labelKey)}
                />
              ))}
            </nav>
          </header>

          <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
        </div>
      </div>
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
      prefetch="intent"
      aria-current={active ? "page" : undefined}
      style={tabStyle(active)}
    >
      {label}
    </Link>
  );
}
