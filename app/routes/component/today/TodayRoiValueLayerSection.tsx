import { useState, type CSSProperties } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import type { ValueLayerData } from "../../../server/operations/valueLayer.server";
import type { ShopCostConfigView } from "../../../server/operations/roi/costConfig.server";
import {
  PageSurface,
  pageColorTokens,
  pageMetricCardStyle,
  pageMetricFooterStyle,
  pageMetricLabelStyle,
  pageMetricTileStyle,
  pageMetricUnitStyle,
  pageMetricValueStyle,
  type PageMetricItem,
} from "../../page/pageUiStyles";
import { MetricHintLabel } from "../shared/MetricHintLabel";

export const TODAY_ROI_COST_CONFIG_FETCHER_KEY = "today-roi-cost-config";

type DataSource = "real" | "estimated" | "pending";

type InsightCard = {
  key: string;
  title: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  source: DataSource;
  metrics: InsightMetric[];
  conclusion: string;
};

type InsightMetric = PageMetricItem & {
  explanation?: string;
};

const PAID_CHANNEL_KEYS = new Set(["facebook", "instagram", "google", "tiktok", "youtube", "pinterest", "x", "bing"]);

export function TodayRoiValueLayerSection({
  value,
  valueLoading,
  valueFailed,
  isMobile,
  focus = "overview",
}: {
  value: ValueLayerData | null;
  valueLoading: boolean;
  valueFailed: boolean;
  isMobile: boolean;
  focus?: "overview" | "channels" | "loss";
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
        title="长期质量补充"
        subtitle={
          focus === "overview"
            ? "这块只作为回报效率页的长期质量补充，用来辅助判断客户价值、复购和渠道结构能不能支撑继续加码。"
            : "当前焦点不在长期质量上，这里只作为补充判断，不和上面的渠道/损耗主结论抢层级。"
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

      <PageSurface
        title="ROI 口径说明"
        subtitle="这里明确区分贡献利润、广告费和短期 ROI，避免把广告前利润和广告后回报混成一个数。"
      >
        <div style={explanationListStyle}>
          {value.channels.caveats.map((item) => (
            <div key={item} style={explanationItemStyle}>
              {item}
            </div>
          ))}
        </div>
      </PageSurface>

      <div style={cardListStyle}>
        {cards.map((card) => (
          <PageSurface key={card.key} title={card.title}>
            <div style={cardFocusWrapStyle(resolveCardHighlight(card.key, focus))}>
            <div style={cardBadgeRowStyle}>
              <span style={badgeStyle(card.statusTone)}>{card.statusLabel}</span>
              <SourceTag source={card.source} />
            </div>
            <InsightMetricCard metrics={card.metrics} />
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
  focus: "overview" | "channels" | "loss",
): boolean {
  if (focus === "channels") {
    return cardKey === "paid-traffic" || cardKey === "mix";
  }
  if (focus === "loss") {
    return cardKey === "loss" || cardKey === "paid-traffic";
  }
  return cardKey === "paid-traffic" || cardKey === "customer-value" || cardKey === "mix";
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

function InsightMetricCard({ metrics }: { metrics: InsightMetric[] }) {
  return (
    <div style={pageMetricCardStyle}>
      <div style={metricGridStyle(metrics.length)}>
        {metrics.map((metric) => (
          <div key={metric.label} style={pageMetricTileStyle}>
            <MetricHintLabel
              as="p"
              style={pageMetricLabelStyle}
              text={metric.label}
              content={metric.explanation}
            />
            <p style={pageMetricValueStyle}>{metric.value}</p>
            {metric.unit ? <p style={pageMetricUnitStyle}>{metric.unit}</p> : null}
          </div>
        ))}
      </div>
      <div style={pageMetricFooterStyle}>鼠标移到指标名上可以查看计算口径。</div>
    </div>
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
  const paidChannelsWithSpend = paidChannels.filter(
    (channel) => channel.roi.investmentCost !== null && channel.roi.investmentCost > 0,
  );
  const paidRevenue = sumBy(paidChannels, (channel) => channel.revenue);
  const mappedPaidRevenue = sumBy(paidChannelsWithSpend, (channel) => channel.revenue);
  const paidProfit = sumBy(paidChannels, (channel) => channel.contributionProfit);
  const mappedPaidProfit = sumBy(paidChannelsWithSpend, (channel) => channel.contributionProfit);
  const paidSpend = sumBy(paidChannelsWithSpend, (channel) => channel.roi.investmentCost ?? 0);
  const paidAfterSpendProfit = mappedPaidProfit - paidSpend;
  const paidShortTermRoi = paidSpend > 0 ? paidAfterSpendProfit / paidSpend : null;
  const paidShare = channels.totalRevenue > 0 ? (paidRevenue / channels.totalRevenue) * 100 : 0;
  const mappedPaidShare = channels.totalRevenue > 0 ? (mappedPaidRevenue / channels.totalRevenue) * 100 : 0;
  const paidRoas = paidSpend > 0 ? mappedPaidRevenue / paidSpend : null;
  const estimatedPaidNewOrders = sumBy(
    paidChannelsWithSpend,
    (channel) => channel.orderCount * (channel.customers.newOrderShare / 100),
  );
  const estimatedCac = estimatedPaidNewOrders > 0 ? paidSpend / estimatedPaidNewOrders : null;
  const ltvCacRatio =
    estimatedCac && estimatedCac > 0 && customers.averageDynamicLtv > 0
      ? customers.averageDynamicLtv / estimatedCac
      : null;
  const discountCost = sumBy(channels.channels, (channel) => channel.discountCost);
  const refundLoss = sumBy(channels.channels, (channel) => channel.refundLoss);
  const totalLossCost = discountCost + refundLoss;
  const discountRate = channels.totalRevenue > 0 ? (discountCost / channels.totalRevenue) * 100 : 0;
  const refundRate = channels.totalRevenue > 0 ? (refundLoss / channels.totalRevenue) * 100 : 0;
  const totalLossRate = channels.totalRevenue > 0 ? (totalLossCost / channels.totalRevenue) * 100 : 0;
  const repeatDrivenChannels = channels.channels.filter((channel) => channel.customers.repeatCustomerShare >= 35);
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
      statusLabel:
        paidShortTermRoi === null
          ? "广告费待补"
          : paidShortTermRoi > 0
            ? "ROI 为正"
            : "ROI 偏弱",
      statusTone:
        paidShortTermRoi === null
          ? "neutral"
          : paidShortTermRoi > 0
            ? "success"
            : "warning",
      source: paidChannels.length > 0 ? "estimated" : "pending",
      metrics: [
        {
          label: paidShortTermRoi === null ? "付费收入占比" : "已映射付费收入占比",
          value: paidShortTermRoi === null ? formatPercent(paidShare) : formatPercent(mappedPaidShare),
          explanation:
            paidShortTermRoi === null
              ? "付费流量收入占比 = 已识别付费渠道收入 / 全部渠道收入。"
              : "已映射付费收入占比 = 已成功映射广告费的付费渠道收入 / 全部渠道收入。",
        },
        {
          label: "付费贡献利润",
          value: formatCurrency(paidProfit, channels.currency),
          explanation: "贡献利润 = 收入 - 商品成本 - 用券成本 - 支付手续费 - 退款损耗。当前未含运费补贴。",
        },
        {
          label: "广告费",
          value: paidShortTermRoi === null ? "待补" : formatCurrency(paidSpend, channels.currency),
          explanation: "广告费来自已落库广告日指标，再按平台内收入占比分配到 facebook / instagram、google、tiktok 等渠道。",
        },
        {
          label: "短期 ROI",
          value: paidShortTermRoi === null ? "待补" : formatRoi(paidShortTermRoi),
          explanation: "短期 ROI = (贡献利润 - 广告费) / 广告费。",
        },
        {
          label: "广告后利润",
          value: paidShortTermRoi === null ? "待补" : formatCurrency(paidAfterSpendProfit, channels.currency),
          explanation: "广告后利润 = 贡献利润 - 广告费。",
        },
        {
          label: "ROAS",
          value: paidRoas === null ? "待补" : formatMultiple(paidRoas),
          explanation: "ROAS = 已映射付费收入 / 广告费。",
        },
        {
          label: "已映射付费渠道数",
          value: String(paidChannelsWithSpend.length),
          explanation: "已映射付费渠道数 = 当前既识别为付费渠道、又成功拿到广告费映射的渠道数量。",
        },
      ],
      conclusion:
        paidShortTermRoi === null
          ? `当前识别到 ${paidChannels.length} 个付费渠道、付费收入占比 ${formatPercent(paidShare)}，但广告费还没完整映射到这些渠道，所以短期 ROI 继续标记为待补。`
          : `短期 ROI 按 (贡献利润 - 广告费) / 广告费 计算。当前已覆盖 ${paidChannelsWithSpend.length} 个已映射广告费的付费渠道，已映射付费收入占比 ${formatPercent(mappedPaidShare)}，广告后利润 ${formatCurrency(paidAfterSpendProfit, channels.currency)}。`,
    },
    {
      key: "loss",
      title: "损耗压力",
      statusLabel: totalLossRate >= 12 ? "损耗偏高" : totalLossRate > 0 ? "可继续看" : "损耗较轻",
      statusTone: totalLossRate >= 12 ? "warning" : totalLossRate > 0 ? "neutral" : "success",
      source: channels.channels.length > 0 ? "estimated" : "pending",
      metrics: [
        {
          label: "折扣成本",
          value: formatCurrency(discountCost, channels.currency),
          explanation: "用券成本 = 观察窗口内订单折扣金额汇总。",
        },
        {
          label: "退款损耗",
          value: formatCurrency(refundLoss, channels.currency),
          explanation: "退款损耗 = 观察窗口内退款金额汇总。",
        },
        {
          label: "总损耗占比",
          value: formatPercent(totalLossRate),
          explanation: "总损耗占比 = (折扣成本 + 退款损耗) / 总收入。",
        },
        {
          label: t("todayRoi.metricDiscountSensitive"),
          value: String(customers.tagCounts.discount_sensitive),
          explanation: "折扣敏感客户 = 当前客户价值模型里带有 discount_sensitive 标签的客户数量。",
        },
      ],
      conclusion:
        totalLossCost > 0
          ? `当前损耗成本 ${formatCurrency(totalLossCost, channels.currency)}，其中折扣率 ${formatPercent(discountRate)}、退款率 ${formatPercent(refundRate)}。ROI 被拖弱时，要先分清是售前让利还是成交后退款。`
          : "当前还没看到明显损耗压力，这层更适合作为持续监控而不是主要矛盾。",
    },
    {
      key: "customer-value",
      title: "长期价值质量",
      statusLabel: customers.repeatPurchaseRate >= 25 ? "价值结构较稳" : "还要继续养熟客",
      statusTone: customerHealthTone,
      source: "estimated",
      metrics: [
        {
          label: t("todayRoi.metricHighValueShare"),
          value: formatPercent(customers.highValueShare),
          explanation: "高价值客户占比 = 分数 >= 70 的客户数 / 已纳入价值模型的客户数。",
        },
        {
          label: "复购率",
          value: formatPercent(customers.repeatPurchaseRate),
          explanation: "复购率 = active + vip 客户数 / 已纳入价值模型的客户数。",
        },
        {
          label: "平均 LTV",
          value: formatCurrency(customers.averageDynamicLtv, channels.currency),
          explanation: "平均 LTV = 当前客户价值表里的 dynamicLtv 均值。",
        },
        {
          label: "LTV/CAC",
          value: ltvCacRatio === null ? "待补" : formatMultiple(ltvCacRatio),
          explanation: "LTV/CAC = 平均动态 LTV / 首单 CAC（估算）。用于看长期价值能否覆盖当前获客成本。",
        },
      ],
      conclusion:
        repeatDrivenChannels.length > 0
          ? `当前已有 ${repeatDrivenChannels.length} 个渠道表现出较高复购倾向，长期价值层可以帮助判断今天的投放是不是在积累未来利润。`
          : "当前复购驱动渠道还不够明显，长期价值层先作为补充判断，不直接替代短期 ROI。",
    },
    {
      key: "mix",
      title: "渠道结构",
      statusLabel: topChannel ? "结构已可判断" : "渠道样本待补",
      statusTone: topChannel ? "success" : "neutral",
      source: channels.channels.length > 0 ? "estimated" : "pending",
      metrics: [
        {
          label: t("todayRoi.metricTopChannel"),
          value: topChannel?.label ?? "—",
          explanation: "Top 渠道 = 当前渠道列表里贡献利润最高的渠道。",
        },
        {
          label: t("todayRoi.metricTopContributionProfit"),
          value: topChannel ? formatCurrency(topChannel.contributionProfit, channels.currency) : "—",
          explanation: "Top 贡献利润 = Top 渠道在当前观察窗口内留下的贡献利润。",
        },
        {
          label: t("todayRoi.metricLowMarginChannel"),
          value: lowMarginChannel?.label ?? "—",
          explanation: "低利润率渠道 = 当前渠道列表里贡献利润率最低的渠道。",
        },
        {
          label: t("todayRoi.metricLowMargin"),
          value:
            lowMarginChannel?.contributionMarginPercent === null || lowMarginChannel?.contributionMarginPercent === undefined
              ? "—"
              : formatPercent(lowMarginChannel.contributionMarginPercent),
          explanation: "贡献利润率 = 贡献利润 / 收入。",
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

function formatRoi(value: number, digits = 1): string {
  return `${Number((value * 100).toFixed(digits))}%`;
}

function sumBy<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((total, item) => total + getter(item), 0);
}

function metricGridStyle(columnCount: number): CSSProperties {
  const minWidth = columnCount > 4 ? "120px" : "160px";
  return {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}, 1fr))`,
    gap: 0,
  };
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

const explanationListStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
};

const explanationItemStyle: CSSProperties = {
  padding: "0.8rem 0.9rem",
  borderRadius: pageColorTokens.radiusControl,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surfaceMuted,
  color: pageColorTokens.textSecondary,
  fontSize: "0.8125rem",
  lineHeight: 1.55,
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
