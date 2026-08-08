/**
 * TikTok 沙盒模式：手动测试指标覆盖面板。
 * 沙盒无真实投放，指标全为 0；此组件允许输入自定义值，用于 UI 展示验证。
 * 仅在 sandbox=true 时挂载，所有覆盖都是纯前端状态，不写回 API。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { AdsInsightsCampaign, AdsInsightsMetrics } from "./types";

export type CustomSandboxMetrics = {
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionValue: number;
};

const DEFAULT_METRICS: CustomSandboxMetrics = {
  impressions: 5000,
  clicks: 200,
  spend: 120,
  conversions: 10,
  conversionValue: 450,
};

function buildAdMetrics(custom: CustomSandboxMetrics, adCount: number): AdsInsightsMetrics {
  const n = Math.max(adCount, 1);
  const impressions = Math.round(custom.impressions / n);
  const clicks = Math.round(custom.clicks / n);
  const spend = Math.round((custom.spend / n) * 100) / 100;
  const conversions = Math.round(custom.conversions / n);
  const conversionValue = Math.round((custom.conversionValue / n) * 100) / 100;
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
  const conversionRate = clicks > 0 ? conversions / clicks : 0;
  const roas = spend > 0 ? conversionValue / spend : null;
  return {
    impressions,
    clicks,
    spend,
    ctr,
    cpc,
    cpm,
    conversions,
    conversionsValue: conversionValue,
    conversionRate,
    roas,
    purchases: null,
    purchaseValue: null,
    addToCart: null,
    landingPageViews: null,
    reach: null,
    frequency: null,
    outboundClicks: null,
    videoViews: null,
    thruplay: null,
    leads: null,
    viewContent: null,
    initiateCheckout: null,
    allConversions: null,
  };
}

function sumAdMetrics(metrics: AdsInsightsMetrics[]): AdsInsightsMetrics {
  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  let conversions = 0;
  let conversionsValue = 0;
  for (const m of metrics) {
    impressions += m.impressions;
    clicks += m.clicks;
    spend += m.spend;
    conversions += m.conversions;
    conversionsValue += m.conversionsValue;
  }
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
  const conversionRate = clicks > 0 ? conversions / clicks : 0;
  const roas = spend > 0 ? conversionsValue / spend : null;
  return {
    impressions,
    clicks,
    spend,
    ctr,
    cpc,
    cpm,
    conversions,
    conversionsValue,
    conversionRate,
    roas,
    purchases: null,
    purchaseValue: null,
    addToCart: null,
    landingPageViews: null,
    reach: null,
    frequency: null,
    outboundClicks: null,
    videoViews: null,
    thruplay: null,
    leads: null,
    viewContent: null,
    initiateCheckout: null,
    allConversions: null,
  };
}

/**
 * 将自定义指标均匀分配到树形结构的每个 Ad，并向上汇总至 AdSet 和 Campaign。
 * 如果树为空，直接返回原样（提示用户先 Seed）。
 */
export function applyCustomMetricsToTree(
  campaigns: AdsInsightsCampaign[],
  custom: CustomSandboxMetrics,
): AdsInsightsCampaign[] {
  const totalAds = campaigns.reduce(
    (s, c) => s + c.adSets.reduce((s2, as) => s2 + Math.max(as.ads.length, 1), 0),
    0,
  );
  if (totalAds === 0) return campaigns;

  return campaigns.map((campaign) => {
    const updatedAdSets = campaign.adSets.map((adSet) => {
      const adCount = Math.max(adSet.ads.length, 1);
      const updatedAds = adSet.ads.map((ad) => ({
        ...ad,
        metrics: buildAdMetrics(custom, totalAds),
      }));
      const adSetMetrics = sumAdMetrics(
        updatedAds.length > 0
          ? updatedAds.map((a) => a.metrics)
          : [buildAdMetrics(custom, totalAds)],
      );
      return { ...adSet, ads: updatedAds, metrics: adSetMetrics };
    });
    const campaignMetrics = sumAdMetrics(
      updatedAdSets.length > 0
        ? updatedAdSets.map((as) => as.metrics)
        : [buildAdMetrics(custom, totalAds)],
    );
    return { ...campaign, adSets: updatedAdSets, metrics: campaignMetrics };
  });
}

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
};

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
      <span style={{ color: pageColorTokens.textSecondary, fontWeight: 500 }}>{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        style={{
          width: 90,
          padding: "4px 6px",
          borderRadius: 6,
          border: `1px solid ${pageColorTokens.borderSubtle}`,
          fontSize: 13,
        }}
      />
    </label>
  );
}

type Props = {
  value: CustomSandboxMetrics | null;
  onChange: (v: CustomSandboxMetrics | null) => void;
  hasData: boolean;
};

export function TiktokSandboxMetricsOverridePanel({ value, onChange, hasData }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CustomSandboxMetrics>(value ?? DEFAULT_METRICS);

  function setField<K extends keyof CustomSandboxMetrics>(key: K, v: number) {
    setDraft((prev) => ({ ...prev, [key]: v }));
  }

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: 8,
        padding: "12px 16px",
        background: value ? "#f0f7ff" : pageColorTokens.surfaceMuted,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {t("adsInsights.tiktokSandboxMetricsOverrideTitle")}
        </div>
        {value && (
          <span
            style={{
              fontSize: 11,
              background: "#1677ff22",
              color: "#1677ff",
              borderRadius: 4,
              padding: "2px 6px",
              fontWeight: 600,
            }}
          >
            {t("adsInsights.tiktokSandboxMetricsApplied")}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
        {t("adsInsights.tiktokSandboxMetricsOverrideHint")}
        {!hasData && (
          <span style={{ color: "#d97706", marginLeft: 4 }}>
            {t("adsInsights.tiktokSandboxMetricsNoData")}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <NumberField
          label={t("adsInsights.tiktokSandboxMetricsImpressions")}
          value={draft.impressions}
          onChange={(v) => setField("impressions", v)}
        />
        <NumberField
          label={t("adsInsights.tiktokSandboxMetricsClicks")}
          value={draft.clicks}
          onChange={(v) => setField("clicks", v)}
        />
        <NumberField
          label={t("adsInsights.tiktokSandboxMetricsSpend")}
          value={draft.spend}
          onChange={(v) => setField("spend", v)}
        />
        <NumberField
          label={t("adsInsights.tiktokSandboxMetricsConversions")}
          value={draft.conversions}
          onChange={(v) => setField("conversions", v)}
        />
        <NumberField
          label={t("adsInsights.tiktokSandboxMetricsConvValue")}
          value={draft.conversionValue}
          onChange={(v) => setField("conversionValue", v)}
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={!hasData}
          onClick={() => onChange(draft)}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "none",
            background: "#1677ff",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: hasData ? "pointer" : "not-allowed",
            opacity: hasData ? 1 : 0.5,
          }}
        >
          {t("adsInsights.tiktokSandboxMetricsApply")}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              background: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t("adsInsights.tiktokSandboxMetricsClear")}
          </button>
        )}
      </div>
    </div>
  );
}
