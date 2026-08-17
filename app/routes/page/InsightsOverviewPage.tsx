/**
 * 洞察 › 总览 UI。
 *
 * 布局：区间工具条 → 合并 KPI → 平台明细卡 → 商品审核 → 连接与凭证。
 * 全页只读：任何写操作都通过链接跳回 Ads Catalog / 投放明细，不在这里发起。
 */
import { useEffect, type CSSProperties } from "react";
import {
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  analysisPageContentStyle,
  PageHeaderNav,
  PageMetricCard,
  PageSurface,
  mobilePageContentStyle,
  pageColorTokens,
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
import type { AdsHealthCheck, AdsHealthState } from "../../server/adsCatalog/adsHealth.server";
import type { GoogleAttributionOverviewResponse } from "../api.google-attribution.overview";
import type { InsightsOverviewLoaderData } from "../app.insights._index";

const PLATFORM_LABEL: Record<AdsOverviewPlatform["platform"], string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

const RANGE_OPTIONS = [7, 14, 30] as const;
type TemplateStatus = "strong" | "watch" | "weak";
type TemplateModule = {
  key: string;
  title: string;
  summary: string;
  benchmark: string;
  evidence: string[];
  suggestion: string;
  status: TemplateStatus;
};
type NarrativeCard = {
  title: string;
  body: string;
};

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

function countAttentionIssues(checks: AdsHealthCheck[]): number {
  return checks.filter((check) => check.state !== "ok").length;
}

function statusPriority(status: TemplateStatus): number {
  if (status === "weak") return 2;
  if (status === "watch") return 1;
  return 0;
}

function resolveOverallStatus(modules: TemplateModule[]): TemplateStatus {
  const max = modules.reduce((current, module) => Math.max(current, statusPriority(module.status)), 0);
  return max === 2 ? "weak" : max === 1 ? "watch" : "strong";
}

export function InsightsOverviewPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const { overview, failed } = useLoaderData<InsightsOverviewLoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const location = useLocation();
  const navigate = useNavigate();
  const attributionFetcher = useFetcher<GoogleAttributionOverviewResponse>();

  const rangeDays = overview?.rangeDays ?? 7;
  const refreshing = revalidator.state !== "idle";

  useEffect(() => {
    if (!overview) return;
    attributionFetcher.load(`/api/google-attribution/overview?range=${rangeDays}`);
    // fetcher identity is stable enough here; we only want to react to overview/range changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, rangeDays]);

  const handleRangeChange = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("range", next);
    setSearchParams(params, { preventScrollReset: true });
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : analysisPageContentStyle}>
      <PageHeaderNav
        titleBarTitle={t("nav.insights")}
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
          attributionData={attributionFetcher.data}
          attributionLoading={attributionFetcher.state !== "idle"}
          onOpenPerformance={(platform) =>
            navigate(buildPerformanceHref(platform, rangeDays, location.search))
          }
          onOpenCatalog={() => navigate(`/app/ads-catalog${location.search}`)}
          onOpenCatalogTasks={() => navigate(buildCatalogTasksHref(location.search))}
          onOpenSettings={() => navigate("/app/settings")}
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

function buildCatalogTasksHref(search: string): string {
  const params = new URLSearchParams(search);
  params.set("tab", "tasks");
  params.delete("taskId");
  const query = params.toString();
  return `/app/ads-catalog${query ? `?${query}` : ""}`;
}

function OverviewBody({
  overview,
  isMobile,
  attributionData,
  attributionLoading,
  onOpenPerformance,
  onOpenCatalog,
  onOpenCatalogTasks,
  onOpenSettings,
}: {
  overview: AdsOverviewSnapshot;
  isMobile: boolean;
  attributionData: GoogleAttributionOverviewResponse | undefined;
  attributionLoading: boolean;
  onOpenPerformance: (platform: AdsOverviewPlatform["platform"]) => void;
  onOpenCatalog: () => void;
  onOpenCatalogTasks: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const anyConnected = overview.platforms.some((item) => item.connected);
  const connectedCount = overview.platforms.filter((item) => item.connected).length;
  const attentionCount = countAttentionIssues(overview.health);
  const disapprovedTotal = overview.reviews.reduce((sum, review) => sum + review.disapproved, 0);
  const reviewedTotal = overview.reviews.reduce((sum, review) => sum + review.total, 0);
  const freshSnapshotCount = overview.platforms.filter(
    (item) => item.connected && item.snapshot && !item.snapshot.stale,
  ).length;
  const readyConnections = overview.connections.filter((item) => item.connected).length;
  const attributionOk = attributionData && attributionData.ok ? attributionData : null;
  const linkedCampaignShare =
    attributionOk && attributionOk.campaigns.length > 0
      ? (attributionOk.campaigns.filter((item) => item.matchQuality === "linked").length /
          attributionOk.campaigns.length) *
        100
      : null;
  const disapprovedRate = reviewedTotal > 0 ? (disapprovedTotal / reviewedTotal) * 100 : null;
  const templateModules: TemplateModule[] = [
    buildEfficiencyModule({
      t,
      roas: overview.totals.roas,
      conversions: overview.totals.conversions,
      spend: overview.totals.spend,
      value: overview.totals.conversionsValue,
      currencyCode: overview.currencyCode,
    }),
    buildCoverageModule({
      t,
      connectedCount,
      totalPlatforms: overview.platforms.length,
      freshSnapshotCount,
      attentionCount,
      readyConnections,
      totalConnections: overview.connections.length,
    }),
    buildReadinessModule({
      t,
      disapprovedTotal,
      disapprovedRate,
      attentionCount,
      reviewedTotal,
    }),
    buildAttributionModule({
      t,
      attributionData,
      attributionLoading,
      linkedCampaignShare,
    }),
  ];
  const overallTemplateStatus = resolveOverallStatus(templateModules);
  const recommendationModules = templateModules.filter((module) => module.status !== "strong");
  const primaryFocusModule =
    recommendationModules[0] ?? templateModules.find((module) => module.key === "efficiency") ?? templateModules[0];
  const narrativeCards = buildNarrativeCards({
    t,
    roas: overview.totals.roas,
    conversions: overview.totals.conversions,
    connectedCount,
    totalPlatforms: overview.platforms.length,
    attributionData,
    attributionLoading,
    linkedCampaignShare,
    focusModule: primaryFocusModule,
  });
  const overviewFooter = [
    t("insights.overviewFooterWindow", {
      start: overview.dateStart,
      end: overview.dateEnd,
    }),
    t("insights.overviewFooterGenerated", {
      time: formatTimestamp(overview.generatedAt) ?? overview.generatedAt,
    }),
    overview.mixedCurrency ? t("insights.mixedCurrencyHint") : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
      <PageSurface>
        <PageSectionHeader
          title={t("insights.overviewTitle")}
          subtitle={t("insights.overviewSubtitle")}
          badge={
            <span style={summaryBadgeStyle(attentionCount > 0)}>
              {attentionCount > 0
                ? t("insights.overviewAttentionBadge", { count: attentionCount })
                : t("insights.overviewHealthyBadge")}
            </span>
          }
        />
        <PageMetricCard
          metrics={[
            {
              label: t("insights.overviewConnectedPlatforms"),
              value: t("insights.overviewConnectedPlatformsValue", {
                connected: connectedCount,
                total: overview.platforms.length,
              }),
            },
            {
              label: t("insights.overviewAttention"),
              value: String(attentionCount),
            },
            {
              label: t("insights.overviewDisapproved"),
              value: formatInteger(disapprovedTotal),
            },
            {
              label: t("insights.overviewSnapshots"),
              value: t("insights.overviewSnapshotsValue", {
                ready: freshSnapshotCount,
                total: connectedCount,
              }),
            },
          ]}
          footer={<span style={pageHintTextStyle}>{overviewFooter}</span>}
        />
      </PageSurface>

      <PageSurface>
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
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("insights.templateSectionTitle")}
          subtitle={t("insights.templateSectionSubtitle")}
          badge={
            <span style={summaryBadgeStyle(overallTemplateStatus !== "strong")}>
              {t(`insights.templateStatus.${overallTemplateStatus}`)}
            </span>
          }
        />
        <div style={templateSummaryStyle(overallTemplateStatus)}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <div style={cardTitleStyle}>{t(`insights.templateOverallTitle.${overallTemplateStatus}`)}</div>
            <div style={analysisActionBodyStyle}>
              {t(`insights.templateOverallBody.${overallTemplateStatus}`)}
            </div>
          </div>
          <div style={templateSummaryMetaStyle}>
            {t("insights.templateSummaryMeta", {
              strong: templateModules.filter((module) => module.status === "strong").length,
              watch: templateModules.filter((module) => module.status === "watch").length,
              weak: templateModules.filter((module) => module.status === "weak").length,
            })}
          </div>
        </div>
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <div style={cardTitleStyle}>{t("insights.templateNarrativeTitle")}</div>
          <div style={templateNarrativeGridStyle(isMobile)}>
            {narrativeCards.map((card) => (
              <div key={card.title} style={templateNarrativeCardStyle}>
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: pageColorTokens.textPrimary }}>
                    {card.title}
                  </div>
                  <div style={analysisActionBodyStyle}>{card.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={templateGridStyle(isMobile)}>
          {templateModules.map((module) => (
            <TemplateModuleCard key={module.key} module={module} />
          ))}
        </div>
        <div style={templateRecommendationStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <div style={cardTitleStyle}>{t("insights.templateRecommendationTitle")}</div>
            <div style={analysisActionBodyStyle}>{t("insights.templateRecommendationBody")}</div>
          </div>
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {(recommendationModules.length > 0 ? recommendationModules : templateModules.slice(0, 1)).map(
              (module) => (
                <div key={module.key} style={templateRecommendationItemStyle}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: pageColorTokens.textPrimary }}>
                    {module.title}
                  </div>
                  <div style={cardMetaStyle}>{module.suggestion}</div>
                </div>
              ),
            )}
          </div>
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("insights.analysisSectionTitle")}
          subtitle={t("insights.analysisSectionSubtitle")}
          badge={<span style={sectionBadgeStyle}>{t("insights.analysisSectionBadge")}</span>}
        />
        <div style={analysisGridStyle(isMobile)}>
          <AnalysisActionCard
            title={t("insights.analysisPerformanceTitle")}
            body={t("insights.analysisPerformanceBody")}
            footnote={t("insights.analysisPerformanceFootnote", {
              connected: connectedCount,
              total: overview.platforms.length,
            })}
            cta={t("insights.analysisOpenPerformance")}
            onClick={() => onOpenPerformance("meta")}
          />
          <AnalysisActionCard
            title={t("insights.analysisCatalogTitle")}
            body={t("insights.analysisCatalogBody")}
            footnote={t("insights.analysisCatalogFootnote", {
              issues: disapprovedTotal,
              pending: attentionCount,
            })}
            cta={t("insights.analysisOpenCatalogTasks")}
            onClick={onOpenCatalogTasks}
          />
          <AnalysisActionCard
            title={t("insights.analysisConnectionsTitle")}
            body={t("insights.analysisConnectionsBody")}
            footnote={t("insights.analysisConnectionsFootnote", {
              connected: readyConnections,
              total: overview.connections.length,
            })}
            cta={t("insights.analysisOpenConnections")}
            onClick={onOpenSettings}
          />
        </div>
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("insights.platformSectionTitle")}
          subtitle={t("insights.platformSectionSubtitle")}
          badge={
            <span style={sectionBadgeStyle}>
              {t("insights.platformSectionBadge", {
                connected: connectedCount,
                total: overview.platforms.length,
              })}
            </span>
          }
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
      </PageSurface>

      <HealthSection checks={overview.health} onOpenCatalog={onOpenCatalog} />

      <PageSurface>
        <PageSectionHeader
          title={t("insights.reviewSectionTitle")}
          subtitle={t("insights.reviewSectionSubtitle")}
          badge={
            <span style={summaryBadgeStyle(disapprovedTotal > 0)}>
              {disapprovedTotal > 0
                ? t("insights.reviewBadgeAttention", { count: disapprovedTotal })
                : t("insights.reviewBadgeHealthy")}
            </span>
          }
        />
        <ReviewTable reviews={overview.reviews} />
      </PageSurface>

      <PageSurface>
        <PageSectionHeader
          title={t("insights.connectionSectionTitle")}
          subtitle={t("insights.connectionSectionSubtitle")}
          badge={
            <span style={sectionBadgeStyle}>
              {t("insights.connectionBadge", {
                connected: readyConnections,
                total: overview.connections.length,
              })}
            </span>
          }
        />
        <ConnectionTable connections={overview.connections} onOpenCatalog={onOpenCatalog} />
      </PageSurface>
    </>
  );
}

function AnalysisActionCard({
  title,
  body,
  footnote,
  cta,
  onClick,
}: {
  title: string;
  body: string;
  footnote: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div style={analysisActionCardStyle}>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <div style={cardTitleStyle}>{title}</div>
        <div style={analysisActionBodyStyle}>{body}</div>
      </div>
      <div style={cardFootnoteStyle}>{footnote}</div>
      <button type="button" style={secondaryButtonStyle} onClick={onClick}>
        {cta}
      </button>
    </div>
  );
}

function TemplateModuleCard({ module }: { module: TemplateModule }) {
  const { t } = useTranslation();

  return (
    <div style={templateModuleCardStyle(module.status)}>
      <div style={cardHeadStyle}>
        <span style={cardTitleStyle}>{module.title}</span>
        <span style={templateStatusPillStyle(module.status)}>
          {t(`insights.templateStatus.${module.status}`)}
        </span>
      </div>
      <div style={analysisActionBodyStyle}>{module.summary}</div>
      <div style={templateBenchmarkStyle}>{module.benchmark}</div>
      <div style={{ display: "grid", gap: "0.35rem" }}>
        {module.evidence.map((item) => (
          <div key={item} style={templateEvidenceStyle}>
            {item}
          </div>
        ))}
      </div>
      <div style={cardFootnoteStyle}>{module.suggestion}</div>
    </div>
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

type LinkProbeResponse = {
  ok: boolean;
  state: "not_linked" | "pending" | "linked" | "failed" | null;
  invitationStatus?: string | null;
  message?: string;
};

/**
 * GMC↔Ads 关联状态只存在于 Google Ads 侧，loader 拿不到，
 * 这里把异步探测结果合并回那一行；探测未回来时保持「探测中」。
 */
function applyLinkProbe(
  check: AdsHealthCheck,
  probe: LinkProbeResponse | undefined,
): AdsHealthCheck {
  if (check.key !== "gmcAdsLink" || check.state !== "unknown") return check;
  if (!probe) return check;
  if (!probe.ok || probe.state === null) {
    return { ...check, detailCode: "linkProbeFailed" };
  }
  switch (probe.state) {
    case "linked":
      return { ...check, state: "ok", detailCode: "linkLinked" };
    case "pending":
      return { ...check, state: "warning", detailCode: "linkPending" };
    case "not_linked":
      return { ...check, state: "warning", detailCode: "linkNotLinked" };
    case "failed":
      return { ...check, state: "warning", detailCode: "linkFailed" };
    default: {
      const exhaustive: never = probe.state;
      return exhaustive;
    }
  }
}

function HealthSection({
  checks,
  onOpenCatalog,
}: {
  checks: AdsHealthCheck[];
  onOpenCatalog: () => void;
}) {
  const { t } = useTranslation();
  const linkFetcher = useFetcher<LinkProbeResponse>();
  const needsProbe = checks.some(
    (check) => check.key === "gmcAdsLink" && check.state === "unknown",
  );

  useEffect(() => {
    if (!needsProbe) return;
    if (linkFetcher.state !== "idle" || linkFetcher.data) return;
    linkFetcher.load("/api/ads-overview/link-status");
  }, [needsProbe, linkFetcher]);

  const resolved = checks.map((check) => applyLinkProbe(check, linkFetcher.data));
  const pendingCount = resolved.filter((check) => check.state === "warning").length;

  return (
    <PageSurface>
      <PageSectionHeader
        title={t("insights.health.sectionTitle")}
        subtitle={t("insights.health.sectionSubtitle")}
        badge={
          <span style={healthBadgeStyle(pendingCount > 0)}>
            {pendingCount > 0
              ? t("insights.health.pendingBadge", { count: pendingCount })
              : t("insights.health.allGood")}
          </span>
        }
      />
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{t("insights.health.colPlatform")}</th>
              <th style={thStyle}>{t("insights.health.colItem")}</th>
              <th style={thStyle}>{t("insights.health.colState")}</th>
              <th style={thStyle}>{t("insights.health.colDetail")}</th>
            </tr>
          </thead>
          <tbody>
            {resolved.map((check, index) => {
              // 同平台只在首行显示平台名，读起来像分组而不是重复列。
              const isGroupStart = index === 0 || resolved[index - 1]!.platform !== check.platform;
              return (
                <tr key={check.key}>
                  <td style={{ ...tdStyle, fontWeight: isGroupStart ? 700 : 400 }}>
                    {isGroupStart ? PLATFORM_LABEL[check.platform] : ""}
                  </td>
                  <td style={tdStyle}>{t(`insights.health.item.${check.key}`)}</td>
                  <td style={tdStyle}>
                    <span style={healthStatePillStyle(check.state)}>
                      {t(`insights.health.state.${check.state}`)}
                    </span>
                  </td>
                  <td style={tdMetaStyle}>
                    {t(`insights.health.detail.${check.detailCode}`)}
                    {check.reference ? ` · ${check.reference}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pendingCount > 0 ? (
        <button
          type="button"
          style={{ ...secondaryButtonStyle, marginTop: "0.75rem" }}
          onClick={onOpenCatalog}
        >
          {t("insights.health.fixCta")}
        </button>
      ) : null}
    </PageSurface>
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

function buildEfficiencyModule(params: {
  t: ReturnType<typeof useTranslation>["t"];
  roas: number | null;
  conversions: number;
  spend: number;
  value: number;
  currencyCode: string | null;
}): TemplateModule {
  const { t, roas, conversions, spend, value, currencyCode } = params;
  const status: TemplateStatus = roas !== null && roas >= 3 && conversions >= 20
    ? "strong"
    : roas !== null && roas >= 1.5 && conversions >= 5
      ? "watch"
      : "weak";

  return {
    key: "efficiency",
    title: t("insights.templateEfficiencyTitle"),
    summary:
      status === "strong"
        ? t("insights.templateEfficiencySummaryStrong")
        : status === "watch"
          ? t("insights.templateEfficiencySummaryWatch")
          : t("insights.templateEfficiencySummaryWeak"),
    benchmark: t("insights.templateEfficiencyBenchmark"),
    evidence: [
      t("insights.templateEvidenceRoas", { value: formatRatio(roas, "x") }),
      t("insights.templateEvidenceConversions", { value: formatInteger(conversions) }),
      t("insights.templateEvidenceSpendValue", {
        spend: formatMoney(spend, currencyCode),
        value: formatMoney(value, currencyCode),
      }),
    ],
    suggestion:
      status === "strong"
        ? t("insights.templateEfficiencyActionStrong")
        : status === "watch"
          ? t("insights.templateEfficiencyActionWatch")
          : t("insights.templateEfficiencyActionWeak"),
    status,
  };
}

function buildCoverageModule(params: {
  t: ReturnType<typeof useTranslation>["t"];
  connectedCount: number;
  totalPlatforms: number;
  freshSnapshotCount: number;
  attentionCount: number;
  readyConnections: number;
  totalConnections: number;
}): TemplateModule {
  const {
    t,
    connectedCount,
    totalPlatforms,
    freshSnapshotCount,
    attentionCount,
    readyConnections,
    totalConnections,
  } = params;
  const status: TemplateStatus =
    connectedCount >= 2 && freshSnapshotCount === connectedCount && attentionCount === 0
      ? "strong"
      : connectedCount >= 1 && readyConnections >= Math.ceil(totalConnections / 2)
        ? "watch"
        : "weak";

  return {
    key: "coverage",
    title: t("insights.templateCoverageTitle"),
    summary:
      status === "strong"
        ? t("insights.templateCoverageSummaryStrong")
        : status === "watch"
          ? t("insights.templateCoverageSummaryWatch")
          : t("insights.templateCoverageSummaryWeak"),
    benchmark: t("insights.templateCoverageBenchmark"),
    evidence: [
      t("insights.templateEvidencePlatforms", {
        connected: connectedCount,
        total: totalPlatforms,
      }),
      t("insights.templateEvidenceSnapshots", {
        ready: freshSnapshotCount,
        total: connectedCount,
      }),
      t("insights.templateEvidenceConnections", {
        connected: readyConnections,
        total: totalConnections,
      }),
    ],
    suggestion:
      status === "strong"
        ? t("insights.templateCoverageActionStrong")
        : status === "watch"
          ? t("insights.templateCoverageActionWatch")
          : t("insights.templateCoverageActionWeak"),
    status,
  };
}

function buildReadinessModule(params: {
  t: ReturnType<typeof useTranslation>["t"];
  disapprovedTotal: number;
  disapprovedRate: number | null;
  attentionCount: number;
  reviewedTotal: number;
}): TemplateModule {
  const { t, disapprovedTotal, disapprovedRate, attentionCount, reviewedTotal } = params;
  const status: TemplateStatus =
    disapprovedTotal === 0 && attentionCount <= 1
      ? "strong"
      : (disapprovedRate ?? 100) < 15 && attentionCount <= 3
        ? "watch"
        : "weak";

  return {
    key: "readiness",
    title: t("insights.templateReadinessTitle"),
    summary:
      status === "strong"
        ? t("insights.templateReadinessSummaryStrong")
        : status === "watch"
          ? t("insights.templateReadinessSummaryWatch")
          : t("insights.templateReadinessSummaryWeak"),
    benchmark: t("insights.templateReadinessBenchmark"),
    evidence: [
      t("insights.templateEvidenceDisapproved", { value: formatInteger(disapprovedTotal) }),
      t("insights.templateEvidenceDisapprovedRate", {
        value: reviewedTotal > 0 ? formatPercent(disapprovedRate) : "—",
      }),
      t("insights.templateEvidenceHealthIssues", { value: String(attentionCount) }),
    ],
    suggestion:
      status === "strong"
        ? t("insights.templateReadinessActionStrong")
        : status === "watch"
          ? t("insights.templateReadinessActionWatch")
          : t("insights.templateReadinessActionWeak"),
    status,
  };
}

function buildAttributionModule(params: {
  t: ReturnType<typeof useTranslation>["t"];
  attributionData: GoogleAttributionOverviewResponse | undefined;
  attributionLoading: boolean;
  linkedCampaignShare: number | null;
}): TemplateModule {
  const { t, attributionData, attributionLoading, linkedCampaignShare } = params;
  const attributionOk = attributionData && attributionData.ok ? attributionData : null;
  const attributionError = attributionData && !attributionData.ok ? attributionData : null;
  const status: TemplateStatus =
    attributionOk && attributionOk.linked && (linkedCampaignShare ?? 0) >= 60 && attributionOk.warnings.length === 0
      ? "strong"
      : attributionOk && attributionOk.linked
        ? "watch"
        : "weak";

  return {
    key: "attribution",
    title: t("insights.templateAttributionTitle"),
    summary: attributionLoading
      ? t("insights.templateAttributionSummaryLoading")
      : attributionOk
        ? status === "strong"
          ? t("insights.templateAttributionSummaryStrong")
          : status === "watch"
            ? t("insights.templateAttributionSummaryWatch")
            : t("insights.templateAttributionSummaryWeak")
        : attributionError?.reason === "not_configured"
          ? t("insights.templateAttributionSummaryMissing")
          : t("insights.templateAttributionSummaryError"),
    benchmark: t("insights.templateAttributionBenchmark"),
    evidence: attributionOk
      ? [
          t("insights.templateEvidenceAttributedRevenue", {
            value: formatMoney(attributionOk.totals.ga4Revenue, attributionOk.currencyCode),
          }),
          t("insights.templateEvidenceAttributedRoas", {
            value: formatRatio(attributionOk.totals.roas, "x"),
          }),
          t("insights.templateEvidenceLinkedShare", {
            value: linkedCampaignShare === null ? "—" : formatPercent(linkedCampaignShare),
          }),
        ]
      : [
          t("insights.templateEvidenceAttributionState", {
            value: attributionLoading
              ? t("insights.templateAttributionLoading")
              : attributionError?.reason === "not_configured"
                ? t("insights.templateAttributionNotReady")
                : t("insights.templateAttributionUnavailable"),
          }),
        ],
    suggestion: attributionLoading
      ? t("insights.templateAttributionActionLoading")
      : attributionOk
        ? status === "strong"
          ? t("insights.templateAttributionActionStrong")
          : status === "watch"
            ? t("insights.templateAttributionActionWatch")
            : t("insights.templateAttributionActionWeak")
        : t("insights.templateAttributionActionMissing"),
    status,
  };
}

function buildNarrativeCards(params: {
  t: ReturnType<typeof useTranslation>["t"];
  roas: number | null;
  conversions: number;
  connectedCount: number;
  totalPlatforms: number;
  attributionData: GoogleAttributionOverviewResponse | undefined;
  attributionLoading: boolean;
  linkedCampaignShare: number | null;
  focusModule: TemplateModule;
}): NarrativeCard[] {
  const {
    t,
    roas,
    conversions,
    connectedCount,
    totalPlatforms,
    attributionData,
    attributionLoading,
    linkedCampaignShare,
    focusModule,
  } = params;
  const efficiencyStatus: TemplateStatus =
    roas !== null && roas >= 3 && conversions >= 20
      ? "strong"
      : roas !== null && roas >= 1.5 && conversions >= 5
        ? "watch"
        : "weak";
  const attributionOk = attributionData && attributionData.ok ? attributionData : null;
  const attributionError = attributionData && !attributionData.ok ? attributionData : null;

  const performanceBody =
    efficiencyStatus === "strong"
      ? t("insights.templateNarrativePerformanceStrong", {
          roas: formatRatio(roas, "x"),
          conversions: formatInteger(conversions),
          connected: connectedCount,
          total: totalPlatforms,
        })
      : efficiencyStatus === "watch"
        ? t("insights.templateNarrativePerformanceWatch", {
            roas: formatRatio(roas, "x"),
            conversions: formatInteger(conversions),
            connected: connectedCount,
            total: totalPlatforms,
          })
        : t("insights.templateNarrativePerformanceWeak", {
            roas: formatRatio(roas, "x"),
            conversions: formatInteger(conversions),
            connected: connectedCount,
            total: totalPlatforms,
          });

  const attributionBody = attributionLoading
    ? t("insights.templateNarrativeAttributionLoading")
    : attributionOk
      ? attributionOk.linked && (linkedCampaignShare ?? 0) >= 60
        ? t("insights.templateNarrativeAttributionStrong", {
            revenue: formatMoney(attributionOk.totals.ga4Revenue, attributionOk.currencyCode),
            roas: formatRatio(attributionOk.totals.roas, "x"),
            linkedShare: linkedCampaignShare === null ? "—" : formatPercent(linkedCampaignShare),
          })
        : t("insights.templateNarrativeAttributionWatch", {
            revenue: formatMoney(attributionOk.totals.ga4Revenue, attributionOk.currencyCode),
            roas: formatRatio(attributionOk.totals.roas, "x"),
            linkedShare: linkedCampaignShare === null ? "—" : formatPercent(linkedCampaignShare),
          })
      : attributionError?.reason === "not_configured"
        ? t("insights.templateNarrativeAttributionMissing")
        : t("insights.templateNarrativeAttributionWeak");

  return [
    {
      title: t("insights.templateNarrativePerformanceTitle"),
      body: performanceBody,
    },
    {
      title: t("insights.templateNarrativeAttributionTitle"),
      body: attributionBody,
    },
    {
      title: t("insights.templateNarrativeActionTitle"),
      body: t("insights.templateNarrativeActionBody", {
        module: focusModule.title,
        action: focusModule.suggestion,
      }),
    },
  ];
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

const analysisGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const templateGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
  gap: "0.75rem",
});

const templateNarrativeGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
  gap: "0.75rem",
});

const analysisActionCardStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  padding: "1rem",
  display: "grid",
  gap: "0.75rem",
};

const templateNarrativeCardStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  padding: "0.9rem 1rem",
  display: "grid",
  gap: "0.5rem",
  background: pageColorTokens.surfaceMuted,
};

const templateSummaryStyle = (attention: TemplateStatus): CSSProperties => ({
  ...destinationSurfaceStyle,
  padding: "1rem",
  display: "grid",
  gap: "0.6rem",
  borderColor:
    attention === "weak"
      ? "rgba(214, 44, 13, 0.18)"
      : attention === "watch"
        ? "rgba(185, 137, 0, 0.24)"
        : "rgba(0, 166, 124, 0.24)",
  background:
    attention === "weak"
      ? "#fff4f2"
      : attention === "watch"
        ? "#fffaf0"
        : pageColorTokens.brandGreenLight,
});

const templateSummaryMetaStyle: CSSProperties = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
};

const analysisActionBodyStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const templateBenchmarkStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: pageColorTokens.textSecondary,
};

const templateEvidenceStyle: CSSProperties = {
  padding: "0.45rem 0.6rem",
  borderRadius: 10,
  fontSize: 12,
  color: pageColorTokens.textPrimary,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const templateRecommendationStyle: CSSProperties = {
  ...destinationSurfaceStyle,
  padding: "1rem",
  display: "grid",
  gap: "0.85rem",
};

const templateRecommendationItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  padding: "0.65rem 0.75rem",
  borderRadius: 12,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
};

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

const sectionBadgeStyle: CSSProperties = {
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const summaryBadgeStyle = (attention: boolean): CSSProperties => ({
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: attention ? "#8a5a00" : pageColorTokens.brandGreenDark,
  background: attention ? "#fff7e0" : pageColorTokens.brandGreenLight,
  border: `1px solid ${attention ? "rgba(185, 137, 0, 0.3)" : "rgba(0, 166, 124, 0.28)"}`,
});

const templateStatusPillStyle = (status: TemplateStatus): CSSProperties => ({
  padding: "0.16rem 0.5rem",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  color:
    status === "strong"
      ? pageColorTokens.brandGreenDark
      : status === "watch"
        ? "#8a5a00"
        : "#d82c0d",
  background:
    status === "strong"
      ? pageColorTokens.brandGreenLight
      : status === "watch"
        ? "#fff7e0"
        : "#fff0ee",
  border: `1px solid ${
    status === "strong"
      ? "rgba(0, 166, 124, 0.28)"
      : status === "watch"
        ? "rgba(185, 137, 0, 0.3)"
        : "rgba(216, 44, 13, 0.22)"
  }`,
});

const templateModuleCardStyle = (status: TemplateStatus): CSSProperties => ({
  ...destinationSurfaceStyle,
  padding: "1rem",
  display: "grid",
  gap: "0.75rem",
  borderColor:
    status === "strong"
      ? "rgba(0, 166, 124, 0.18)"
      : status === "watch"
        ? "rgba(185, 137, 0, 0.24)"
        : "rgba(216, 44, 13, 0.18)",
});

const healthStateTokens: Record<
  AdsHealthState,
  { color: string; background: string; border: string }
> = {
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

const healthBadgeStyle = (pending: boolean): CSSProperties => ({
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  color: pending ? "#8a5a00" : pageColorTokens.brandGreenDark,
  background: pending ? "#fff7e0" : pageColorTokens.brandGreenLight,
  border: `1px solid ${pending ? "rgba(185, 137, 0, 0.3)" : "rgba(0, 166, 124, 0.28)"}`,
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
