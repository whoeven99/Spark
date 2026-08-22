import { useState, type CSSProperties } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import type { ValueLayerData } from "../../../server/operations/valueLayer.server";
import type { ShopCostConfigView } from "../../../server/operations/roi/costConfig.server";
import {
  PageMetricCard,
  PageSurface,
  pageColorTokens,
  type PageMetricItem,
} from "../../page/pageUiStyles";

export const TODAY_ROI_COST_CONFIG_FETCHER_KEY = "today-roi-cost-config";

type DataSource = "real" | "estimated" | "pending";

type InsightCard = {
  key: string;
  title: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  source: DataSource;
  metrics: PageMetricItem[];
  conclusion: string;
};

const PAID_CHANNEL_KEYS = new Set(["facebook", "instagram", "tiktok", "youtube", "pinterest", "x", "bing"]);

export function TodayRoiValueLayerSection({
  value,
  valueLoading,
  valueFailed,
  isMobile,
  focus = "roi",
}: {
  value: ValueLayerData | null;
  valueLoading: boolean;
  valueFailed: boolean;
  isMobile: boolean;
  focus?: "roi" | "channels" | "loss" | "layers";
}) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!value) {
    return (
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
    );
  }

  const cards = buildInsightCards(value, t);

  return (
    <div style={sectionStackStyle}>
      <PageSurface
        title={t("todayRoi.settingsTitle")}
        subtitle={
          focus === "layers"
            ? "当前焦点在价值层。先确认口径和成本设置，再往下看客户价值、复购和渠道结构。"
            : t("todayRoi.settingsSubtitle")
        }
      >
        <RoiSettingsSummary
          value={value}
          isMobile={isMobile}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((current) => !current)}
        />
        {settingsOpen ? <CostConfigPanel costConfig={value.costConfig} isMobile={isMobile} /> : null}
      </PageSurface>

      <div style={cardListStyle}>
        {cards.map((card) => (
          <PageSurface key={card.key} title={card.title}>
            <div style={cardFocusWrapStyle(resolveCardHighlight(card.key, focus))}>
            <div style={cardBadgeRowStyle}>
              <span style={badgeStyle(card.statusTone)}>{card.statusLabel}</span>
              <SourceTag source={card.source} />
            </div>
            <PageMetricCard metrics={card.metrics} />
            <div style={conclusionBlockStyle}>
              <div style={conclusionLabelStyle}>{t("todayRoi.conclusionLabel")}</div>
              <p style={conclusionTextStyle}>{card.conclusion}</p>
            </div>
            </div>
          </PageSurface>
        ))}
      </div>
    </div>
  );
}

function resolveCardHighlight(
  cardKey: string,
  focus: "roi" | "channels" | "loss" | "layers",
): boolean {
  if (focus === "layers") {
    return cardKey === "customer-value" || cardKey === "repeat" || cardKey === "mix";
  }
  if (focus === "channels") {
    return cardKey === "paid-traffic" || cardKey === "mix";
  }
  if (focus === "loss") {
    return cardKey === "coupon" || cardKey === "paid-traffic";
  }
  return false;
}

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
    <span style={badgeStyle(dataSourceTone[source])} title={tip}>
      {label}
    </span>
  );
}

function RoiSettingsSummary({
  value,
  isMobile,
  settingsOpen,
  onToggleSettings,
}: {
  value: ValueLayerData;
  isMobile: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const { t } = useTranslation();
  const { channels, costConfig, scope } = value;

  return (
    <div style={settingsGridStyle(isMobile)}>
      <div style={settingsTileStyle}>
        <div style={settingsTileLabelStyle}>{t("todayRoi.settingChannelTitle")}</div>
        <div style={settingsTileValueRowStyle}>
          <div style={settingsTileValueStyle}>
            {t("todayRoi.settingChannelValue", { count: channels.channels.length })}
          </div>
        </div>
        <div style={settingsTileHintStyle}>
          {t("todayRoi.settingChannelHint", { share: channels.attributedRevenueShare })}
        </div>
        <div style={settingsTileHintStyle}>{scope.summary}</div>
        {scope.notes.map((note) => (
          <div key={note} style={settingsTileHintStyle}>
            {note}
          </div>
        ))}
      </div>

      <div style={settingsTileStyle}>
        <div style={settingsTileLabelStyle}>{t("todayRoi.settingCostTitle")}</div>
        <div style={settingsTileValueRowStyle}>
          <div style={settingsTileValueStyle}>{costConfig.defaultGrossMarginPercent}%</div>
          <button type="button" style={settingsButtonStyle} onClick={onToggleSettings}>
            {settingsOpen ? t("todayRoi.settingClose") : t("todayRoi.settingOpen")}
          </button>
        </div>
        <div style={settingsTileHintStyle}>
          {t("todayRoi.settingCostHint", {
            feePercent: costConfig.paymentFeePercent,
            feeFixed: costConfig.paymentFeeFixed,
          })}
        </div>
      </div>
    </div>
  );
}

function CostConfigPanel({
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
    <div style={settingsPanelStyle}>
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
      <p style={{ ...secondaryTextStyle, marginTop: "0.75rem" }}>
        {t("todayRoi.costDefaultHint")}
      </p>
      {fetcher.data?.ok === false ? (
        <p style={{ ...secondaryTextStyle, color: pageColorTokens.critical }}>
          {fetcher.data.error ?? "保存失败"}
        </p>
      ) : null}
    </div>
  );
}

function buildInsightCards(
  value: ValueLayerData,
  t: (key: string, options?: Record<string, unknown>) => string,
): InsightCard[] {
  const { channels, customers } = value;
  const paidChannels = channels.channels.filter((channel) => PAID_CHANNEL_KEYS.has(channel.channelKey));
  const paidRevenue = sumBy(paidChannels, (channel) => channel.revenue);
  const paidProfit = sumBy(paidChannels, (channel) => channel.contributionProfit);
  const paidShare = channels.totalRevenue > 0 ? (paidRevenue / channels.totalRevenue) * 100 : 0;
  const discountCost = sumBy(channels.channels, (channel) => channel.discountCost);
  const discountRate = channels.totalRevenue > 0 ? (discountCost / channels.totalRevenue) * 100 : 0;
  const repeatDrivenChannels = channels.channels.filter((channel) => channel.customers.repeatCustomerShare >= 35);
  const averageRepeatShare = averageBy(
    repeatDrivenChannels,
    (channel) => channel.customers.repeatCustomerShare,
  );
  const topChannel =
    [...channels.channels].sort((left, right) => right.contributionProfit - left.contributionProfit)[0] ?? null;
  const lowMarginChannel =
    [...channels.channels]
      .filter((channel) => channel.contributionMarginPercent !== null)
      .sort((left, right) => (left.contributionMarginPercent ?? 0) - (right.contributionMarginPercent ?? 0))[0] ?? null;
  const customerHealthTone =
    customers.highValueShare >= 30 && customers.segmentCounts.at_risk <= customers.segmentCounts.vip
      ? "success"
      : "warning";

  return [
    {
      key: "paid-traffic",
      title: t("todayRoi.lenses.paidTraffic.title"),
      statusLabel: t("todayRoi.lenses.paidTraffic.status"),
      statusTone: paidChannels.length > 0 ? "warning" : "neutral",
      source: paidChannels.length > 0 ? "estimated" : "pending",
      metrics: [
        { label: t("todayRoi.summaryPaidTraffic"), value: formatPercent(paidShare) },
        { label: t("todayRoi.metricContributionProfit"), value: formatCurrency(paidProfit, channels.currency) },
        { label: t("todayRoi.metricPaidChannels"), value: String(paidChannels.length) },
      ],
      conclusion:
        paidChannels.length > 0
          ? t("todayRoi.lenses.paidTraffic.insightReady", {
              count: paidChannels.length,
              share: formatPercent(paidShare),
            })
          : t("todayRoi.lenses.paidTraffic.insightPending"),
    },
    {
      key: "coupon",
      title: t("todayRoi.lenses.coupon.title"),
      statusLabel: t("todayRoi.lenses.coupon.status"),
      statusTone: discountCost > 0 ? "warning" : "neutral",
      source: discountCost > 0 ? "estimated" : "pending",
      metrics: [
        { label: t("todayRoi.summaryCouponCost"), value: formatCurrency(discountCost, channels.currency) },
        { label: t("todayRoi.metricDiscountRate"), value: formatPercent(discountRate) },
        { label: t("todayRoi.metricDiscountSensitive"), value: String(customers.tagCounts.discount_sensitive) },
      ],
      conclusion: t("todayRoi.lenses.coupon.insight", {
        discountSensitive: customers.tagCounts.discount_sensitive,
      }),
    },
    {
      key: "customer-value",
      title: t("todayRoi.lenses.customerValue.title"),
      statusLabel: t("todayRoi.lenses.customerValue.status"),
      statusTone: customerHealthTone,
      source: "estimated",
      metrics: [
        { label: t("todayRoi.metricHighValueShare"), value: formatPercent(customers.highValueShare) },
        { label: t("todayRoi.metricAvgScore"), value: String(customers.averageScore) },
        { label: t("todayRoi.segmentVip"), value: String(customers.segmentCounts.vip) },
        { label: t("todayRoi.segmentAtRisk"), value: String(customers.segmentCounts.at_risk) },
      ],
      conclusion: t("todayRoi.lenses.customerValue.insight", {
        vip: customers.segmentCounts.vip,
        atRisk: customers.segmentCounts.at_risk,
        ltv: formatCurrency(customers.averageDynamicLtv, channels.currency),
      }),
    },
    {
      key: "repeat",
      title: t("todayRoi.lenses.repeat.title"),
      statusLabel: t("todayRoi.lenses.repeat.status"),
      statusTone: customers.repeatPurchaseRate >= 25 ? "success" : "warning",
      source: "estimated",
      metrics: [
        { label: t("todayRoi.summaryRepeatRate"), value: formatPercent(customers.repeatPurchaseRate) },
        { label: t("todayRoi.metricAvgLtv"), value: formatCurrency(customers.averageDynamicLtv, channels.currency) },
        { label: t("todayRoi.metricRepeatChannels"), value: String(repeatDrivenChannels.length) },
        { label: t("todayRoi.metricRepeatShareAvg"), value: formatPercent(averageRepeatShare) },
      ],
      conclusion:
        repeatDrivenChannels.length > 0
          ? t("todayRoi.lenses.repeat.insightReady", {
              count: repeatDrivenChannels.length,
              share: formatPercent(averageRepeatShare),
            })
          : t("todayRoi.lenses.repeat.insightPending"),
    },
    {
      key: "mix",
      title: t("todayRoi.lenses.mix.title"),
      statusLabel: t("todayRoi.lenses.mix.status"),
      statusTone: topChannel ? "success" : "neutral",
      source: topChannel ? "estimated" : "pending",
      metrics: [
        { label: t("todayRoi.metricTopChannel"), value: topChannel?.label ?? "—" },
        {
          label: t("todayRoi.metricTopContributionProfit"),
          value: topChannel ? formatCurrency(topChannel.contributionProfit, channels.currency) : "—",
        },
        { label: t("todayRoi.metricLowMarginChannel"), value: lowMarginChannel?.label ?? "—" },
        {
          label: t("todayRoi.metricLowMargin"),
          value:
            lowMarginChannel?.contributionMarginPercent === null || lowMarginChannel?.contributionMarginPercent === undefined
              ? "—"
              : formatPercent(lowMarginChannel.contributionMarginPercent),
        },
      ],
      conclusion:
        topChannel && lowMarginChannel
          ? t("todayRoi.lenses.mix.insightReady", {
              topProfit: formatCurrency(topChannel.contributionProfit, channels.currency),
              lowMargin:
                lowMarginChannel.contributionMarginPercent === null
                  ? "—"
                  : formatPercent(lowMarginChannel.contributionMarginPercent),
            })
          : t("todayRoi.lenses.mix.insightPending"),
    },
  ];
}

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

const dataSourceTone: Record<DataSource, "success" | "warning" | "neutral"> = {
  real: "success",
  estimated: "warning",
  pending: "neutral",
};

const sectionStackStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
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

const settingsGridStyle = (isMobile: boolean): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
  gap: "0.85rem",
});

const settingsTileStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.95rem 1rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
};

const settingsTileLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const settingsTileValueRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
};

const settingsTileValueStyle: CSSProperties = {
  fontSize: "1rem",
  fontWeight: 800,
  color: pageColorTokens.textPrimary,
};

const settingsTileHintStyle: CSSProperties = {
  fontSize: "0.8125rem",
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const settingsButtonStyle: CSSProperties = {
  minHeight: 32,
  padding: "0.45rem 0.8rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: pageColorTokens.textBody,
  fontSize: "0.8125rem",
  fontWeight: 700,
  cursor: "pointer",
};

const settingsPanelStyle: CSSProperties = {
  marginTop: "1rem",
  paddingTop: "1rem",
  borderTop: `1px solid ${pageColorTokens.divider}`,
};

const cardListStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const cardFocusWrapStyle = (highlighted: boolean): CSSProperties => ({
  display: "grid",
  gap: "0.25rem",
  borderRadius: pageColorTokens.radiusControl,
  padding: highlighted ? "0.2rem" : 0,
  background: highlighted ? pageColorTokens.brandBlueLight : "transparent",
  boxShadow: highlighted ? `0 0 0 1px ${pageColorTokens.brandBlue}` : "none",
});

const cardBadgeRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flexWrap: "wrap",
  marginBottom: "0.85rem",
};

function badgeStyle(tone: "success" | "warning" | "neutral"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.2rem 0.55rem",
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 700,
    color:
      tone === "success"
        ? pageColorTokens.brandGreenDark
        : tone === "warning"
          ? "#9a5b00"
          : pageColorTokens.textSecondary,
    background:
      tone === "success"
        ? pageColorTokens.brandGreenLight
        : tone === "warning"
          ? pageColorTokens.warningBg
          : pageColorTokens.surfaceMuted,
    border: `1px solid ${
      tone === "success"
        ? "rgba(0, 128, 96, 0.2)"
        : tone === "warning"
          ? "#f1d58d"
          : pageColorTokens.borderSubtle
    }`,
  };
}

const conclusionBlockStyle: CSSProperties = {
  marginTop: "0.85rem",
  paddingTop: "0.85rem",
  borderTop: `1px solid ${pageColorTokens.divider}`,
  display: "grid",
  gap: "0.25rem",
};

const conclusionLabelStyle: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
};

const conclusionTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  lineHeight: 1.6,
  color: pageColorTokens.textBody,
};

const secondaryTextStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8125rem",
  color: pageColorTokens.textSecondary,
  lineHeight: 1.55,
};

const costFormWrapStyle: CSSProperties = {
  marginTop: "0.25rem",
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
