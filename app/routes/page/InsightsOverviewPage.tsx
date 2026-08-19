/**
 * 洞察 › 总览 UI。
 *
 * 布局：区间工具条 → 合并 KPI → 客户分析模板 → 下一步分析路径 → 商品审核。
 * 全页只读：任何写操作都通过链接跳回 Ads Catalog / 投放明细，不在这里发起。
 */
import { useEffect, type CSSProperties } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { appendEmbeddedSearchToPath } from "../../lib/embeddedLocationSearch";
import {
  analysisPageContentStyle,
  PageHeaderNav,
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
import type { AdsOverviewPlatform, AdsOverviewReview, AdsOverviewSnapshot } from "../../server/adsInsights/overview.server";
import type { GoogleAttributionOverviewResponse } from "../api.google-attribution.overview";
import type { InsightsOverviewLoaderData } from "../app.insights._index";

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

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  return iso.replace("T", " ").slice(0, 16);
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
  const navigate = useNavigate();
  const attributionFetcher = useFetcher<GoogleAttributionOverviewResponse>();
  const embeddedSearch = useEmbeddedLocationSearch();

  const rangeDays = overview?.rangeDays ?? 7;
  const refreshing = revalidator.state !== "idle";

  useEffect(() => {
    if (!overview) return;
    attributionFetcher.load(
      appendEmbeddedSearchToPath(`/api/google-attribution/overview?range=${rangeDays}`, embeddedSearch),
    );
    // fetcher identity is stable enough here; we only want to react to overview/range changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, rangeDays, embeddedSearch]);

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
            navigate(buildPerformanceHref(platform, rangeDays, embeddedSearch))
          }
          onOpenCatalog={() => navigate(appendEmbeddedSearchToPath("/app/ads-catalog", embeddedSearch))}
          onOpenCatalogTasks={() => navigate(buildCatalogTasksHref(embeddedSearch))}
          onOpenSettings={() => navigate(appendEmbeddedSearchToPath("/app/settings", embeddedSearch))}
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
  const disapprovedTotal = overview.reviews.reduce((sum, review) => sum + review.disapproved, 0);
  const attributionOk = attributionData && attributionData.ok ? attributionData : null;
  const linkedCampaignShare =
    attributionOk && attributionOk.campaigns.length > 0
      ? (attributionOk.campaigns.filter((item) => item.matchQuality === "linked").length /
          attributionOk.campaigns.length) *
        100
      : null;
  const templateModules: TemplateModule[] = [
    buildEfficiencyModule({
      t,
      roas: overview.totals.roas,
      conversions: overview.totals.conversions,
      spend: overview.totals.spend,
      value: overview.totals.conversionsValue,
      currencyCode: overview.currencyCode,
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
              pending: disapprovedTotal,
            })}
            cta={t("insights.analysisOpenCatalogTasks")}
            onClick={onOpenCatalogTasks}
          />
          <AnalysisActionCard
            title={t("insights.analysisSettingsTitle")}
            body={t("insights.analysisSettingsBody")}
            footnote={t("insights.analysisSettingsFootnote")}
            cta={t("insights.analysisOpenSettings")}
            onClick={onOpenSettings}
          />
        </div>
      </PageSurface>

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
