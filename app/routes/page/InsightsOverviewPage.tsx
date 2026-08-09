/**
 * 洞察 › 总览 UI。
 *
 * 布局：区间工具条 → 合并 KPI → 平台明细卡 → 商品审核 → 连接与凭证。
 * 全页只读：任何写操作都通过链接跳回 Ads Catalog / 投放明细，不在这里发起。
 */
import type { CSSProperties } from "react";
import { useLoaderData, useLocation, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageEmptyStateStyle,
  pageHintTextStyle,
  pageMetricCardStyle,
  pageMetricLabelStyle,
  pageMetricTileStyle,
  pageMetricValueStyle,
  PageSectionHeader,
} from "./pageUiStyles";
import { DestinationFilterBar, destinationSurfaceStyle } from "../component/shared/DestinationPage";
import type {
  AdsOverviewConnection,
  AdsOverviewPlatform,
  AdsOverviewReview,
  AdsOverviewSnapshot,
} from "../../server/adsInsights/overview.server";
import type { InsightsOverviewLoaderData } from "../app.insights._index";

const PLATFORM_LABEL: Record<AdsOverviewPlatform["platform"], string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

const RANGE_OPTIONS = [7, 14, 30] as const;

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

function formatRatio(value: number | null, suffix: string): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}${suffix}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

/** 以服务端 generatedAt 为基准算相对时间，避免 SSR / CSR 水合不一致。 */
function minutesSince(iso: string, baseIso: string): number {
  return Math.max(0, Math.round((Date.parse(baseIso) - Date.parse(iso)) / 60000));
}

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return iso.replace("T", " ").slice(0, 16);
}

export function InsightsOverviewPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const { overview, failed } = useLoaderData<InsightsOverviewLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const location = useLocation();
  const navigate = useNavigate();

  const rangeDays = overview?.rangeDays ?? 7;
  const refreshing = revalidator.state !== "idle";

  const handleRangeChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", next);
    setSearchParams(params, { preventScrollReset: true });
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("insights.title")}
        subtitle={t("insights.subtitle")}
        backLabel={t("insights.back")}
        fallbackPath="/app"
      />

      <div style={toolbarStyle(isMobile)}>
        <DestinationFilterBar
          label={t("insights.rangeLabel")}
          items={RANGE_OPTIONS.map((days) => ({
            key: String(days),
            label: t("insights.rangeDays", { count: days }),
          }))}
          active={String(rangeDays)}
          onChange={handleRangeChange}
        />
        <div style={toolbarSideStyle}>
          {overview ? (
            <span style={pageHintTextStyle}>
              {t("insights.windowHint", {
                start: overview.dateStart,
                end: overview.dateEnd,
              })}
            </span>
          ) : null}
          <button
            type="button"
            style={refreshButtonStyle(refreshing)}
            disabled={refreshing}
            onClick={() => revalidator.revalidate()}
          >
            {refreshing ? t("insights.refreshing") : t("insights.refresh")}
          </button>
        </div>
      </div>

      {failed ? (
        <div style={errorBoxStyle}>{t("insights.loadFailed")}</div>
      ) : null}

      {overview ? (
        <OverviewBody
          overview={overview}
          isMobile={isMobile}
          onOpenPerformance={(platform) =>
            navigate(buildPerformanceHref(platform, rangeDays, location.search))
          }
          onOpenCatalog={() => navigate(`/app/ads-catalog${location.search}`)}
        />
      ) : null}
    </div>
  );
}

function buildPerformanceHref(
  platform: AdsOverviewPlatform["platform"],
  rangeDays: number,
  search: string,
): string {
  const params = new URLSearchParams(search);
  params.set("platform", platform);
  params.set("range", String(rangeDays));
  params.delete("sandbox");
  return `/app/insights/performance?${params.toString()}`;
}

function OverviewBody({
  overview,
  isMobile,
  onOpenPerformance,
  onOpenCatalog,
}: {
  overview: AdsOverviewSnapshot;
  isMobile: boolean;
  onOpenPerformance: (platform: AdsOverviewPlatform["platform"]) => void;
  onOpenCatalog: () => void;
}) {
  const { t } = useTranslation();
  const anyConnected = overview.platforms.some((item) => item.connected);

  if (!anyConnected) {
    return (
      <div style={pageEmptyStateStyle}>
        <strong style={{ fontSize: "1rem", color: pageColorTokens.textPrimary }}>
          {t("insights.emptyTitle")}
        </strong>
        <span>{t("insights.emptyBody")}</span>
        <button type="button" style={primaryButtonStyle} onClick={onOpenCatalog}>
          {t("insights.emptyCta")}
        </button>
      </div>
    );
  }

  return (
    <>
      <section>
        <PageSectionHeader
          title={t("insights.kpiSectionTitle")}
          subtitle={
            overview.mixedCurrency
              ? t("insights.mixedCurrencyHint")
              : t("insights.kpiSectionSubtitle")
          }
        />
        <div style={metricGridStyle(isMobile)}>
          <MetricTile
            label={t("insights.kpiSpend")}
            value={formatMoney(overview.totals.spend, overview.currencyCode)}
          />
          <MetricTile
            label={t("insights.kpiValue")}
            value={formatMoney(overview.totals.conversionsValue, overview.currencyCode)}
          />
          <MetricTile
            label={t("insights.kpiRoas")}
            value={formatRatio(overview.totals.roas, "x")}
          />
          <MetricTile
            label={t("insights.kpiConversions")}
            value={formatInteger(overview.totals.conversions)}
          />
        </div>
      </section>

      <section>
        <PageSectionHeader
          title={t("insights.platformSectionTitle")}
          subtitle={t("insights.platformSectionSubtitle")}
        />
        <div style={platformGridStyle(isMobile)}>
          {overview.platforms.map((item) => (
            <PlatformCard
              key={item.platform}
              item={item}
              generatedAt={overview.generatedAt}
              onOpenPerformance={() => onOpenPerformance(item.platform)}
              onOpenCatalog={onOpenCatalog}
            />
          ))}
        </div>
      </section>

      <section>
        <PageSectionHeader
          title={t("insights.reviewSectionTitle")}
          subtitle={t("insights.reviewSectionSubtitle")}
        />
        <ReviewTable reviews={overview.reviews} />
      </section>

      <section>
        <PageSectionHeader
          title={t("insights.connectionSectionTitle")}
          subtitle={t("insights.connectionSectionSubtitle")}
        />
        <ConnectionTable connections={overview.connections} onOpenCatalog={onOpenCatalog} />
      </section>
    </>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={pageMetricCardStyle}>
      <div style={pageMetricTileStyle}>
        <p style={pageMetricLabelStyle}>{label}</p>
        <p style={pageMetricValueStyle}>{value}</p>
      </div>
    </div>
  );
}

function PlatformCard({
  item,
  generatedAt,
  onOpenPerformance,
  onOpenCatalog,
}: {
  item: AdsOverviewPlatform;
  generatedAt: string;
  onOpenPerformance: () => void;
  onOpenCatalog: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={{ ...destinationSurfaceStyle, padding: "1rem", display: "grid", gap: "0.7rem" }}>
      <div style={cardHeadStyle}>
        <span style={cardTitleStyle}>{PLATFORM_LABEL[item.platform]}</span>
        <span style={statusPillStyle(item.connected)}>
          {item.connected ? t("insights.connected") : t("insights.notConnected")}
        </span>
      </div>

      {item.connected ? (
        <>
          <span style={cardMetaStyle}>{item.accountName || item.accountId || "—"}</span>
          {item.totals ? (
            <dl style={cardMetricListStyle}>
              <CardMetric
                label={t("insights.metricSpend")}
                value={formatMoney(item.totals.spend, item.currencyCode)}
              />
              <CardMetric
                label={t("insights.metricRoas")}
                value={formatRatio(item.totals.roas, "x")}
              />
              <CardMetric
                label={t("insights.metricConversions")}
                value={formatInteger(item.totals.conversions)}
              />
              <CardMetric
                label={t("insights.metricCtr")}
                value={formatPercent(item.totals.ctr)}
              />
            </dl>
          ) : (
            <span style={cardMetaStyle}>{t("insights.noMetrics")}</span>
          )}
          <span style={cardFootnoteStyle}>
            {t("insights.structureCounts", {
              campaign: item.entityCounts.campaign,
              adSet: item.entityCounts.adSet,
              ad: item.entityCounts.ad,
            })}
          </span>
          <span style={cardFootnoteStyle}>
            {item.snapshot
              ? item.snapshot.stale
                ? t("insights.snapshotStale")
                : t("insights.snapshotFresh", {
                    minutes: minutesSince(item.snapshot.fetchedAt, generatedAt),
                  })
              : t("insights.snapshotNone")}
          </span>
          <button type="button" style={secondaryButtonStyle} onClick={onOpenPerformance}>
            {t("insights.openPerformance")}
          </button>
        </>
      ) : (
        <>
          <span style={cardMetaStyle}>{t("insights.notConnectedHint")}</span>
          <button type="button" style={secondaryButtonStyle} onClick={onOpenCatalog}>
            {t("insights.connectCta")}
          </button>
        </>
      )}
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: "0.15rem" }}>
      <dt style={cardMetricLabelStyle}>{label}</dt>
      <dd style={cardMetricValueStyle}>{value}</dd>
    </div>
  );
}

function ReviewTable({ reviews }: { reviews: AdsOverviewReview[] }) {
  const { t } = useTranslation();
  const hasData = reviews.some((review) => review.total > 0);

  if (!hasData) {
    return <p style={pageHintTextStyle}>{t("insights.reviewEmpty")}</p>;
  }

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
          {reviews.map((review) => (
            <tr key={review.channel}>
              <td style={tdStyle}>
                {review.channel === "gmc"
                  ? t("insights.reviewChannelGmc")
                  : t("insights.reviewChannelMeta")}
              </td>
              <td style={tdNumericStyle}>{formatInteger(review.total)}</td>
              <td style={tdNumericStyle}>{formatInteger(review.approved)}</td>
              <td style={tdNumericStyle}>{formatInteger(review.pending)}</td>
              <td
                style={{
                  ...tdNumericStyle,
                  color: review.disapproved > 0 ? pageColorTokens.critical : undefined,
                  fontWeight: review.disapproved > 0 ? 700 : undefined,
                }}
              >
                {formatInteger(review.disapproved)}
              </td>
              <td style={tdMetaStyle}>
                {formatTimestamp(review.lastCheckedAt) ?? t("insights.reviewNever")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConnectionTable({
  connections,
  onOpenCatalog,
}: {
  connections: AdsOverviewConnection[];
  onOpenCatalog: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
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
                <td style={tdMonoStyle}>{connection.platform}</td>
                <td style={tdStyle}>
                  {connection.connected ? t("insights.connected") : t("insights.notConnected")}
                </td>
                <td style={tdMetaStyle}>{connection.externalAccountId ?? "—"}</td>
                <td style={tdMetaStyle}>{formatTimestamp(connection.updatedAt) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" style={secondaryButtonStyle} onClick={onOpenCatalog}>
        {t("insights.manageConnections")}
      </button>
    </div>
  );
}

const toolbarStyle = (isMobile: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: isMobile ? "column" : "row",
  alignItems: isMobile ? "stretch" : "flex-end",
  justifyContent: "space-between",
  gap: "0.75rem",
});

const toolbarSideStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
  flexWrap: "wrap",
};

const metricGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
  gap: "0.75rem",
});

const platformGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const cardHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const cardTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 750,
  color: pageColorTokens.textPrimary,
};

const cardMetaStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
  wordBreak: "break-all",
};

const cardFootnoteStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textFootnote,
};

const cardMetricListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "0.6rem",
  margin: 0,
};

const cardMetricLabelStyle: CSSProperties = {
  fontSize: 11,
  color: pageColorTokens.textSecondary,
};

const cardMetricValueStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const statusPillStyle = (connected: boolean): CSSProperties => ({
  flexShrink: 0,
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color: connected ? pageColorTokens.brandGreenDark : pageColorTokens.textSecondary,
  background: connected ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceMuted,
  border: `1px solid ${connected ? "rgba(0, 166, 124, 0.28)" : pageColorTokens.borderSubtle}`,
});

const tableWrapStyle: CSSProperties = {
  ...destinationSurfaceStyle,
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

const tdMonoStyle: CSSProperties = {
  ...tdStyle,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};

const refreshButtonStyle = (disabled: boolean): CSSProperties => ({
  padding: "0.45rem 0.85rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
  color: disabled ? pageColorTokens.textSecondary : pageColorTokens.textBody,
  fontSize: 12,
  fontWeight: 700,
  cursor: disabled ? "default" : "pointer",
  fontFamily: "inherit",
});

const secondaryButtonStyle: CSSProperties = {
  justifySelf: "start",
  padding: "0.4rem 0.75rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.borderInput}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textBody,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const primaryButtonStyle: CSSProperties = {
  padding: "0.5rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "none",
  background: pageColorTokens.brandGreen,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const errorBoxStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: "1px solid rgba(220, 38, 38, 0.2)",
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  fontSize: 13,
};
