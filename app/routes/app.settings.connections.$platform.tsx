import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";
import { authenticate } from "../shopify.server";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import { appendEmbeddedSearchToPath } from "../lib/embeddedLocationSearch";
import {
  PageHeaderNav,
  PageSectionHeader,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
} from "./page/pageUiStyles";
import {
  buildAdsOverview,
  type AdsOverviewConnection,
  type AdsOverviewPlatform,
  type AdsOverviewReview,
} from "../server/adsInsights/overview.server";
import type { AdsHealthCheck, AdsHealthState } from "../server/adsCatalog/adsHealth.server";

type PlatformParam = "google" | "meta" | "tiktok";

const CHANNEL_CONFIG: Record<
  PlatformParam,
  {
    label: string;
    catalogPath: string;
    reviewChannel?: AdsOverviewReview["channel"];
    connectionKeys: string[];
  }
> = {
  google: {
    label: "Google",
    catalogPath: "/app/ads-catalog?tab=credentials&platform=google",
    reviewChannel: "gmc",
    connectionKeys: ["google_merchant", "google"],
  },
  meta: {
    label: "Meta",
    catalogPath: "/app/ads-catalog?tab=credentials&platform=facebook",
    reviewChannel: "meta",
    connectionKeys: ["meta_catalog", "meta_ads"],
  },
  tiktok: {
    label: "TikTok",
    catalogPath: "/app/ads-catalog?tab=credentials&platform=tiktok",
    connectionKeys: ["tiktok_catalog"],
  },
};

function isPlatformParam(value: string | undefined): value is PlatformParam {
  return value === "google" || value === "meta" || value === "tiktok";
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!isPlatformParam(params.platform)) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    platform: params.platform,
    overview: await buildAdsOverview({ shop: session.shop, rangeDays: 7 }),
  };
};

export default function AppSettingsConnectionDetail() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const embeddedSearch = useEmbeddedLocationSearch();
  const { platform, overview } = useLoaderData<typeof loader>();
  const config = CHANNEL_CONFIG[platform];
  const catalogPath = appendEmbeddedSearchToPath(config.catalogPath, embeddedSearch);
  const platformItem = overview.platforms.find((item) => item.platform === platform);

  if (!platformItem) {
    return null;
  }

  const healthChecks = overview.health.filter((item) => item.platform === platform);
  const review = config.reviewChannel
    ? overview.reviews.find((item) => item.channel === config.reviewChannel) ?? null
    : null;
  const connections = overview.connections.filter((item) => config.connectionKeys.includes(item.platform));

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("settingsShell.channelDetailTitle", { channel: config.label })}
        subtitle={t("settingsShell.channelDetailSubtitle", { channel: config.label })}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.channelOverviewTitle")}
          subtitle={t("settingsShell.channelOverviewSubtitle", { channel: config.label })}
        />
        <div style={overviewGridStyle(isMobile)}>
          <OverviewCard
            label={t("settingsShell.channelOverviewAccount")}
            value={platformItem.accountName || platformItem.accountId || t("settingsShell.platformNoAccount")}
          />
          <OverviewCard
            label={t("settingsShell.channelOverviewSnapshot")}
            value={formatSnapshotState({
              t,
              snapshot: platformItem.snapshot,
              generatedAt: overview.generatedAt,
            })}
          />
          <OverviewCard
            label={t("settingsShell.platformSpend")}
            value={platformItem.totals ? formatMoney(platformItem.totals.spend, platformItem.currencyCode) : "—"}
            hint={!platformItem.totals ? t("insights.noMetrics") : undefined}
          />
          <OverviewCard
            label={t("settingsShell.platformRoas")}
            value={platformItem.totals && platformItem.totals.roas !== null ? `${platformItem.totals.roas.toFixed(2)}x` : "—"}
            hint={!platformItem.totals ? t("insights.noMetrics") : undefined}
          />
          <OverviewCard
            label={t("settingsShell.channelOverviewStructure")}
            value={t("insights.structureCounts", {
              campaign: platformItem.entityCounts.campaign,
              adSet: platformItem.entityCounts.adSet,
              ad: platformItem.entityCounts.ad,
            })}
          />
        </div>
        <div style={actionRowStyle}>
          <Link to={catalogPath} style={linkButtonStyle(true)}>
            {t("settingsShell.manageConnection")}
          </Link>
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.integrationHealthTitle")}
          subtitle={t("settingsShell.channelHealthSubtitle", { channel: config.label })}
        />
        {healthChecks.length > 0 ? (
          <HealthChecksTable checks={healthChecks} catalogPath={catalogPath} t={t} />
        ) : (
          <SectionEmptyState message={t("settingsShell.channelHealthEmpty")} />
        )}
      </PageSurface>

      {config.reviewChannel ? (
        <PageSurface>
          <PageSectionHeader
            title={t("settingsShell.productReadinessTitle")}
            subtitle={t("insights.reviewSectionSubtitle")}
          />
          {review && review.total > 0 ? (
            <ReviewSnapshotTable review={review} t={t} language={i18n.language} />
          ) : (
            <SectionEmptyState
              message={t("insights.reviewEmpty")}
              actionLabel={t("insights.reviewOpenCatalog")}
              actionTo={catalogPath}
            />
          )}
        </PageSurface>
      ) : null}

      <PageSurface>
        <PageSectionHeader
          title={t("settingsShell.connectionSnapshotTitle")}
          subtitle={t("settingsShell.channelConnectionSubtitle", { channel: config.label })}
        />
        <div style={snapshotSummaryGridStyle(isMobile)}>
          <OverviewCard
            label={t("settingsShell.channelOverviewSnapshot")}
            value={formatSnapshotState({
              t,
              snapshot: platformItem.snapshot,
              generatedAt: overview.generatedAt,
            })}
          />
          <OverviewCard
            label={t("settingsShell.channelOverviewAccount")}
            value={platformItem.accountName || platformItem.accountId || t("settingsShell.platformNoAccount")}
          />
        </div>
        {connections.length > 0 ? (
          <ConnectionSnapshotTable connections={connections} t={t} language={i18n.language} />
        ) : (
          <SectionEmptyState message={t("settingsShell.channelConnectionEmpty")} />
        )}
      </PageSurface>
    </div>
  );
}

function OverviewCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={overviewCardStyle}>
      <div style={overviewLabelStyle}>{label}</div>
      <div style={overviewValueStyle}>{value}</div>
      {hint ? <div style={overviewHintStyle}>{hint}</div> : null}
    </div>
  );
}

function SectionEmptyState({
  message,
  actionLabel,
  actionTo,
}: {
  message: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div style={emptyStateStyle}>
      <span>{message}</span>
      {actionLabel && actionTo ? (
        <Link to={actionTo} style={emptyStateLinkStyle}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function HealthChecksTable({
  checks,
  catalogPath,
  t,
}: {
  checks: AdsHealthCheck[];
  catalogPath: string;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("insights.health.colItem")}</th>
            <th style={thStyle}>{t("insights.health.colState")}</th>
            <th style={thStyle}>{t("insights.health.colDetail")}</th>
            <th style={thStyle}>{t("insights.health.colAction")}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => {
            const action = resolveHealthAction(check, catalogPath, t);
            return (
              <tr key={check.key}>
                <td style={tdStyle}>{t(`insights.health.item.${check.key}`)}</td>
                <td style={tdStyle}>
                  <span style={healthStatePillStyle(check.state)}>{t(`insights.health.state.${check.state}`)}</span>
                </td>
                <td style={tdMetaStyle}>
                  {t(`insights.health.detail.${check.detailCode}`)}
                  {check.reference ? ` · ${check.reference}` : ""}
                </td>
                <td style={tdMetaStyle}>
                  {action?.href ? (
                    <Link to={action.href} style={tableActionLinkStyle}>
                      {action.label}
                    </Link>
                  ) : action ? (
                    <span style={tableActionTextStyle}>{action.label}</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function resolveHealthAction(
  check: AdsHealthCheck,
  catalogPath: string,
  t: ReturnType<typeof useTranslation>["t"],
): { label: string; href?: string } | null {
  if (check.state === "ok") return null;

  if (check.detailCode === "missingDataSource") {
    return {
      label: t("insights.health.openCatalog"),
      href: catalogPath,
    };
  }

  return {
    label: t("insights.health.manageInConnections"),
  };
}

function ReviewSnapshotTable({
  review,
  t,
  language,
}: {
  review: AdsOverviewReview;
  t: ReturnType<typeof useTranslation>["t"];
  language: string;
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("insights.reviewChannel")}</th>
            <th style={thNumericStyle}>{t("insights.reviewTotal")}</th>
            <th style={thNumericStyle}>{t("insights.reviewApproved")}</th>
            <th style={thNumericStyle}>{t("insights.reviewPending")}</th>
            <th style={thNumericStyle}>{t("insights.reviewDisapproved")}</th>
            <th style={thStyle}>{t("insights.reviewLastChecked")}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle}>
              {review.channel === "gmc" ? t("insights.reviewChannelGmc") : t("insights.reviewChannelMeta")}
            </td>
            <td style={tdNumericStyle}>{formatInteger(review.total)}</td>
            <td style={tdNumericStyle}>{formatInteger(review.approved)}</td>
            <td style={tdNumericStyle}>{formatInteger(review.pending)}</td>
            <td style={tdNumericStyle}>{formatInteger(review.disapproved)}</td>
            <td style={tdMetaStyle}>{formatTimestamp(review.lastCheckedAt, language) ?? t("insights.reviewNever")}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ConnectionSnapshotTable({
  connections,
  t,
  language,
}: {
  connections: AdsOverviewConnection[];
  t: ReturnType<typeof useTranslation>["t"];
  language: string;
}) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t("insights.connectionPlatform")}</th>
            <th style={thStyle}>{t("insights.connectionStatus")}</th>
            <th style={thStyle}>{t("insights.connectionAccount")}</th>
            <th style={thStyle}>{t("insights.connectionUpdatedAt")}</th>
          </tr>
        </thead>
        <tbody>
          {connections.map((connection) => (
            <tr key={connection.platform}>
              <td style={tdStyle}>{renderConnectionLabel(connection.platform, t)}</td>
              <td style={tdStyle}>
                {connection.connected ? t("settingsShell.statusConnected") : t("settingsShell.statusNeedsSetup")}
              </td>
              <td style={tdMetaStyle}>{connection.externalAccountId ?? "—"}</td>
              <td style={tdMetaStyle}>{formatTimestamp(connection.updatedAt, language) ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderConnectionLabel(platform: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (platform === "google_merchant") return t("settingsShell.googleCapabilityMerchant");
  if (platform === "google") return t("settingsShell.googleCapabilityAds");
  if (platform === "meta_catalog") return t("settingsShell.metaCapabilityCatalog");
  if (platform === "meta_ads") return t("settingsShell.metaCapabilityAds");
  if (platform === "tiktok_catalog") return t("settingsShell.tiktokCapabilityCatalog");
  return platform;
}

function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number, currency: string | null): string {
  const amount = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return currency ? `${currency} ${amount}` : amount;
}

function formatTimestamp(iso: string | null, language: string): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesSince(iso: string, baseIso: string): number {
  return Math.max(0, Math.round((Date.parse(baseIso) - Date.parse(iso)) / 60000));
}

function formatSnapshotState(params: {
  t: ReturnType<typeof useTranslation>["t"];
  snapshot: AdsOverviewPlatform["snapshot"];
  generatedAt: string;
}): string {
  const { t, snapshot, generatedAt } = params;
  if (!snapshot) return t("settingsShell.snapshotNone");
  if (snapshot.stale) return t("settingsShell.snapshotStale");
  return t("settingsShell.snapshotFresh", {
    minutes: minutesSince(snapshot.fetchedAt, generatedAt),
  });
}

const overviewGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const snapshotSummaryGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
  gap: "0.75rem",
  marginBottom: "0.85rem",
});

const overviewCardStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceMuted,
  padding: "0.9rem 1rem",
  display: "grid",
  gap: "0.3rem",
};

const overviewLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: pageColorTokens.textSecondary,
};

const overviewValueStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  lineHeight: 1.45,
};

const overviewHintStyle: CSSProperties = {
  fontSize: "0.76rem",
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.55rem",
  marginTop: "0.85rem",
};

const linkButtonStyle = (primary: boolean): CSSProperties => ({
  padding: "0.52rem 0.85rem",
  borderRadius: 999,
  border: `1px solid ${primary ? pageColorTokens.brandBlue : pageColorTokens.borderSubtle}`,
  background: primary ? pageColorTokens.brandBlueLight : pageColorTokens.surface,
  color: primary ? pageColorTokens.brandBlueDark : pageColorTokens.textPrimary,
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
});

const emptyStateStyle: CSSProperties = {
  padding: "0.85rem 0.95rem",
  borderRadius: 12,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: 12,
  display: "grid",
  gap: "0.55rem",
};

const emptyStateLinkStyle: CSSProperties = {
  color: pageColorTokens.brandBlueDark,
  fontWeight: 700,
  textDecoration: "none",
};

const tableActionLinkStyle: CSSProperties = {
  color: pageColorTokens.brandBlueDark,
  fontWeight: 700,
  textDecoration: "none",
};

const tableActionTextStyle: CSSProperties = {
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const healthStateTokens: Record<AdsHealthState, { color: string; background: string; border: string }> = {
  ok: {
    color: pageColorTokens.brandGreenDark,
    background: pageColorTokens.brandGreenLight,
    border: "rgba(0, 166, 124, 0.28)",
  },
  warning: {
    color: "#8a5a00",
    background: "#fff7e0",
    border: "rgba(185, 137, 0, 0.3)",
  },
  missing: {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  },
  unknown: {
    color: pageColorTokens.textSecondary,
    background: pageColorTokens.surfaceMuted,
    border: pageColorTokens.borderSubtle,
  },
};

const healthStatePillStyle = (state: AdsHealthState): CSSProperties => {
  const token = healthStateTokens[state];
  return {
    display: "inline-block",
    padding: "0.12rem 0.45rem",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
    color: token.color,
    background: token.background,
    border: `1px solid ${token.border}`,
  };
};

const tableWrapStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.85rem",
  fontSize: 11,
  fontWeight: 750,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  whiteSpace: "nowrap",
};

const thNumericStyle: CSSProperties = { ...thStyle, textAlign: "right" };

const tdStyle: CSSProperties = {
  padding: "0.6rem 0.85rem",
  color: pageColorTokens.textBody,
  borderBottom: `1px solid ${pageColorTokens.divider}`,
};

const tdNumericStyle: CSSProperties = { ...tdStyle, textAlign: "right" };

const tdMetaStyle: CSSProperties = {
  ...tdStyle,
  color: pageColorTokens.textSecondary,
  fontSize: 12,
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
