import type { CSSProperties } from "react";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { useEmbeddedNavigate } from "../../hooks/useEmbeddedNavigate";
import { useFeatureView } from "../../lib/featureTrack";
import {
  DestinationFilterBar,
  DestinationPage,
} from "../component/shared/DestinationPage";
import { DialogShell } from "../component/shared/DialogShell";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import {
  ShopifyReportsChart,
  ShopifyReportsTable,
} from "../component/shopifyReports/ShopifyReportsVisuals";
import {
  formatReportCell,
  readNumericCell,
  REPORT_RANGES,
  REPORT_TABS,
  type RangeKey,
  type ReportQueryResult,
  type ReportTab,
  type ShopifyReportsPageData,
} from "../../lib/shopifyReports";
import {
  PageMetricCard,
  PageSurface,
  formErrorBoxStyle,
  mobilePageContentStyle,
  pageColorTokens,
  pageContentStyle,
  pageEmptyStateStyle,
  pageHintTextStyle,
} from "./pageUiStyles";

const TAB_LABEL_KEYS: Record<ReportTab, string> = {
  sales: "shopifyReports.tabSales",
  refunds: "shopifyReports.tabRefunds",
  profit: "shopifyReports.tabProfit",
  customers: "shopifyReports.tabCustomers",
  inventory: "shopifyReports.tabInventory",
  fulfillment: "shopifyReports.tabFulfillment",
  storefront: "shopifyReports.tabStorefront",
};

const RANGE_LABEL_KEYS: Record<RangeKey, string> = {
  "7d": "shopifyReports.range7d",
  "30d": "shopifyReports.range30d",
  "90d": "shopifyReports.range90d",
  "365d": "shopifyReports.range365d",
};

const FUNNEL_KEYS = [
  "sessions",
  "sessions_with_cart_additions",
  "sessions_that_reached_checkout",
  "sessions_that_completed_checkout",
] as const;

function buildReportsPath(tab: ReportTab, range: RangeKey): string {
  return `/app/settings/shopify-reports?tab=${tab}&range=${range}`;
}

function QueryToolbar({
  query,
  onOpen,
}: {
  query: string;
  onOpen: (query: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen(query)}
      style={queryButtonStyle}
    >
      {t("shopifyReports.viewQuery")}
    </button>
  );
}

export function ShopifyReportsPage() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useResponsiveLayout();
  const navigate = useEmbeddedNavigate();
  const data = useLoaderData<ShopifyReportsPageData>();
  useFeatureView("settings");

  const [queryPreview, setQueryPreview] = useState<string | null>(null);
  const tab = data.tab;
  const range = data.range;

  const summaries = data.queries.filter((item) => item.kind === "summary");
  const trends = data.queries.filter((item) => item.kind === "timeseries");
  const tables = data.queries.filter((item) => item.kind === "table");

  return (
    <div style={isMobile ? mobilePageContentStyle : pageContentStyle}>
      <DestinationPage
        title={t("shopifyReports.pageTitle")}
        subtitle={t("shopifyReports.pageSubtitle")}
        titleBarTitle={t("shopifyReports.pageTitle")}
        backLabel={t("shopifyReports.back")}
        fallbackPath="/app/settings"
        isMobile={isMobile}
      >
        <DestinationFilterBar
          label={t("shopifyReports.rangeLabel")}
          items={REPORT_RANGES.map((key) => ({ key, label: t(RANGE_LABEL_KEYS[key]) }))}
          active={range}
          onChange={(next) => navigate(buildReportsPath(tab, next))}
        />

        {data.ianaTimezone || data.currencyCode ? (
          <p style={{ ...pageHintTextStyle, marginTop: 0 }}>
            {t("shopifyReports.timezoneHint", {
              timezone: data.ianaTimezone || "—",
              currency: data.currencyCode || "—",
            })}
          </p>
        ) : null}

        <SegmentedPageTabs
          activeTab={tab}
          items={REPORT_TABS.map((key) => ({ key, label: t(TAB_LABEL_KEYS[key]) }))}
          ariaLabel={t("shopifyReports.pageTitle")}
          density="compact"
          mobileFullWidth={isMobile}
          onTabChange={(next) => navigate(buildReportsPath(next, range))}
        />

        {data.access === "missing_scope" ? (
          <AccessEmpty
            title={t("shopifyReports.missingScopeTitle")}
            body={t("shopifyReports.missingScopeBody")}
          />
        ) : null}
        {data.access === "access_denied" ? (
          <AccessEmpty
            title={t("shopifyReports.accessDeniedTitle")}
            body={t("shopifyReports.accessDeniedBody")}
          />
        ) : null}

        {data.access === "ok" ? (
          <>
            {summaries.map((summary) => (
              <SummaryCard
                key={summary.id}
                result={summary}
                locale={i18n.language}
                currencyCode={data.currencyCode}
              />
            ))}
            {tab === "storefront" ? (
              <StorefrontFunnel result={summaries[0]} locale={i18n.language} />
            ) : null}
            {trends.map((trend) => (
              <QuerySection
                key={trend.id}
                result={trend}
                emptyLabel={t("shopifyReports.emptyTrend")}
                locale={i18n.language}
                currencyCode={data.currencyCode}
                onOpenQuery={setQueryPreview}
                visual="chart"
              />
            ))}
            {tables.map((table) => (
              <QuerySection
                key={table.id}
                result={table}
                emptyLabel={t("shopifyReports.emptyTable")}
                locale={i18n.language}
                currencyCode={data.currencyCode}
                onOpenQuery={setQueryPreview}
                visual="table"
              />
            ))}
            {tab === "profit" ? <p style={pageHintTextStyle}>{t("shopifyReports.profitHint")}</p> : null}
            <p style={pageHintTextStyle}>{t("shopifyReports.footerNote")}</p>
          </>
        ) : null}
      </DestinationPage>

      <DialogShell
        open={Boolean(queryPreview)}
        onClose={() => setQueryPreview(null)}
        width={640}
        title={t("shopifyReports.queryDialogTitle")}
        footer={
          <button type="button" onClick={() => setQueryPreview(null)} style={queryButtonStyle}>
            {t("shopifyReports.queryDialogClose")}
          </button>
        }
      >
        <pre style={queryPreStyle}>{queryPreview}</pre>
      </DialogShell>
    </div>
  );
}

function AccessEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div style={pageEmptyStateStyle}>
      <strong style={{ color: pageColorTokens.textPrimary }}>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function SummaryCard({
  result,
  locale,
  currencyCode,
}: {
  result: ReportQueryResult | undefined;
  locale: string;
  currencyCode: string | null;
}) {
  const { t } = useTranslation();
  if (!result) return null;
  if (result.error) {
    return <div style={formErrorBoxStyle}>{result.error}</div>;
  }
  const row = result.rows[0];
  if (!row) {
    return <div style={pageEmptyStateStyle}>{t("shopifyReports.emptyTitle")}</div>;
  }
  const metrics = result.columns
    .filter((column) => column.name !== result.xKey)
    .map((column) => ({
      label: column.displayName || column.name,
      value: formatReportCell(row[column.name] ?? null, column.dataType, { locale, currencyCode }),
    }));
  return <PageMetricCard metrics={metrics} footer={t("shopifyReports.sourceHint")} />;
}

function QuerySection({
  result,
  emptyLabel,
  locale,
  currencyCode,
  onOpenQuery,
  visual,
}: {
  result: ReportQueryResult | undefined;
  emptyLabel: string;
  locale: string;
  currencyCode: string | null;
  onOpenQuery: (query: string) => void;
  visual: "chart" | "table";
}) {
  const { t } = useTranslation();
  if (!result) return null;
  return (
    <PageSurface title={t(result.titleKey)}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <QueryToolbar query={result.query} onOpen={onOpenQuery} />
      </div>
      {result.error ? <div style={formErrorBoxStyle}>{result.error}</div> : null}
      {!result.error && result.rows.length === 0 ? (
        <div style={pageEmptyStateStyle}>{emptyLabel}</div>
      ) : null}
      {!result.error && result.rows.length > 0 && visual === "chart" ? (
        <ShopifyReportsChart result={result} locale={locale} currencyCode={currencyCode} />
      ) : null}
      {!result.error && result.rows.length > 0 && visual === "table" ? (
        <ShopifyReportsTable result={result} locale={locale} currencyCode={currencyCode} />
      ) : null}
    </PageSurface>
  );
}

function StorefrontFunnel({
  result,
  locale,
}: {
  result: ReportQueryResult | undefined;
  locale: string;
}) {
  const { t } = useTranslation();
  const row = result?.rows[0];
  if (!row || result?.error) return null;
  const values = FUNNEL_KEYS.map((key) => readNumericCell(row, key) ?? 0);
  const max = Math.max(...values, 1);
  const labels: Record<(typeof FUNNEL_KEYS)[number], string> = {
    sessions: t("shopifyReports.funnelSessions"),
    sessions_with_cart_additions: t("shopifyReports.funnelCart"),
    sessions_that_reached_checkout: t("shopifyReports.funnelCheckout"),
    sessions_that_completed_checkout: t("shopifyReports.funnelCompleted"),
  };
  return (
    <PageSurface title={t("shopifyReports.funnelTitle")} subtitle={t("shopifyReports.funnelHint")}>
      <div style={{ display: "grid", gap: 10 }}>
        {FUNNEL_KEYS.map((key, index) => (
          <div key={key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span>{labels[key]}</span>
              <span>{values[index]?.toLocaleString(locale)}</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: pageColorTokens.surfaceMuted }}>
              <div
                style={{
                  width: `${((values[index] ?? 0) / max) * 100}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: pageColorTokens.brandBlue,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

const queryButtonStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.brandBlue,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.4rem 0.75rem",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const queryPreStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 12,
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
  background: pageColorTokens.surfaceMuted,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: pageColorTokens.radiusControl,
  padding: "0.85rem 1rem",
};
