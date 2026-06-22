import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

export interface CampaignMetricsRow {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  impressions: number;
  clicks: number;
  costAmount: number;
  ctr: number;
  averageCpc: number;
  conversions: number;
  conversionsValue: number;
  conversionRate: number;
}

export interface GoogleAdsMetricsPanelProps {
  campaigns: CampaignMetricsRow[];
  currencyCode: string | null;
  customerId: string;
}

const ACTIVE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ENABLED: { bg: pageColorTokens.brandGreenLight, text: pageColorTokens.brandGreenDeep },
  PAUSED: { bg: "#fef3c7", text: "#92400e" },
};

function StatusBadge({ status }: { status: string }) {
  const colors = ACTIVE_STATUS_COLORS[status] ?? {
    bg: pageColorTokens.surfaceMuted,
    text: pageColorTokens.textSecondary,
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
      }}
    >
      {status}
    </span>
  );
}

function formatCurrency(amount: number, currencyCode: string | null): string {
  if (currencyCode) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // fallback
    }
  }
  return amount.toFixed(2);
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ─── 汇总计算 ────────────────────────────────────────────────────────────────

function computeSummary(campaigns: CampaignMetricsRow[]) {
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalCost = campaigns.reduce((s, c) => s + c.costAmount, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0;
  return { totalImpressions, totalClicks, totalCost, totalConversions, avgCtr, avgCpc };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  padding: "14px 16px",
  borderBottom: `1px solid ${pageColorTokens.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
  gap: 1,
  background: pageColorTokens.border,
  borderBottom: `1px solid ${pageColorTokens.border}`,
};

const summaryCardStyle: CSSProperties = {
  padding: "12px 16px",
  background: pageColorTokens.surfaceEvenRow,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const tableWrapStyle: CSSProperties = {
  overflowX: "auto",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: CSSProperties = {
  padding: "8px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceMuted,
  borderBottom: `1px solid ${pageColorTokens.border}`,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "8px 12px",
  borderBottom: `1px solid ${pageColorTokens.divider}`,
  color: pageColorTokens.textBody,
  verticalAlign: "middle",
};

const tdNumStyle: CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

export function GoogleAdsMetricsPanel({ campaigns, currencyCode, customerId }: GoogleAdsMetricsPanelProps) {
  const { t } = useTranslation();
  const summary = computeSummary(campaigns);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>
            {t("adsCatalog.metricsTitle")}
          </div>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 2 }}>
            {t("adsCatalog.metricsSubtitle", { customerId })}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "3px 8px",
            background: pageColorTokens.brandBlueLight,
            color: pageColorTokens.brandBlueDark,
            borderRadius: 20,
            fontWeight: 600,
          }}
        >
          {t("adsCatalog.metricsDateRange")}
        </span>
      </div>

      {/* 汇总卡片 */}
      <div style={summaryGridStyle}>
        <SummaryCard
          label={t("adsCatalog.metricsImpressionsTotal")}
          value={formatNumber(summary.totalImpressions)}
        />
        <SummaryCard
          label={t("adsCatalog.metricsClicksTotal")}
          value={formatNumber(summary.totalClicks)}
        />
        <SummaryCard
          label={t("adsCatalog.metricsCostTotal")}
          value={formatCurrency(summary.totalCost, currencyCode)}
        />
        <SummaryCard
          label={t("adsCatalog.metricsConversionsTotal")}
          value={formatNumber(summary.totalConversions)}
        />
        <SummaryCard
          label={t("adsCatalog.metricsCtrAvg")}
          value={formatPercent(summary.avgCtr)}
        />
        <SummaryCard
          label={t("adsCatalog.metricsCpcAvg")}
          value={formatCurrency(summary.avgCpc, currencyCode)}
        />
      </div>

      {/* 广告系列明细表 */}
      {campaigns.length === 0 ? (
        <div style={{ padding: "20px 16px", textAlign: "center", color: pageColorTokens.textSecondary, fontSize: 13 }}>
          {t("adsCatalog.metricsNoCampaigns")}
        </div>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t("adsCatalog.metricsCampaignName")}</th>
                <th style={{ ...thStyle, textAlign: "center" }}>{t("adsCatalog.metricsCampaignStatus")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsImpressions")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsClicks")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsCtr")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsCost")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsCpc")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsConversions")}</th>
                <th style={{ ...thStyle, textAlign: "right" }}>{t("adsCatalog.metricsCvr")}</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, idx) => (
                <tr
                  key={c.campaignId || idx}
                  style={{ background: idx % 2 === 0 ? pageColorTokens.surface : pageColorTokens.surfaceEvenRow }}
                >
                  <td style={{ ...tdStyle, maxWidth: 220 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.campaignName}>
                      {c.campaignName}
                    </div>
                    <div style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>
                      ID: {c.campaignId}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <StatusBadge status={c.campaignStatus} />
                  </td>
                  <td style={tdNumStyle}>{formatNumber(c.impressions)}</td>
                  <td style={tdNumStyle}>{formatNumber(c.clicks)}</td>
                  <td style={tdNumStyle}>{formatPercent(c.ctr)}</td>
                  <td style={tdNumStyle}>{formatCurrency(c.costAmount, currencyCode)}</td>
                  <td style={tdNumStyle}>{formatCurrency(c.averageCpc, currencyCode)}</td>
                  <td style={tdNumStyle}>{c.conversions.toFixed(2)}</td>
                  <td style={tdNumStyle}>{formatPercent(c.conversionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={summaryCardStyle}>
      <div style={{ fontSize: 11, color: pageColorTokens.textSecondary }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: pageColorTokens.textPrimary, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
