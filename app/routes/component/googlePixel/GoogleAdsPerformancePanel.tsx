import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useEmbeddedLocationSearch } from "../../../hooks/useEmbeddedLocationSearch";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

type RangeDays = 7 | 14 | 30;

type PerformanceDay = {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversionsValue: number;
  purchases: number;
  purchaseValue: number;
};

type PerformanceSummary = {
  accountId: string;
  currencyCode: string | null;
  rangeDays: RangeDays;
  dateStart: string;
  dateEnd: string;
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    conversionsValue: number;
    purchases: number;
    purchaseValue: number;
    ctr: number;
    cpc: number;
    conversionRate: number;
    roas: number | null;
  };
  days: PerformanceDay[];
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; data: PerformanceSummary };

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const secondaryBtn = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none" as const,
  display: "inline-block",
};

const rangeBtn = (active: boolean) => ({
  ...secondaryBtn,
  background: active ? pageColorTokens.brandGreenLight : "#fff",
  color: active ? pageColorTokens.brandGreenDeep : pageColorTokens.textPrimary,
  borderColor: active ? pageColorTokens.brandGreen : pageColorTokens.borderSubtle,
});

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
      // fall through
    }
  }
  return amount.toFixed(2);
}

function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

function formatRoas(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(2)}x`;
}

function buildLinePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normed = rawMax / mag;
  const nice = normed <= 1 ? 1 : normed <= 2 ? 2 : normed <= 5 ? 5 : 10;
  return nice * mag;
}

function TrendChart({ days }: { days: PerformanceDay[] }) {
  const { t } = useTranslation();
  const W = 720;
  const H = 180;
  const pL = 44;
  const pR = 44;
  const pT = 12;
  const pB = 28;
  const chartW = W - pL - pR;
  const chartH = H - pT - pB;
  const n = days.length;
  if (n === 0) return null;

  const getX = (i: number) => pL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const maxConv = niceMax(Math.max(...days.map((d) => d.conversions), 0));
  const maxSpend = niceMax(Math.max(...days.map((d) => d.spend), 0));
  const getYConv = (v: number) => pT + chartH * (1 - v / maxConv);
  const getYSpend = (v: number) => pT + chartH * (1 - v / maxSpend);

  const convPts = days.map((d, i) => ({ x: getX(i), y: getYConv(d.conversions) }));
  const spendPts = days.map((d, i) => ({ x: getX(i), y: getYSpend(d.spend) }));
  const convPath = buildLinePath(convPts);
  const spendPath = buildLinePath(spendPts);
  const bottom = pT + chartH;
  const areaPath = `${convPath} L ${getX(n - 1).toFixed(1)} ${bottom.toFixed(1)} L ${getX(0).toFixed(1)} ${bottom.toFixed(1)} Z`;

  const xCount = Math.min(n, n <= 7 ? n : 6);
  const xIndices =
    xCount <= 1
      ? [0]
      : Array.from({ length: xCount }, (_, i) => Math.round((i / (xCount - 1)) * (n - 1)));

  const hasSignal = days.some((d) => d.conversions > 0 || d.spend > 0 || d.clicks > 0);

  return (
    <div>
      {!hasSignal ? (
        <p style={{ ...pageHintTextStyle, margin: "0 0 8px" }}>
          {t("googlePixelData.performanceEmpty")}
        </p>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="pixel-conv-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pageColorTokens.brandGreen} stopOpacity="0.2" />
            <stop offset="100%" stopColor={pageColorTokens.brandGreen} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pT + chartH * (1 - ratio);
          return (
            <line
              key={ratio}
              x1={pL}
              y1={y}
              x2={W - pR}
              y2={y}
              stroke={pageColorTokens.divider}
              strokeWidth="1"
            />
          );
        })}
        <path d={areaPath} fill="url(#pixel-conv-grad)" />
        <path d={spendPath} fill="none" stroke="#2c6ecb" strokeWidth="2" />
        <path d={convPath} fill="none" stroke={pageColorTokens.brandGreen} strokeWidth="2.5" />
        {xIndices.map((idx) => (
          <text
            key={days[idx].date}
            x={getX(idx)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill={pageColorTokens.textSecondary}
          >
            {days[idx].date.slice(5)}
          </text>
        ))}
        <text x={pL - 6} y={pT + 4} textAnchor="end" fontSize="10" fill={pageColorTokens.textSecondary}>
          {formatNumber(maxConv, maxConv < 10 ? 1 : 0)}
        </text>
        <text
          x={W - pR + 6}
          y={pT + 4}
          textAnchor="start"
          fontSize="10"
          fill={pageColorTokens.textSecondary}
        >
          {formatNumber(maxSpend, 0)}
        </text>
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: pageColorTokens.textSecondary }}>
        <span>
          <span style={{ color: pageColorTokens.brandGreen, fontWeight: 700 }}>● </span>
          {t("googlePixelData.metricConversions")}
        </span>
        <span>
          <span style={{ color: "#2c6ecb", fontWeight: 700 }}>● </span>
          {t("googlePixelData.metricSpend")}
        </span>
      </div>
    </div>
  );
}

export function GoogleAdsPerformancePanel({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();
  const [rangeDays, setRangeDays] = useState<RangeDays>(7);
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const load = useCallback(async () => {
    if (!enabled) {
      setState({
        status: "not_configured",
        message: t("googlePixelData.performanceNeedAds"),
      });
      return;
    }
    setState({ status: "loading" });
    try {
      const params = new URLSearchParams(
        locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
      );
      params.set("range", String(rangeDays));
      const response = await fetch(`/api/ads-catalog/google-performance?${params.toString()}`);
      const json = (await response.json()) as PerformanceSummary & {
        ok?: boolean;
        reason?: string;
        message?: string;
      };
      if (!response.ok || !json.ok) {
        if (json.reason === "not_configured") {
          setState({
            status: "not_configured",
            message: json.message || t("googlePixelData.performanceNeedAds"),
          });
          return;
        }
        throw new Error(json.message || t("googlePixelData.performanceLoadFailed"));
      }
      setState({
        status: "ok",
        data: {
          accountId: json.accountId,
          currencyCode: json.currencyCode,
          rangeDays: json.rangeDays,
          dateStart: json.dateStart,
          dateEnd: json.dateEnd,
          totals: json.totals,
          days: json.days,
        },
      });
    } catch (reason) {
      setState({
        status: "error",
        message:
          reason instanceof Error ? reason.message : t("googlePixelData.performanceLoadFailed"),
      });
    }
  }, [enabled, locationSearch, rangeDays, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi =
    state.status === "ok"
      ? [
          {
            key: "conversions",
            label: t("googlePixelData.metricConversions"),
            value: formatNumber(state.data.totals.conversions, 2),
          },
          {
            key: "conversionsValue",
            label: t("googlePixelData.metricConversionsValue"),
            value: formatCurrency(state.data.totals.conversionsValue, state.data.currencyCode),
          },
          {
            key: "purchases",
            label: t("googlePixelData.metricPurchases"),
            value: formatNumber(state.data.totals.purchases, 2),
          },
          {
            key: "spend",
            label: t("googlePixelData.metricSpend"),
            value: formatCurrency(state.data.totals.spend, state.data.currencyCode),
          },
          {
            key: "clicks",
            label: t("googlePixelData.metricClicks"),
            value: formatNumber(state.data.totals.clicks),
          },
          {
            key: "roas",
            label: t("googlePixelData.metricRoas"),
            value: formatRoas(state.data.totals.roas),
          },
          {
            key: "ctr",
            label: t("googlePixelData.metricCtr"),
            value: formatPercent(state.data.totals.ctr),
          },
          {
            key: "cpc",
            label: t("googlePixelData.metricCpc"),
            value: formatCurrency(state.data.totals.cpc, state.data.currencyCode),
          },
        ]
      : [];

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelData.sectionPerformance")}</h3>
          <p style={{ ...pageHintTextStyle, margin: "6px 0 0" }}>
            {t("googlePixelData.performanceHint")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {([7, 14, 30] as RangeDays[]).map((days) => (
            <button
              key={days}
              type="button"
              style={rangeBtn(rangeDays === days)}
              onClick={() => setRangeDays(days)}
            >
              {t("googlePixelData.rangeDays", { count: days })}
            </button>
          ))}
          <button type="button" style={secondaryBtn} onClick={() => void load()}>
            {t("googlePixelData.performanceRefresh")}
          </button>
        </div>
      </div>

      {state.status === "loading" || state.status === "idle" ? (
        <p style={pageHintTextStyle}>{t("googlePixelData.performanceLoading")}</p>
      ) : null}

      {state.status === "not_configured" ? (
        <p style={{ margin: 0, fontSize: 13 }}>{state.message}</p>
      ) : null}

      {state.status === "error" ? (
        <p style={{ margin: 0, fontSize: 13, color: pageColorTokens.critical }}>{state.message}</p>
      ) : null}

      {state.status === "ok" ? (
        <>
          <p style={{ ...pageHintTextStyle, margin: 0 }}>
            {t("googlePixelData.performanceWindow", {
              start: state.data.dateStart,
              end: state.data.dateEnd,
            })}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {kpi.map((item) => (
              <div
                key={item.key}
                style={{
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: pageColorTokens.surfaceMuted,
                }}
              >
                <div style={{ fontSize: 11, color: pageColorTokens.textSecondary }}>{item.label}</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 16,
                    fontWeight: 700,
                    color: pageColorTokens.textPrimary,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          <TrendChart days={state.data.days} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              to={locationSearch ? `/app/insights/charts${locationSearch}&group=roi` : "/app/insights/charts?group=roi"}
              style={secondaryBtn}
            >
              {t("googlePixelData.openInsights")}
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
