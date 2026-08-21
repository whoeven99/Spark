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

export type TodayRoiValueTab = "framework" | "customers" | "channels" | "cost";

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
    framework: t("todayRoi.tabs.framework"),
    customers: t("todayRoi.tabs.customers"),
    channels: t("todayRoi.tabs.channels"),
    cost: t("todayRoi.tabs.cost"),
  };

  return (
    <div style={sectionStackStyle}>
      <section>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <h2 style={pageSectionMajorTitleStyle}>价值层</h2>
          <p style={sectionDescriptionStyle}>
            ROI 页里的价值层统一承接客户价值、渠道表现和成本口径，不再挂在 diagnosis 兼容页下。
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
            { key: "framework", label: tabLabels.framework },
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
            <PageMetricCard
              metrics={[
                {
                  label: t("todayRoi.customerTitle"),
                  value: `${value.customers.averageDynamicLtv} ${value.channels.currency}`,
                  unit: "",
                },
                {
                  label: t("todayRoi.channelTitle", { days: value.channels.windowDays }),
                  value: String(value.channels.channels.length),
                },
                {
                  label: t("todayRoi.costTitle"),
                  value: `${value.costConfig.defaultGrossMarginPercent}%`,
                },
              ]}
            />
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

const layerCardStyle = (accent: string): CSSProperties => ({
  flex: "1 1 200px",
  border: `1px solid ${pageColorTokens.border}`,
  borderTop: `3px solid ${accent}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: "0.85rem 0.95rem",
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: "0.45rem",
});

const layerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 800,
  color: pageColorTokens.textBody,
};

function LayerLegend() {
  const { t } = useTranslation();
  const layers: Array<{ accent: string; title: string; desc: string; source: DataSource }> = [
    {
      accent: pageColorTokens.brandGreen,
      title: t("todayRoi.layerRevenue"),
      desc: t("todayRoi.layerRevenueDesc"),
      source: "real",
    },
    {
      accent: pageColorTokens.progress,
      title: t("todayRoi.layerProfit"),
      desc: t("todayRoi.layerProfitDesc"),
      source: "estimated",
    },
    {
      accent: pageColorTokens.neutralStatus,
      title: t("todayRoi.layerInvestment"),
      desc: t("todayRoi.layerInvestmentDesc"),
      source: "pending",
    },
  ];
  return (
    <PageSurface title={t("todayRoi.layerLegendTitle")}>
      <p style={{ ...taskSecondaryTextStyle, marginTop: 0, marginBottom: "0.75rem" }}>
        {t("todayRoi.layerLegendIntro")}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
        {layers.map((layer) => (
          <div key={layer.title} style={layerCardStyle(layer.accent)}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <h4 style={layerTitleStyle}>{layer.title}</h4>
              <SourceTag source={layer.source} />
            </div>
            <p style={{ ...taskSecondaryTextStyle, margin: 0 }}>{layer.desc}</p>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function InvestmentLayerCard() {
  const { t } = useTranslation();
  const items = [
    t("todayRoi.investmentAdSpend"),
    t("todayRoi.investmentSeoCost"),
    t("todayRoi.investmentToolCost"),
  ];
  return (
    <PageSurface
      title={t("todayRoi.investmentTitle")}
      subtitle={t("todayRoi.investmentSubtitle")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <SourceTag source="pending" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.75rem",
              border: `1px dashed ${pageColorTokens.border}`,
              borderRadius: pageColorTokens.radiusControl,
              fontSize: "0.8125rem",
              color: pageColorTokens.textSecondary,
              background: pageColorTokens.surfaceMuted,
            }}
          >
            <span>{item}</span>
            <s-badge tone="neutral">{t("todayRoi.investmentNotConnected")}</s-badge>
          </div>
        ))}
      </div>
    </PageSurface>
  );
}

function ValueLayerSections({
  value,
  isMobile,
  activeTab = "framework",
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
      {activeTab === "framework" ? <LayerLegend /> : null}

      {activeTab === "framework" || activeTab === "customers" ? (
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

      {activeTab === "framework" || activeTab === "channels" ? (
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

      {activeTab === "framework" ? <InvestmentLayerCard /> : null}
      {activeTab === "framework" || activeTab === "cost" ? (
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
