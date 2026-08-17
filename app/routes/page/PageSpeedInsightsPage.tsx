import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useEmbeddedLocationSearch } from "../../hooks/useEmbeddedLocationSearch";
import { useFeatureView } from "../../lib/featureTrack";
import type {
  PageSpeedCategoryId,
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
} from "./pageUiStyles";
import type { PageSpeedSettingsLoaderData } from "../app.settings.pagespeed";

type AnalyzeFetcherData = PageSpeedResponse;

export function PageSpeedInsightsPage() {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const loaderData = useLoaderData<PageSpeedSettingsLoaderData>();
  const locationSearch = useEmbeddedLocationSearch();
  const fetcher = useFetcher<AnalyzeFetcherData>();
  useFeatureView("settings");

  const [url, setUrl] = useState(loaderData.defaultUrl);
  const [strategy, setStrategy] = useState<PageSpeedStrategy>("mobile");
  const [activeCategory, setActiveCategory] = useState<PageSpeedCategoryId>("performance");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const analyzing = fetcher.state !== "idle";
  const report = fetcher.data?.ok ? fetcher.data.report : null;

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      setErrorCode(null);
      setActiveCategory("performance");
      return;
    }
    setErrorCode(fetcher.data.errorCode);
  }, [fetcher.data]);

  const handleAnalyze = () => {
    setErrorCode(null);
    fetcher.submit(JSON.stringify({ url, strategy }), {
      method: "POST",
      action: `/api/pagespeed${locationSearch}`,
      encType: "application/json",
    });
  };

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <PageHeaderNav
        title={t("pageSpeed.title")}
        subtitle={t("pageSpeed.subtitle")}
        backLabel={t("settingsShell.back")}
        fallbackPath="/app/settings"
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <p style={{ ...pageSpeedMutedTextStyle, margin: 0 }}>{t("pageSpeed.hint")}</p>
        <AnalyzeForm
          url={url}
          strategy={strategy}
          analyzing={analyzing}
          isMobile={isMobile}
          onUrlChange={setUrl}
          onStrategyChange={setStrategy}
          onAnalyze={handleAnalyze}
        />
        {errorCode ? <ErrorBanner message={t(`pageSpeed.errors.${errorCode}`)} /> : null}
        {analyzing ? <StatusBanner message={t("pageSpeed.analyzing")} /> : null}
        {!analyzing && !report && !errorCode ? (
          <StatusBanner message={t("pageSpeed.empty")} />
        ) : null}
        {report ? (
          <>
            <PageSpeedScoreRow
              categories={report.categories}
              analyzedAt={report.fetchTime}
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

function AnalyzeForm({
  url,
  strategy,
  analyzing,
  isMobile,
  onUrlChange,
  onStrategyChange,
  onAnalyze,
}: {
  url: string;
  strategy: PageSpeedStrategy;
  analyzing: boolean;
  isMobile: boolean;
  onUrlChange: (value: string) => void;
  onStrategyChange: (value: PageSpeedStrategy) => void;
  onAnalyze: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={pageSpeedCardStyle}>
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
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          marginTop: "0.85rem",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
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
