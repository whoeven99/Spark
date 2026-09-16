import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEmbeddedLocationSearch } from "../../../hooks/useEmbeddedLocationSearch";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import {
  ADS_HUB_GROUP_ORDER,
  isAdsHubBarePath,
  listVisibleAdsHubCapabilities,
  resolveActiveAdsHubCap,
  type AdsHubCapGroup,
  type AdsHubCapability,
} from "../../../lib/adsHubNav";
import { pageColorTokens } from "../../page/pageUiStyles";

const GROUP_LABEL_KEY: Record<AdsHubCapGroup, string> = {
  insights: "adsHub.group.insights",
  connect: "adsHub.group.connect",
  campaigns: "adsHub.group.campaigns",
  dev: "adsHub.group.dev",
};

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

function NavLinkItem({
  cap,
  active,
  locationSearch,
}: {
  cap: AdsHubCapability;
  active: boolean;
  locationSearch: string;
}) {
  const { t } = useTranslation();
  const href = appendSearchToPath(cap.path, locationSearch);
  return (
    <Link
      to={href}
      style={{
        display: "block",
        padding: "8px 10px",
        borderRadius: pageColorTokens.radiusControl,
        textDecoration: "none",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textBody,
        background: active ? pageColorTokens.brandGreenLight : "transparent",
      }}
    >
      {t(cap.labelKey)}
    </Link>
  );
}

export function AdsHubShell({
  children,
  showReviewHidden = false,
  isProduction = true,
}: {
  children: ReactNode;
  showReviewHidden?: boolean;
  isProduction?: boolean;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const locationSearch = useEmbeddedLocationSearch();
  const { isMobile } = useResponsiveLayout();
  const bare = isAdsHubBarePath(location.pathname);

  if (bare) {
    return <>{children}</>;
  }

  const caps = listVisibleAdsHubCapabilities({ showReviewHidden, isProduction });
  const active = resolveActiveAdsHubCap(location.pathname, location.search);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <TitleBar title={t("adsHub.title")} />
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "stretch",
          gap: 0,
          flex: 1,
          minHeight: 0,
        }}
      >
        <aside
          style={{
            width: isMobile ? "100%" : 200,
            flexShrink: 0,
            borderRight: isMobile ? "none" : `1px solid ${pageColorTokens.border}`,
            borderBottom: isMobile ? `1px solid ${pageColorTokens.border}` : "none",
            padding: isMobile ? "12px 16px" : "20px 12px",
            background: pageColorTokens.surfaceMuted,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            overflowX: isMobile ? "auto" : undefined,
          }}
        >
          <div style={{ padding: "0 4px" }}>
            <div
              style={{
                fontSize: 16,
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
          {ADS_HUB_GROUP_ORDER.map((group) => {
            const items = caps.filter((c) => c.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    padding: "0 10px",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                    color: pageColorTokens.textFootnote,
                  }}
                >
                  {t(GROUP_LABEL_KEY[group])}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: isMobile ? "row" : "column",
                    flexWrap: isMobile ? "wrap" : undefined,
                    gap: 2,
                  }}
                >
                  {items.map((cap) => (
                    <NavLinkItem
                      key={cap.key}
                      cap={cap}
                      active={active === cap.key}
                      locationSearch={locationSearch}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </aside>
        <main style={{ flex: 1, minWidth: 0, padding: isMobile ? 12 : 20 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
