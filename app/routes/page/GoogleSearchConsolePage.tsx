import { Link, useLoaderData, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { buildAdsHubConnectPath } from "../../lib/adsHubNav";
import {
  PageHeaderNav,
  PageMetricCard,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./pageUiStyles";
import type { GscSettingsLoaderData } from "../app.settings.google-search-console";
import { GscPerformanceView } from "./GscPerformanceView";

function ConnectionStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "connected" | "pending" | "inactive";
}) {
  const toneStyle =
    tone === "connected"
      ? {
          color: pageColorTokens.brandGreenDeep,
          background: pageColorTokens.brandGreenLight,
          borderColor: pageColorTokens.brandGreenGlow,
        }
      : tone === "pending"
        ? {
            color: pageColorTokens.warning,
            background: pageColorTokens.warningBg,
            borderColor: "rgba(185, 137, 0, 0.18)",
          }
        : {
            color: pageColorTokens.textSecondary,
            background: pageColorTokens.surfaceMuted,
            borderColor: pageColorTokens.border,
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.3rem 0.75rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: 700,
        border: `1px solid ${toneStyle.borderColor}`,
        color: toneStyle.color,
        background: toneStyle.background,
      }}
    >
      {label}
    </span>
  );
}

export function GoogleSearchConsolePage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [searchParams] = useSearchParams();
  const locationSearch = useEmbeddedLocationSearch();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const loaderData = useLoaderData<GscSettingsLoaderData>();

  const connected = loaderData.connected;
  const hasPending = loaderData.hasPending;
  const siteUrl = loaderData.siteUrl;
  const pendingSites = loaderData.pendingSites;
  const overviewStatus = connected
    ? t("settingsShell.statusConnected")
    : hasPending
      ? t("settingsShell.statusPending")
      : t("settingsShell.statusNeedsSetup");
  const connectionTone = connected ? "connected" : hasPending ? "pending" : "inactive";
  const overviewFooter = connected && siteUrl
    ? t("gsc.overviewCurrentSite", { siteUrl })
    : hasPending
      ? t("gsc.overviewPendingHint", { count: pendingSites.length })
      : t("gsc.overviewNeedsSetupHint");
  const connectPath = buildAdsHubConnectPath("google", locationSearch);

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("gsc.title")}
        subtitle={t("gsc.subtitle")}
        backLabel={returnTo ? "返回上一级" : t("settingsShell.back")}
        fallbackPath={returnTo ?? "/app/settings"}
        returnTo={returnTo}
      />

      <PageSurface>
        <PageSectionHeader
          title={t("gsc.overviewTitle")}
          subtitle={t("gsc.overviewSubtitle")}
        />
        <PageMetricCard
          metrics={[
            { label: t("gsc.overviewStatus"), value: overviewStatus },
            { label: t("gsc.overviewSites"), value: connected ? "1" : "0" },
            { label: t("gsc.overviewPending"), value: String(hasPending ? pendingSites.length : 0) },
          ]}
          footer={<span style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary }}>{overviewFooter}</span>}
        />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("gsc.connectionSectionTitle")}
          subtitle={t("gsc.connectionSectionSubtitle")}
          badge={<ConnectionStatusBadge label={overviewStatus} tone={connectionTone} />}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>
            {t("gsc.manageInAdsConnectHint")}
          </p>
          <div>
            <Link
              to={connectPath}
              style={{
                display: "inline-block",
                padding: "10px 16px",
                borderRadius: 8,
                background: pageColorTokens.brandGreen,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {t("gsc.manageInAdsConnect")}
            </Link>
          </div>
        </div>
      </PageSurface>

      {connected && siteUrl ? (
        <PageSurface>
          <PageSectionHeader
            title={t("gsc.performanceSectionTitle")}
            subtitle={t("gsc.performanceSectionSubtitle")}
          />
          <GscPerformanceView />
        </PageSurface>
      ) : null}
    </div>
  );
}
