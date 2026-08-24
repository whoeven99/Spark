import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { useFeatureView } from "../../lib/featureTrack";
import {
  defaultPageSpeedLocaleFromApp,
  pageSpeedLocaleNativeLabel,
  PAGE_SPEED_LOCALES,
  resolvePageSpeedLocale,
  type PageSpeedLocaleCode,
} from "../../lib/pageSpeedLocales";
import type {
  PageSpeedCategoryId,
  PageSpeedAuditItem,
  PageSpeedCategoryScore,
  PageSpeedReport,
  PageSpeedResponse,
  PageSpeedStrategy,
} from "../../lib/pageSpeedTypes";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import { PageSpeedAuditPanel } from "../component/pageSpeed/PageSpeedAuditPanel";
import { PageSpeedMetricsRow } from "../component/pageSpeed/PageSpeedMetricsRow";
import { PageSpeedScoreRow } from "../component/pageSpeed/PageSpeedScoreRow";
import { pageSpeedCardStyle, pageSpeedMutedTextStyle } from "../component/pageSpeed/pageSpeedUi";
import {
  PageHeaderNav,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageSelectCompactStyle,
} from "./pageUiStyles";
import type { PageSpeedSettingsLoaderData } from "../app.settings.pagespeed";

type AnalyzeFetcherData = PageSpeedResponse;
type SummaryTone = "good" | "warning" | "critical" | "neutral";

type SummaryCard = {
  label: string;
  value: string;
  detail: string;
  tone: SummaryTone;
};

type SummaryAction = {
  title: string;
  detail: string;
};

export function PageSpeedInsightsPage() {
  const loaderData = useLoaderData<PageSpeedSettingsLoaderData>();
  const locationSearch = useEmbeddedLocationSearch();
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const source = searchParams.get("source")?.trim() || null;
  useFeatureView("settings");

  return (
    <PageSpeedInsightsContent
      defaultUrl={searchParams.get("url")?.trim() || loaderData.defaultUrl}
      defaultReportLocale={resolvePageSpeedLocale(
        searchParams.get("locale"),
        loaderData.defaultReportLocale,
      )}
      initialStrategy={searchParams.get("strategy") === "desktop" ? "desktop" : "mobile"}
      source={source}
      label={searchParams.get("label")?.trim() || null}
      returnTo={searchParams.get("returnTo")?.trim() || null}
      autorun={searchParams.get("autorun") === "1"}
      hideUrlInput={source === "health-monitor"}
      hideLocaleInput={source === "health-monitor"}
    />
  );
}

export function PageSpeedInsightsContent({
  defaultUrl,
  defaultReportLocale,
  initialStrategy = "mobile",
  source = null,
  label = null,
  returnTo = null,
  showHeader = true,
  showHint = true,
  embedded = false,
  hideUrlInput = false,
  hideLocaleInput = false,
  autorun = false,
}: {
  defaultUrl: string;
  defaultReportLocale: PageSpeedLocaleCode;
  initialStrategy?: PageSpeedStrategy;
  source?: string | null;
  label?: string | null;
  returnTo?: string | null;
  showHeader?: boolean;
  showHint?: boolean;
  embedded?: boolean;
  hideUrlInput?: boolean;
  hideLocaleInput?: boolean;
  autorun?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const locationSearch = useEmbeddedLocationSearch();
  const fetcher = useFetcher<AnalyzeFetcherData>();
  const [url, setUrl] = useState(defaultUrl);
  const [strategy, setStrategy] = useState<PageSpeedStrategy>(initialStrategy);
  const [reportLocale, setReportLocale] = useState<PageSpeedLocaleCode>(defaultReportLocale);
  const [activeCategory, setActiveCategory] = useState<PageSpeedCategoryId>("performance");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const analyzing = fetcher.state !== "idle";
  const report = fetcher.data?.ok ? fetcher.data.report : null;
  const summary = useMemo(() => (report ? buildPageSpeedSummary(report, t) : null), [report, t]);
  const isHealthMonitorSource = source === "health-monitor" || source === "daily-insights";
  const shouldAutorun = autorun || isHealthMonitorSource;

  useEffect(() => {
    setUrl(defaultUrl || "");
  }, [defaultUrl]);

  useEffect(() => {
    setReportLocale(defaultReportLocale || defaultPageSpeedLocaleFromApp(i18n.language));
  }, [defaultReportLocale, i18n.language]);

  useEffect(() => {
    setStrategy(initialStrategy);
  }, [initialStrategy]);

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      setErrorCode(null);
      setActiveCategory("performance");
      return;
    }
    setErrorCode(fetcher.data.errorCode);
  }, [fetcher.data]);

  const handleAnalyze = useMemo(
    () => () => {
      setErrorCode(null);
      fetcher.submit(
        { url, strategy, locale: reportLocale },
        {
          method: "POST",
          action: `/api/pagespeed${locationSearch}`,
          encType: "application/json",
        },
      );
    },
    [fetcher, locationSearch, reportLocale, strategy, url],
  );

  const reportLocaleStale = Boolean(report && report.locale !== reportLocale);

  useEffect(() => {
    if (!shouldAutorun || fetcher.data || fetcher.state !== "idle" || !url.trim()) return;
    handleAnalyze();
  }, [fetcher.data, fetcher.state, handleAnalyze, shouldAutorun, url]);

  const containerStyle: CSSProperties = embedded
    ? { display: "flex", flexDirection: "column", gap: "0.85rem" }
    : isMobile
      ? mobilePageContentStyle
      : pageContentStyle;

  return (
    <div style={containerStyle}>
      {showHeader ? (
        <PageHeaderNav
          title={t("pageSpeed.title")}
          subtitle={t("pageSpeed.subtitle")}
          backLabel={returnTo ? (isHealthMonitorSource ? "返回健康度监测" : "返回上一级") : t("settingsShell.back")}
          fallbackPath={returnTo ?? "/app/settings"}
          returnTo={returnTo ?? undefined}
        />
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {isHealthMonitorSource ? (
          <StatusBanner
            message={
              label
                ? `当前正在分析「${label}」，该结果会回到 Health Monitor，用来判断站点体验是否正在拖累转化承接与 ROI。`
                : "该结果会回到 Health Monitor，用来判断站点体验是否正在拖累转化承接与 ROI。"
            }
          />
        ) : null}
        {hideUrlInput || hideLocaleInput ? (
          <StatusBanner
            message={`分析对象：${url || "当前店铺"}${hideLocaleInput ? ` · 报告语言：${pageSpeedLocaleNativeLabel(reportLocale)}` : ""}`}
          />
        ) : null}
        {showHint ? <p style={{ ...pageSpeedMutedTextStyle, margin: 0 }}>{t("pageSpeed.hint")}</p> : null}
        <AnalyzeForm
          url={url}
          strategy={strategy}
          reportLocale={reportLocale}
          analyzing={analyzing}
          isMobile={isMobile}
          hideUrlInput={hideUrlInput}
          hideLocaleInput={hideLocaleInput}
          onUrlChange={setUrl}
          onStrategyChange={setStrategy}
          onReportLocaleChange={setReportLocale}
          onAnalyze={handleAnalyze}
        />
        {errorCode ? <ErrorBanner message={t(`pageSpeed.errors.${errorCode}`)} /> : null}
        {reportLocaleStale ? (
          <StatusBanner message={t("pageSpeed.reportLocaleStale")} />
        ) : null}
        {analyzing ? <StatusBanner message={t("pageSpeed.analyzing")} /> : null}
        {!analyzing && !report && !errorCode ? (
          <StatusBanner message={t("pageSpeed.empty")} />
        ) : null}
        {report ? (
          <>
            {summary ? <PageSpeedSummaryPanel summary={summary} isMobile={isMobile} /> : null}
            <PageSpeedScoreRow
              categories={report.categories}
              analyzedAt={report.fetchTime}
              reportLocaleLabel={pageSpeedLocaleNativeLabel(report.locale)}
              isMobile={isMobile}
            />
            <PageSpeedMetricsRow metrics={report.metrics} isMobile={isMobile} />
            <SegmentedPageTabs
              activeTab={activeCategory}
              onTabChange={setActiveCategory}
              ariaLabel={t("pageSpeed.categoryTabs")}
              items={report.categories.map((category) => ({
                key: category.id,
                label: category.title,
              }))}
            />
            <PageSpeedAuditPanel report={report.reports[activeCategory]} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function buildPageSpeedSummary(
  report: PageSpeedReport,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const performance = findCategory(report.categories, "performance");
  const seo = findCategory(report.categories, "seo");
  const bestPractices = findCategory(report.categories, "best-practices");
  const accessibility = findCategory(report.categories, "accessibility");
  const poorMetrics = report.metrics.filter((item) => item.band === "poor");
  const warningMetrics = report.metrics.filter((item) => item.band === "needs-improvement");
  const topOpportunities = report.reports.performance.opportunities.slice(0, 3);
  const crossCategoryIssues = [
    ...report.reports.seo.failed.slice(0, 1),
    ...report.reports["best-practices"].failed.slice(0, 1),
    ...report.reports.accessibility.failed.slice(0, 1),
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);

  const cards: SummaryCard[] = [
    {
      label: t("pageSpeed.summaryStatus"),
      value: summarizeOverallStatus(performance?.score, t),
      detail: summarizeOverallDetail(performance?.score, poorMetrics.length, warningMetrics.length, t),
      tone:
        performance?.band === "poor"
          ? "critical"
          : performance?.band === "needs-improvement"
            ? "warning"
            : performance?.band === "good"
              ? "good"
              : "neutral",
    },
    {
      label: t("pageSpeed.summaryFocus"),
      value:
        poorMetrics[0]?.title ??
        warningMetrics[0]?.title ??
        topOpportunities[0]?.title ??
        t("pageSpeed.summaryNoMajorIssue"),
      detail:
        poorMetrics[0]
          ? t("pageSpeed.summaryFocusMetric", { value: poorMetrics[0].displayValue })
          : warningMetrics[0]
            ? t("pageSpeed.summaryFocusMetric", { value: warningMetrics[0].displayValue })
            : topOpportunities[0]?.description ?? t("pageSpeed.summaryHealthyFocus"),
      tone: poorMetrics.length > 0 ? "critical" : warningMetrics.length > 0 ? "warning" : "good",
    },
    {
      label: t("pageSpeed.summaryCoverage"),
      value: `${countLowScoringCategories(report.categories)} / ${report.categories.length}`,
      detail: t("pageSpeed.summaryCoverageDetail", {
        seo: scoreLabel(seo?.score),
        best: scoreLabel(bestPractices?.score),
        accessibility: scoreLabel(accessibility?.score),
      }),
      tone: countLowScoringCategories(report.categories) >= 2 ? "warning" : "neutral",
    },
  ];

  const actions: SummaryAction[] = [
    ...topOpportunities.map((item) => ({
      title: item.title,
      detail: summarizeAuditAction(item, t),
    })),
    ...crossCategoryIssues.map((item) => ({
      title: item.title,
      detail: item.description || t("pageSpeed.summaryAuditFallback"),
    })),
  ].slice(0, 4);

  const facts = [
    `${t("pageSpeed.summaryUrl")}: ${report.finalUrl || report.requestedUrl}`,
    `${t("pageSpeed.summaryStrategy")}: ${report.strategy === "mobile" ? t("pageSpeed.strategyMobile") : t("pageSpeed.strategyDesktop")}`,
    report.lighthouseVersion
      ? `${t("pageSpeed.summaryLighthouse")}: ${report.lighthouseVersion}`
      : null,
  ].filter((item): item is string => Boolean(item));

  return { cards, actions, facts };
}

function findCategory(categories: PageSpeedCategoryScore[], id: PageSpeedCategoryId) {
  return categories.find((item) => item.id === id) ?? null;
}

function summarizeOverallStatus(score: number | null | undefined, t: (key: string) => string) {
  if (score == null) return t("pageSpeed.summaryStatusPending");
  if (score < 50) return t("pageSpeed.summaryStatusCritical");
  if (score < 90) return t("pageSpeed.summaryStatusWarning");
  return t("pageSpeed.summaryStatusGood");
}

function summarizeOverallDetail(
  score: number | null | undefined,
  poorMetricCount: number,
  warningMetricCount: number,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (score == null) return t("pageSpeed.summaryStatusPendingDetail");
  if (poorMetricCount > 0) {
    return t("pageSpeed.summaryStatusCriticalDetail", { count: poorMetricCount });
  }
  if (warningMetricCount > 0) {
    return t("pageSpeed.summaryStatusWarningDetail", { count: warningMetricCount });
  }
  return t("pageSpeed.summaryStatusGoodDetail");
}

function countLowScoringCategories(categories: PageSpeedCategoryScore[]) {
  return categories.filter((item) => item.score != null && item.score < 90).length;
}

function scoreLabel(score: number | null | undefined) {
  if (score == null) return "—";
  return `${score}`;
}

function summarizeAuditAction(
  item: PageSpeedAuditItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (item.savingsMs && item.savingsMs > 0) {
    return t("pageSpeed.summaryAuditSavingsMs", { value: Math.round(item.savingsMs) });
  }
  if (item.savingsBytes && item.savingsBytes > 0) {
    return t("pageSpeed.summaryAuditSavingsBytes", { value: Math.round(item.savingsBytes / 1024) });
  }
  return item.description || t("pageSpeed.summaryAuditFallback");
}

function PageSpeedSummaryPanel({
  summary,
  isMobile,
}: {
  summary: ReturnType<typeof buildPageSpeedSummary>;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ ...pageSpeedCardStyle, display: "grid", gap: "1rem" }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: "1rem",
            fontWeight: 800,
            color: pageColorTokens.textPrimary,
          }}
        >
          {t("pageSpeed.summaryTitle")}
        </h2>
        <p style={{ ...pageSpeedMutedTextStyle, margin: "0.35rem 0 0" }}>
          {t("pageSpeed.summarySubtitle")}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        {summary.cards.map((card) => (
          <div key={card.label} style={summaryCardStyle(card.tone)}>
            <span style={summaryCardLabelStyle}>{card.label}</span>
            <span style={summaryCardValueStyle}>{card.value}</span>
            <span style={summaryCardDetailStyle}>{card.detail}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.15fr) minmax(260px, 0.85fr)",
          gap: "1rem",
        }}
      >
        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={summarySectionTitleStyle}>{t("pageSpeed.summaryActions")}</div>
          {summary.actions.length > 0 ? (
            summary.actions.map((item) => (
              <div key={`${item.title}-${item.detail}`} style={summaryItemStyle}>
                <strong style={{ fontSize: "0.875rem", color: pageColorTokens.textPrimary }}>
                  {item.title}
                </strong>
                <span style={summaryCardDetailStyle}>{item.detail}</span>
              </div>
            ))
          ) : (
            <p style={{ ...pageSpeedMutedTextStyle, margin: 0 }}>{t("pageSpeed.summaryActionsEmpty")}</p>
          )}
        </div>

        <div style={{ display: "grid", gap: "0.65rem" }}>
          <div style={summarySectionTitleStyle}>{t("pageSpeed.summaryFacts")}</div>
          {summary.facts.map((item) => (
            <div key={item} style={summaryFactStyle}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const summaryCardStyle = (tone: SummaryTone): CSSProperties => ({
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${
    tone === "good"
      ? "#a7f3d0"
      : tone === "warning"
        ? "#fed7aa"
        : tone === "critical"
          ? "#fecaca"
          : pageColorTokens.borderSubtle
  }`,
  background:
    tone === "good"
      ? "#ecfdf5"
      : tone === "warning"
        ? "#fff7ed"
        : tone === "critical"
          ? "#fef2f2"
          : pageColorTokens.surfaceMuted,
  padding: "0.9rem",
  display: "grid",
  gap: "0.25rem",
});

const summaryCardLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: pageColorTokens.textSecondary,
};

const summaryCardValueStyle: CSSProperties = {
  fontSize: "1.15rem",
  lineHeight: 1.2,
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const summaryCardDetailStyle: CSSProperties = {
  fontSize: "0.8rem",
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const summarySectionTitleStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const summaryItemStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surfaceSubtle,
  padding: "0.8rem",
  display: "grid",
  gap: "0.25rem",
};

const summaryFactStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.surface,
  padding: "0.75rem 0.8rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textBody,
  lineHeight: 1.5,
};

function AnalyzeForm({
  url,
  strategy,
  reportLocale,
  analyzing,
  isMobile,
  hideUrlInput,
  hideLocaleInput,
  onUrlChange,
  onStrategyChange,
  onReportLocaleChange,
  onAnalyze,
}: {
  url: string;
  strategy: PageSpeedStrategy;
  reportLocale: PageSpeedLocaleCode;
  analyzing: boolean;
  isMobile: boolean;
  hideUrlInput: boolean;
  hideLocaleInput: boolean;
  onUrlChange: (value: string) => void;
  onStrategyChange: (value: PageSpeedStrategy) => void;
  onReportLocaleChange: (value: PageSpeedLocaleCode) => void;
  onAnalyze: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={pageSpeedCardStyle}>
      {hideUrlInput ? null : (
        <>
          <label
            htmlFor="page-speed-url"
            style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: pageColorTokens.textBody }}
          >
            {t("pageSpeed.urlLabel")}
          </label>
          <input
            id="page-speed-url"
            type="url"
            value={url}
            disabled={analyzing}
            placeholder={t("pageSpeed.urlPlaceholder")}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !analyzing) onAnalyze();
            }}
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.4rem",
              padding: "0.55rem 0.7rem",
              fontSize: "0.875rem",
              borderRadius: pageColorTokens.radiusControl,
              border: `1px solid ${pageColorTokens.borderInput}`,
              background: analyzing ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
              color: pageColorTokens.textBody,
              boxSizing: "border-box",
            }}
          />
        </>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: isMobile ? "stretch" : "flex-end",
          marginTop: hideUrlInput ? 0 : "0.85rem",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: pageColorTokens.textSecondary }}>
            {t("pageSpeed.strategyLabel")}
          </span>
          <SegmentedPageTabs
            activeTab={strategy}
            onTabChange={onStrategyChange}
            ariaLabel={t("pageSpeed.strategyLabel")}
            density="compact"
            items={[
              { key: "mobile", label: t("pageSpeed.strategyMobile") },
              { key: "desktop", label: t("pageSpeed.strategyDesktop") },
            ]}
          />
        </div>
        {hideLocaleInput ? null : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              minWidth: isMobile ? "100%" : "auto",
              flex: isMobile ? "1 1 100%" : "0 0 auto",
            }}
          >
            <label
              htmlFor="page-speed-locale"
              style={{ fontSize: "0.75rem", fontWeight: 600, color: pageColorTokens.textSecondary }}
            >
              {t("pageSpeed.reportLanguage")}
            </label>
            <select
              id="page-speed-locale"
              value={reportLocale}
              disabled={analyzing}
              onChange={(event) => onReportLocaleChange(event.target.value as PageSpeedLocaleCode)}
              style={{
                ...pageSelectCompactStyle(analyzing),
                flex: "none",
                width: isMobile ? "100%" : "auto",
                minWidth: isMobile ? "100%" : "10rem",
                maxWidth: isMobile ? "100%" : "14rem",
                padding: "0.55rem 0.7rem",
                fontSize: "0.875rem",
              }}
            >
              {PAGE_SPEED_LOCALES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.nativeLabel}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          disabled={analyzing || !url.trim()}
          onClick={onAnalyze}
          style={{
            border: "none",
            borderRadius: pageColorTokens.radiusControl,
            background: analyzing ? pageColorTokens.brandGreenDark : pageColorTokens.brandGreen,
            color: "#ffffff",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: analyzing ? "wait" : "pointer",
            opacity: analyzing || !url.trim() ? 0.7 : 1,
            alignSelf: isMobile ? "stretch" : "flex-end",
          }}
        >
          {analyzing ? t("pageSpeed.analyzingCta") : t("pageSpeed.analyze")}
        </button>
      </div>
    </div>
  );
}

function StatusBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        ...pageSpeedCardStyle,
        background: pageColorTokens.surfaceMuted,
        color: pageColorTokens.textSecondary,
        fontSize: "0.875rem",
      }}
    >
      {message}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        ...pageSpeedCardStyle,
        background: pageColorTokens.criticalBg,
        borderColor: pageColorTokens.critical,
        color: pageColorTokens.criticalText,
        fontSize: "0.875rem",
      }}
    >
      {message}
    </div>
  );
}
