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
import type { Ga4SettingsLoaderData } from "../app.settings.google-analytics";
import { Ga4PerformanceView } from "./Ga4PerformanceView";

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

export function GoogleAnalyticsPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const [searchParams] = useSearchParams();
  const locationSearch = useEmbeddedLocationSearch();
  const returnTo = searchParams.get("returnTo")?.trim() || undefined;
  const loaderData = useLoaderData<Ga4SettingsLoaderData>();

  const connected = loaderData.connected;
  const hasPending = loaderData.hasPending;
  const properties = loaderData.properties;
  const pendingProperties = loaderData.pendingProperties;
  const selectorProperties =
    loaderData.allProperties.length > 0 ? loaderData.allProperties : properties;
  const overviewStatus = connected
    ? t("settingsShell.statusConnected")
    : hasPending
      ? t("settingsShell.statusPending")
      : t("settingsShell.statusNeedsSetup");
  const overviewPropertyCount = connected ? properties.length : pendingProperties.length;
  const overviewAccountCount = new Set(
    (connected ? selectorProperties : pendingProperties)
      .map((property) => property.accountName || property.accountId || "")
      .filter(Boolean),
  ).size;
  const activeProperty = properties[0] ?? null;
  const connectionTone = connected ? "connected" : hasPending ? "pending" : "inactive";
  const overviewFooter = connected && activeProperty
    ? t("ga4.overviewCurrentProperty", { propertyName: activeProperty.propertyName })
    : hasPending
      ? t("ga4.overviewPendingHint", { count: pendingProperties.length })
      : t("ga4.overviewNeedsSetupHint");
  const connectPath = buildAdsHubConnectPath("google", locationSearch);

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("ga4.title")}
        subtitle={t("ga4.subtitle")}
        backLabel={returnTo ? "返回上一级" : t("settingsShell.back")}
        fallbackPath={returnTo ?? "/app/settings"}
        returnTo={returnTo}
      />

      <PageSurface>
        <PageSectionHeader
          title={t("ga4.overviewTitle")}
          subtitle={t("ga4.overviewSubtitle")}
        />
        <PageMetricCard
          metrics={[
            { label: t("ga4.overviewStatus"), value: overviewStatus },
            { label: t("ga4.overviewProperties"), value: String(overviewPropertyCount) },
            { label: t("ga4.overviewAccounts"), value: String(overviewAccountCount) },
          ]}
          footer={<span style={{ fontSize: "0.82rem", color: pageColorTokens.textSecondary }}>{overviewFooter}</span>}
        />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("ga4.connectionSectionTitle")}
          subtitle={t("ga4.connectionSectionSubtitle")}
          badge={<ConnectionStatusBadge label={overviewStatus} tone={connectionTone} />}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <p style={{ margin: 0, fontSize: "0.875rem", color: pageColorTokens.textSecondary }}>
            {t("ga4.manageInAdsConnectHint")}
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
              {t("ga4.manageInAdsConnect")}
            </Link>
          </div>
        </div>
      </PageSurface>

      {connected && activeProperty ? (
        <PageSurface>
          <PageSectionHeader
            title={t("ga4.performanceSectionTitle")}
            subtitle={t("ga4.performanceSectionSubtitle")}
          />
          <Ga4PerformanceView propertyId={activeProperty.propertyId} />
        </PageSurface>
      ) : null}
    </div>
  );
}
