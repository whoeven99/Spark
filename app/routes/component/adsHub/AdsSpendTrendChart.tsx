/**
 * 广告花费与转化金额的按天趋势。
 *
 * 数据是 `buildAdsOverview` 的 `paidSeries`：只有产生过指标的日期才有行，
 * 因此渲染前要把中间没花钱的日子补成 0，否则 x 轴会把跳过的日期压在一起，
 * 看上去像连续投放。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";

export type AdsTrendPoint = {
  date: string;
  spend: number;
  conversionsValue: number;
};

const SPEND_COLOR = pageColorTokens.brandBlue;
const VALUE_COLOR = pageColorTokens.brandGreen;
const Y_AXIS_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
/** 区间上限是 30 天，留一点余量防御脏数据把循环拖长。 */
const MAX_POINTS = 90;

function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normed = rawMax / mag;
  const nice = normed <= 1 ? 1 : normed <= 2 ? 2 : normed <= 5 ? 5 : 10;
  return nice * mag;
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function fillDailyGaps(
  series: AdsTrendPoint[],
  dateStart: string,
  dateEnd: string,
): AdsTrendPoint[] {
  const start = Date.parse(`${dateStart}T00:00:00Z`);
  const end = Date.parse(`${dateEnd}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return series;
  const byDate = new Map(series.map((point) => [point.date, point]));
  const filled: AdsTrendPoint[] = [];
  for (let ts = start; ts <= end && filled.length < MAX_POINTS; ts += DAY_MS) {
    const date = new Date(ts).toISOString().slice(0, 10);
    filled.push(byDate.get(date) ?? { date, spend: 0, conversionsValue: 0 });
  }
  return filled;
}

function formatDayLabel(date: string, locale: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date.slice(5);
  return new Date(parsed).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatAxisValue(value: number, currency: string | null, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency && currency.length === 3 ? currency : "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

function formatFullValue(value: number, currency: string | null, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency && currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

export function AdsSpendTrendChart({
  series,
  dateStart,
  dateEnd,
  currencyCode,
}: {
  series: AdsTrendPoint[];
  dateStart: string;
  dateEnd: string;
  currencyCode: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = fillDailyGaps(series, dateStart, dateEnd);
  const n = points.length;
  if (n < 2) return null;

  const W = 720;
  const H = 220;
  const pL = 52;
  const pR = 16;
  const pT = 16;
  const pB = 34;
  const chartW = W - pL - pR;
  const chartH = H - pT - pB;

  const maxValue = niceMax(
    Math.max(0, ...points.map((point) => Math.max(point.spend, point.conversionsValue))),
  );
  const getX = (index: number) => pL + (index / (n - 1)) * chartW;
  const getY = (value: number) => pT + chartH * (1 - value / maxValue);
  const columnWidth = chartW / n;

  const xCount = Math.min(n, n <= 7 ? n : 6);
  const xIndices =
    xCount <= 1
      ? [0]
      : Array.from({ length: xCount }, (_, i) => Math.round((i / (xCount - 1)) * (n - 1)));

  const lines = [
    {
      key: "spend" as const,
      color: SPEND_COLOR,
      label: t("adsHub.overview.spend"),
      values: points.map((point) => point.spend),
    },
    {
      key: "conversionsValue" as const,
      color: VALUE_COLOR,
      label: t("adsHub.overview.conversionValue"),
      values: points.map((point) => point.conversionsValue),
    },
  ];

  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;
  const tooltipX =
    hoveredIndex != null ? Math.min(Math.max(getX(hoveredIndex) - 80, pL), W - pR - 160) : pL;

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: pageColorTokens.textPrimary }}>
        {t("adsHub.overview.trendTitle")}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 8 }}>
        {Y_AXIS_RATIOS.map((ratio) => {
          const y = pT + chartH * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={pL}
                y1={y}
                x2={W - pR}
                y2={y}
                stroke={pageColorTokens.divider}
                strokeWidth="1"
              />
              <text
                x={pL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill={pageColorTokens.textSecondary}
              >
                {formatAxisValue(maxValue * ratio, currencyCode, i18n.language)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) => (
          <rect
            key={`hover-${point.date}`}
            x={getX(index) - columnWidth / 2}
            y={pT}
            width={columnWidth}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}

        {lines.map((line) => {
          const linePoints = line.values.map((value, index) => ({
            x: getX(index),
            y: getY(value),
          }));
          return (
            <path
              key={line.key}
              d={buildLinePath(linePoints)}
              fill="none"
              stroke={line.color}
              strokeWidth="2.2"
            />
          );
        })}

        {hoveredIndex != null ? (
          <g pointerEvents="none">
            <line
              x1={getX(hoveredIndex)}
              y1={pT}
              x2={getX(hoveredIndex)}
              y2={pT + chartH}
              stroke={pageColorTokens.borderSubtle}
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            {lines.map((line) => (
              <circle
                key={line.key}
                cx={getX(hoveredIndex)}
                cy={getY(line.values[hoveredIndex] ?? 0)}
                r={4}
                fill={line.color}
                stroke="#fff"
                strokeWidth="1.5"
              />
            ))}
          </g>
        ) : null}

        {xIndices.map((index) => (
          <text
            key={points[index]?.date ?? index}
            x={getX(index)}
            y={H - 10}
            textAnchor="middle"
            fontSize="10"
            fill={pageColorTokens.textSecondary}
          >
            {formatDayLabel(points[index]?.date ?? "", i18n.language)}
          </text>
        ))}

        {hovered ? (
          <foreignObject x={tooltipX} y={pT + 4} width={160} height={80} pointerEvents="none">
            <div
              style={{
                background: pageColorTokens.surface,
                border: `1px solid ${pageColorTokens.border}`,
                borderRadius: 8,
                boxShadow: pageColorTokens.shadowCard,
                padding: "8px 10px",
                fontSize: 11,
                lineHeight: 1.45,
                color: pageColorTokens.textPrimary,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {formatDayLabel(hovered.date, i18n.language)}
              </div>
              {lines.map((line) => (
                <div
                  key={line.key}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
                >
                  <span style={{ color: pageColorTokens.textSecondary }}>{line.label}</span>
                  <span style={{ fontWeight: 600 }}>
                    {formatFullValue(
                      line.values[hoveredIndex ?? 0] ?? 0,
                      currencyCode,
                      i18n.language,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </foreignObject>
        ) : null}
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 4,
          fontSize: 12,
          color: pageColorTokens.textSecondary,
        }}
      >
        {lines.map((line) => (
          <span key={line.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 999, background: line.color }}
            />
            {line.label}
          </span>
        ))}
      </div>
    </div>
  );
}
