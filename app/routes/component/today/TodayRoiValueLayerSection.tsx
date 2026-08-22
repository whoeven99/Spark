import { type CSSProperties } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import type { ValueLayerData } from "../../../server/operations/valueLayer.server";
import type { ShopCostConfigView } from "../../../server/operations/roi/costConfig.server";
import { SegmentedPageTabs } from "../shared/SegmentedPageTabs";
import {
  PageMetricCard,
  PageSurface,
  pageColorTokens,
  pageSectionMajorTitleStyle,
} from "../../page/pageUiStyles";

export const TODAY_ROI_COST_CONFIG_FETCHER_KEY = "today-roi-cost-config";

export type TodayRoiValueTab = "dimensions" | "customers" | "channels" | "cost";

export function TodayRoiValueLayerSection({
  value,
  valueLoading,
  valueFailed,
  isMobile,
  activeTab,
  onTabChange,
}: {
  value: ValueLayerData | null;
  valueLoading: boolean;
  valueFailed: boolean;
  isMobile: boolean;
  activeTab: TodayRoiValueTab;
  onTabChange: (tab: TodayRoiValueTab) => void;
}) {
  const { t } = useTranslation();
  const tabLabels: Record<TodayRoiValueTab, string> = {
    dimensions: t("todayRoi.tabs.dimensions"),
    customers: t("todayRoi.tabs.customers"),
    channels: t("todayRoi.tabs.channels"),
    cost: t("todayRoi.tabs.cost"),
  };
  const overviewMetrics = value ? buildOverviewMetrics(value, t) : [];

  return (
    <div style={sectionStackStyle}>
      <section>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <h2 style={pageSectionMajorTitleStyle}>{t("todayRoi.sectionTitle")}</h2>
          <p style={sectionDescriptionStyle}>
            {t("todayRoi.sectionDescription")}
          </p>
        </div>
      </section>

      <PageSurface
        title={t("todayRoi.surfaceTitle")}
        subtitle={t("todayRoi.surfaceSubtitle")}
      >
        <SegmentedPageTabs
          activeTab={activeTab}
          items={[
            { key: "dimensions", label: tabLabels.dimensions },
            { key: "customers", label: tabLabels.customers },
            { key: "channels", label: tabLabels.channels },
            { key: "cost", label: tabLabels.cost },
          ]}
          onTabChange={onTabChange}
          ariaLabel="ROI value layer tabs"
          mobileFullWidth
        />
      </PageSurface>

      {value ? (
        <>
          <PageSurface
            title={tabLabels[activeTab]}
            subtitle={t("todayRoi.valueSubtitle")}
          >
            <PageMetricCard metrics={overviewMetrics} />
          </PageSurface>
          <ValueLayerSections value={value} isMobile={isMobile} activeTab={activeTab} />
        </>
      ) : (
        <PageSurface title={t("todayRoi.statusTitle")}>
          <div style={pageEmptyStateStyle}>
            <span>
              {valueLoading
                ? t("todayRoi.valueLoading")
                : valueFailed
                  ? t("todayRoi.valueLoadFailed")
                  : t("todayRoi.valueUnavailable")}
            </span>
          </div>
        </PageSurface>
      )}
    </div>
  );
}

const valueTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.8125rem",
  background: pageColorTokens.surface,
};

const valueThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.5rem",
  color: pageColorTokens.textSecondary,
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const valueGroupThStyle: CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.5rem",
  color: pageColorTokens.textBody,
  borderBottom: `2px solid ${pageColorTokens.border}`,
  borderRight: `1px solid ${pageColorTokens.divider}`,
  fontWeight: 800,
  fontSize: "0.75rem",
  whiteSpace: "nowrap",
  background: pageColorTokens.surfaceMuted,
};

const groupHeadInnerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
};

const valueTdStyle: CSSProperties = {
  padding: "0.72rem 0.6rem",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const costInputStyle: CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: `1px solid ${pageColorTokens.borderInput}`,
  borderRadius: pageColorTokens.radiusControl,
  fontSize: "0.875rem",
};

const costLabelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  flex: "1 1 160px",
};

type DataSource = "real" | "estimated" | "pending";

const dataSourceTone: Record<DataSource, "success" | "warning" | "neutral"> = {
  real: "success",
  estimated: "warning",
  pending: "neutral",
};

function SourceTag({ source }: { source: DataSource }) {
  const { t } = useTranslation();
  const label =
    source === "real"
      ? t("todayRoi.sourceReal")
      : source === "estimated"
        ? t("todayRoi.sourceEstimated")
        : t("todayRoi.sourcePending");
  const tip =
    source === "real"
      ? t("todayRoi.sourceRealTip")
      : source === "estimated"
        ? t("todayRoi.sourceEstimatedTip")
        : t("todayRoi.sourcePendingTip");
  return (
    <s-badge tone={dataSourceTone[source]}>
      <span title={tip}>{label}</span>
    </s-badge>
  );
}

type ActionLens = {
  key: string;
  title: string;
  headline: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  source: DataSource;
  formula: string;
  insight: string;
  nextStep: string;
};

const PAID_CHANNEL_KEYS = new Set(["facebook", "instagram", "tiktok", "youtube", "pinterest", "x", "bing"]);

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)}`;
  }
}

function formatPercent(value: number, digits = 1): string {
  return `${Number(value.toFixed(digits))}%`;
}

function sumBy<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((total, item) => total + getter(item), 0);
}

function averageBy<T>(items: T[], getter: (item: T) => number): number {
  if (items.length === 0) return 0;
  return sumBy(items, getter) / items.length;
}

function buildOverviewMetrics(
  value: ValueLayerData,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const { channels, customers, costConfig } = value;
  const paidChannels = channels.channels.filter((channel) => PAID_CHANNEL_KEYS.has(channel.channelKey));
  const paidRevenue = sumBy(paidChannels, (channel) => channel.revenue);
  const discountCost = sumBy(channels.channels, (channel) => channel.discountCost);
  const paidRevenueShare = channels.totalRevenue > 0 ? (paidRevenue / channels.totalRevenue) * 100 : 0;

  return [
    {
      label: t("todayRoi.summaryPaidTraffic"),
      value: formatPercent(paidRevenueShare),
    },
    {
      label: t("todayRoi.summaryCouponCost"),
      value: formatCurrency(discountCost, channels.currency),
    },
    {
      label: t("todayRoi.summaryRepeatRate"),
      value: formatPercent(customers.repeatPurchaseRate),
    },
    {
      label: t("todayRoi.summaryMargin"),
      value: `${costConfig.defaultGrossMarginPercent}%`,
    },
  ];
}

function buildActionLenses(
  value: ValueLayerData,
  t: (key: string, options?: Record<string, unknown>) => string,
): ActionLens[] {
  const { channels, customers } = value;
  const paidChannels = channels.channels.filter((channel) => PAID_CHANNEL_KEYS.has(channel.channelKey));
  const paidRevenue = sumBy(paidChannels, (channel) => channel.revenue);
  const paidProfit = sumBy(paidChannels, (channel) => channel.contributionProfit);
  const paidShare = channels.totalRevenue > 0 ? (paidRevenue / channels.totalRevenue) * 100 : 0;
  const discountCost = sumBy(channels.channels, (channel) => channel.discountCost);
  const discountRate = channels.totalRevenue > 0 ? (discountCost / channels.totalRevenue) * 100 : 0;
  const topChannel = [...channels.channels].sort((left, right) => right.contributionProfit - left.contributionProfit)[0] ?? null;
  const lowMarginChannel =
    [...channels.channels]
      .filter((channel) => channel.contributionMarginPercent !== null)
      .sort((left, right) => (left.contributionMarginPercent ?? 0) - (right.contributionMarginPercent ?? 0))[0] ?? null;
  const repeatDrivenChannels = channels.channels.filter((channel) => channel.customers.repeatCustomerShare >= 35);
  const averageRepeatShare = averageBy(repeatDrivenChannels, (channel) => channel.customers.repeatCustomerShare);
  const repeatValue = customers.averageDynamicLtv;
  const customerHealthTone =
    customers.highValueShare >= 30 && customers.segmentCounts.at_risk <= customers.segmentCounts.vip
      ? "success"
      : "warning";

  return [
    {
      key: "paid-traffic",
      title: t("todayRoi.lenses.paidTraffic.title"),
      headline:
        paidChannels.length > 0
          ? t("todayRoi.lenses.paidTraffic.headlineReady", {
              share: formatPercent(paidShare),
              profit: formatCurrency(paidProfit, channels.currency),
            })
          : t("todayRoi.lenses.paidTraffic.headlinePending"),
      statusLabel: t("todayRoi.lenses.paidTraffic.status"),
      statusTone: paidChannels.length > 0 ? "warning" : "neutral",
      source: paidChannels.length > 0 ? "estimated" : "pending",
      formula: t("todayRoi.lenses.paidTraffic.formula"),
      insight:
        paidChannels.length > 0
          ? t("todayRoi.lenses.paidTraffic.insightReady", {
              count: paidChannels.length,
              share: formatPercent(paidShare),
            })
          : t("todayRoi.lenses.paidTraffic.insightPending"),
      nextStep: t("todayRoi.lenses.paidTraffic.nextStep"),
    },
    {
      key: "coupon",
      title: t("todayRoi.lenses.coupon.title"),
      headline: t("todayRoi.lenses.coupon.headline", {
        cost: formatCurrency(discountCost, channels.currency),
        rate: formatPercent(discountRate),
      }),
      statusLabel: t("todayRoi.lenses.coupon.status"),
      statusTone: discountCost > 0 ? "warning" : "neutral",
      source: discountCost > 0 ? "estimated" : "pending",
      formula: t("todayRoi.lenses.coupon.formula"),
      insight: t("todayRoi.lenses.coupon.insight", {
        discountSensitive: customers.tagCounts.discount_sensitive,
      }),
      nextStep: t("todayRoi.lenses.coupon.nextStep"),
    },
    {
      key: "customer-value",
      title: t("todayRoi.lenses.customerValue.title"),
      headline: t("todayRoi.lenses.customerValue.headline", {
        highValueShare: formatPercent(customers.highValueShare),
        score: customers.averageScore,
      }),
      statusLabel: t("todayRoi.lenses.customerValue.status"),
      statusTone: customerHealthTone,
      source: "estimated",
      formula: t("todayRoi.lenses.customerValue.formula"),
      insight: t("todayRoi.lenses.customerValue.insight", {
        vip: customers.segmentCounts.vip,
        atRisk: customers.segmentCounts.at_risk,
        ltv: formatCurrency(customers.averageDynamicLtv, channels.currency),
      }),
      nextStep: t("todayRoi.lenses.customerValue.nextStep"),
    },
    {
      key: "repeat",
      title: t("todayRoi.lenses.repeat.title"),
      headline: t("todayRoi.lenses.repeat.headline", {
        repeatRate: formatPercent(customers.repeatPurchaseRate),
        ltv: formatCurrency(repeatValue, channels.currency),
      }),
      statusLabel: t("todayRoi.lenses.repeat.status"),
      statusTone: customers.repeatPurchaseRate >= 25 ? "success" : "warning",
      source: "estimated",
      formula: t("todayRoi.lenses.repeat.formula"),
      insight:
        repeatDrivenChannels.length > 0
          ? t("todayRoi.lenses.repeat.insightReady", {
              count: repeatDrivenChannels.length,
              share: formatPercent(averageRepeatShare),
            })
          : t("todayRoi.lenses.repeat.insightPending"),
      nextStep: t("todayRoi.lenses.repeat.nextStep"),
    },
    {
      key: "mix",
      title: t("todayRoi.lenses.mix.title"),
      headline:
        topChannel && lowMarginChannel
          ? t("todayRoi.lenses.mix.headlineReady", {
              top: topChannel.label,
              low: lowMarginChannel.label,
            })
          : t("todayRoi.lenses.mix.headlinePending"),
      statusLabel: t("todayRoi.lenses.mix.status"),
      statusTone: topChannel ? "success" : "neutral",
      source: topChannel ? "estimated" : "pending",
      formula: t("todayRoi.lenses.mix.formula"),
      insight:
        topChannel && lowMarginChannel
          ? t("todayRoi.lenses.mix.insightReady", {
              topProfit: formatCurrency(topChannel.contributionProfit, channels.currency),
              lowMargin:
                lowMarginChannel.contributionMarginPercent === null
                  ? "—"
                  : formatPercent(lowMarginChannel.contributionMarginPercent),
            })
          : t("todayRoi.lenses.mix.insightPending"),
      nextStep: t("todayRoi.lenses.mix.nextStep"),
    },
  ];
}

function ActionRoiDimensionsSection({ value }: { value: ValueLayerData }) {
  const { t } = useTranslation();
  const lenses = buildActionLenses(value, t);

  return (
    <PageSurface
      title={t("todayRoi.dimensionsTitle")}
      subtitle={t("todayRoi.dimensionsSubtitle")}
    >
      <div style={dimensionGridStyle}>
        {lenses.map((lens) => (
          <div key={lens.key} style={dimensionCardStyle}>
            <div style={dimensionHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                <h4 style={dimensionTitleStyle}>{lens.title}</h4>
                <s-badge tone={lens.statusTone}>{lens.statusLabel}</s-badge>
                <SourceTag source={lens.source} />
              </div>
              <div style={dimensionHeadlineStyle}>{lens.headline}</div>
            </div>

            <div style={dimensionMetaGridStyle}>
              <div style={dimensionMetaItemStyle}>
                <div style={dimensionMetaLabelStyle}>{t("todayRoi.dimensionFormulaLabel")}</div>
                <div style={dimensionMetaValueStyle}>{lens.formula}</div>
              </div>
              <div style={dimensionMetaItemStyle}>
                <div style={dimensionMetaLabelStyle}>{t("todayRoi.dimensionInsightLabel")}</div>
                <div style={dimensionMetaValueStyle}>{lens.insight}</div>
              </div>
              <div style={dimensionMetaItemStyle}>
                <div style={dimensionMetaLabelStyle}>{t("todayRoi.dimensionNextStepLabel")}</div>
                <div style={dimensionMetaValueStyle}>{lens.nextStep}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function ValueLayerSections({
  value,
  isMobile,
  activeTab = "dimensions",
}: {
  value: ValueLayerData;
  isMobile: boolean;
  activeTab?: TodayRoiValueTab;
}) {
  const { t } = useTranslation();
  const { customers, channels } = value;
  const seg = customers.segmentCounts;

  return (
    <>
      {activeTab === "dimensions" ? <ActionRoiDimensionsSection value={value} /> : null}

      {activeTab === "dimensions" || activeTab === "customers" ? (
        <PageSurface
          title={t("todayRoi.customerTitle")}
          subtitle={t("todayRoi.customerSubtitle", {
            total: customers.payingCustomers,
          })}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <SourceTag source="estimated" />
          </div>
          <div style={valueCardSectionStyle}>
            <PageMetricCard
              metrics={[
                { label: t("todayRoi.metricRepeatRate"), value: `${customers.repeatPurchaseRate}%` },
                { label: t("todayRoi.metricAvgScore"), value: String(customers.averageScore) },
                { label: t("todayRoi.metricHighValueShare"), value: `${customers.highValueShare}%` },
                {
                  label: t("todayRoi.metricAvgLtv"),
                  value: String(customers.averageDynamicLtv),
                  unit: channels.currency,
                },
              ]}
            />
            <div style={customerTagWrapStyle}>
              <s-badge tone="info">{t("todayRoi.segmentNew")}: {seg.new}</s-badge>
              <s-badge tone="success">{t("todayRoi.segmentActive")}: {seg.active}</s-badge>
              <s-badge tone="success">{t("todayRoi.segmentVip")}: {seg.vip}</s-badge>
              <s-badge tone="warning">{t("todayRoi.segmentAtRisk")}: {seg.at_risk}</s-badge>
              <s-badge>{t("todayRoi.segmentChurned")}: {seg.churned}</s-badge>
              <s-badge tone="critical">{t("todayRoi.tagRefundRisk")}: {customers.tagCounts.refund_risk}</s-badge>
              <s-badge tone="warning">
                {t("todayRoi.tagDiscountSensitive")}: {customers.tagCounts.discount_sensitive}
              </s-badge>
            </div>
          </div>
        </PageSurface>
      ) : null}

      {activeTab === "dimensions" || activeTab === "channels" ? (
        <PageSurface
          title={t("todayRoi.channelTitle", { days: channels.windowDays })}
          subtitle={t("todayRoi.channelSubtitle", {
            share: channels.attributedRevenueShare,
          })}
        >
          {channels.channels.length === 0 ? (
            <p style={taskSecondaryTextStyle}>{t("todayRoi.noChannelData")}</p>
          ) : (
            <div style={channelTableWrapStyle}>
              <table style={valueTableStyle}>
                <thead>
                  <tr>
                    <th style={valueGroupThStyle} colSpan={2}>{t("todayRoi.groupBasic")}</th>
                    <th style={valueGroupThStyle} colSpan={1}>
                      <span style={groupHeadInnerStyle}>{t("todayRoi.layerRevenue")} <SourceTag source="real" /></span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={2}>
                      <span style={groupHeadInnerStyle}>{t("todayRoi.layerProfit")} <SourceTag source="estimated" /></span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={3}>
                      <span style={groupHeadInnerStyle}>{t("todayRoi.groupCustomerQuality")} <SourceTag source="estimated" /></span>
                    </th>
                    <th style={valueGroupThStyle} colSpan={1}>
                      <span style={groupHeadInnerStyle}>{t("todayRoi.layerInvestment")} <SourceTag source="pending" /></span>
                    </th>
                  </tr>
                  <tr>
                    <th style={valueThStyle}>{t("todayRoi.colChannel")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colOrders")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colRevenue")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colProfit")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colMargin")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colNewShare")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colRepeatShare")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colScore")}</th>
                    <th style={valueThStyle}>{t("todayRoi.colRoi")}</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.channels.map((channel) => (
                    <tr key={channel.channelKey}>
                      <td style={{ ...valueTdStyle, fontWeight: 700 }}>{channel.label}</td>
                      <td style={valueTdStyle}>{channel.orderCount}</td>
                      <td style={valueTdStyle}>{channel.revenue} {channels.currency}</td>
                      <td
                        style={{
                          ...valueTdStyle,
                          color:
                            channel.contributionProfit >= 0
                              ? pageColorTokens.brandGreen
                              : pageColorTokens.critical,
                          fontWeight: 700,
                        }}
                      >
                        {channel.contributionProfit}
                      </td>
                      <td style={valueTdStyle}>
                        {channel.contributionMarginPercent === null ? "—" : `${channel.contributionMarginPercent}%`}
                      </td>
                      <td style={valueTdStyle}>{channel.customers.newOrderShare}%</td>
                      <td style={valueTdStyle}>{channel.customers.repeatCustomerShare}%</td>
                      <td style={valueTdStyle}>{channel.customers.averageCustomerValueScore ?? "—"}</td>
                      <td style={valueTdStyle}>
                        <s-badge tone="neutral">{t("todayRoi.roiPendingAds")}</s-badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={caveatPanelStyle}>
            {channels.caveats.map((line, index) => (
              <p key={index} style={{ ...taskSecondaryTextStyle, fontSize: "0.75rem" }}>
                * {line}
              </p>
            ))}
          </div>
        </PageSurface>
      ) : null}

      {activeTab === "dimensions" || activeTab === "cost" ? (
        <CostConfigCard costConfig={value.costConfig} isMobile={isMobile} />
      ) : null}
    </>
  );
}

function CostConfigCard({
  costConfig,
  isMobile,
}: {
  costConfig: ShopCostConfigView;
  isMobile: boolean;
}) {
  const { t } = useTranslation();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>({
    key: TODAY_ROI_COST_CONFIG_FETCHER_KEY,
  });
  const saving = fetcher.state !== "idle";

  return (
    <PageSurface title={t("todayRoi.costTitle")} subtitle={t("todayRoi.costSubtitle")}>
      <fetcher.Form method="post" action="/app/today/roi">
        <input type="hidden" name="intent" value="cost-config" />
        <div
          style={{
            ...costFormWrapStyle,
            display: "flex",
            flexWrap: "wrap",
            gap: "0.9rem",
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "flex-end",
          }}
        >
          <label style={costLabelStyle}>
            {t("todayRoi.costMargin")}
            <input
              style={costInputStyle}
              type="number"
              name="defaultGrossMarginPercent"
              step="0.1"
              min="0"
              max="100"
              defaultValue={costConfig.defaultGrossMarginPercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("todayRoi.costFeePercent")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeePercent"
              step="0.1"
              min="0"
              max="20"
              defaultValue={costConfig.paymentFeePercent}
            />
          </label>
          <label style={costLabelStyle}>
            {t("todayRoi.costFeeFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="paymentFeeFixed"
              step="0.01"
              min="0"
              max="100"
              defaultValue={costConfig.paymentFeeFixed}
            />
          </label>
          <label style={costLabelStyle}>
            {t("todayRoi.costMonthlyFixed")}
            <input
              style={costInputStyle}
              type="number"
              name="monthlyFixedCost"
              step="1"
              min="0"
              defaultValue={costConfig.monthlyFixedCost}
            />
          </label>
          <button type="submit" style={saveButtonStyle} disabled={saving}>
            {saving ? t("todayRoi.costSaving") : t("todayRoi.costSave")}
          </button>
        </div>
      </fetcher.Form>
      <p style={{ ...taskSecondaryTextStyle, marginTop: "0.75rem" }}>
        {t("todayRoi.costDefaultHint")}
      </p>
      {fetcher.data?.ok === false ? (
        <p style={{ ...taskSecondaryTextStyle, color: pageColorTokens.critical }}>
          {fetcher.data.error ?? "保存失败"}
        </p>
      ) : null}
    </PageSurface>
  );
}

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  color: pageColorTokens.textSecondary,
  fontSize: "0.875rem",
  lineHeight: 1.6,
};

const pageEmptyStateStyle: CSSProperties = {
  minHeight: 120,
  border: `1px dashed ${pageColorTokens.borderInput}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surfaceSubtle,
  color: pageColorTokens.textSecondary,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  textAlign: "center",
};

const taskSecondaryTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.55,
};

const channelTableWrapStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const customerTagWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
};

const caveatPanelStyle: CSSProperties = {
  marginTop: "0.75rem",
  display: "grid",
  gap: "0.35rem",
};

const valueCardSectionStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const dimensionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "0.9rem",
};

const dimensionCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  padding: "1rem",
  borderRadius: pageColorTokens.radiusCard,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const dimensionHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
};

const dimensionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.9rem",
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const dimensionHeadlineStyle: CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 700,
  lineHeight: 1.5,
  color: pageColorTokens.textBody,
};

const dimensionMetaGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const dimensionMetaItemStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
};

const dimensionMetaLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const dimensionMetaValueStyle: CSSProperties = {
  fontSize: "0.8125rem",
  lineHeight: 1.55,
  color: pageColorTokens.textBody,
};

const costFormWrapStyle: CSSProperties = {
  marginTop: "0.25rem",
};

const saveButtonStyle: CSSProperties = {
  minHeight: 40,
  padding: "0.65rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.brandBlue}`,
  background: pageColorTokens.brandBlue,
  color: "#ffffff",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
};
