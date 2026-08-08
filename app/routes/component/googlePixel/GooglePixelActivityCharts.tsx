import { useTranslation } from "react-i18next";
import {
  GOOGLE_PIXEL_ACTIVITY_EVENTS,
  GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS,
  type GooglePixelActivityEvent,
} from "../../../lib/googlePixelActivity";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

export type ActivityCounts = Record<GooglePixelActivityEvent, number>;

export type ActivityDailyPoint = {
  day: string;
  counts: Partial<Record<GooglePixelActivityEvent, number>>;
};

export type ActivityFunnelStep = {
  event: GooglePixelActivityEvent;
  count: number;
  rateFromPrev: number | null;
};

const TREND_COLORS: Record<(typeof GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS)[number], string> = {
  add_to_cart: "#2c6ecb",
  begin_checkout: "#c9a227",
  add_payment_info: "#d14343",
  purchase: "#1a7f4b",
};

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 16,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
};

function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normed = rawMax / mag;
  const nice = normed <= 1 ? 1 : normed <= 2 ? 2 : normed <= 5 ? 5 : 10;
  return nice * mag;
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

export function MetricCards({ counts }: { counts: ActivityCounts }) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
      }}
    >
      {GOOGLE_PIXEL_ACTIVITY_EVENTS.map((event) => (
        <div key={event} style={cardStyle}>
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {t(`googlePixelActivity.events.${event}`)}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1.1 }}>
            {counts[event]}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DailyActivityChart({ daily }: { daily: ActivityDailyPoint[] }) {
  const { t } = useTranslation();
  const W = 720;
  const H = 220;
  const pL = 40;
  const pR = 16;
  const pT = 16;
  const pB = 32;
  const chartW = W - pL - pR;
  const chartH = H - pT - pB;
  const n = daily.length;

  const maxValue = niceMax(
    Math.max(
      0,
      ...daily.flatMap((point) =>
        GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS.map((event) => point.counts[event] ?? 0),
      ),
    ),
  );

  const getX = (i: number) => pL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const getY = (v: number) => pT + chartH * (1 - v / maxValue);

  const xCount = Math.min(n, n <= 7 ? n : 6);
  const xIndices =
    n === 0
      ? []
      : xCount <= 1
        ? [0]
        : Array.from({ length: xCount }, (_, i) => Math.round((i / (xCount - 1)) * (n - 1)));

  const hasSignal = daily.some((point) =>
    GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS.some((event) => (point.counts[event] ?? 0) > 0),
  );

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelActivity.dailyTitle")}</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
          {GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS.map((event) => (
            <span key={event} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: TREND_COLORS[event],
                }}
              />
              {t(`googlePixelActivity.events.${event}`)}
            </span>
          ))}
        </div>
      </div>
      {!hasSignal ? (
        <p style={{ ...pageHintTextStyle, margin: "12px 0 0" }}>
          {t("googlePixelActivity.chartEmpty")}
        </p>
      ) : null}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 8 }}>
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
        {GOOGLE_PIXEL_ACTIVITY_TREND_EVENTS.map((event) => {
          const points = daily.map((point, index) => ({
            x: getX(index),
            y: getY(point.counts[event] ?? 0),
          }));
          return (
            <path
              key={event}
              d={buildLinePath(points)}
              fill="none"
              stroke={TREND_COLORS[event]}
              strokeWidth="2.2"
            />
          );
        })}
        {xIndices.map((idx) => (
          <text
            key={daily[idx]?.day ?? idx}
            x={getX(idx)}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            fill={pageColorTokens.textSecondary}
          >
            {(daily[idx]?.day ?? "").slice(5)}
          </text>
        ))}
        <text x={4} y={pT + 4} fontSize="10" fill={pageColorTokens.textSecondary}>
          {maxValue}
        </text>
      </svg>
    </div>
  );
}

export function FunnelChart({ funnel }: { funnel: ActivityFunnelStep[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...funnel.map((step) => step.count));
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelActivity.funnelTitle")}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {funnel.map((step, index) => {
          const widthPct = Math.max(8, Math.round((step.count / max) * 100));
          const color =
            TREND_COLORS[step.event as keyof typeof TREND_COLORS] ?? pageColorTokens.brandGreen;
          return (
            <div key={step.event}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 12,
                  marginBottom: 4,
                }}
              >
                <span>{t(`googlePixelActivity.events.${step.event}`)}</span>
                <span style={{ color: pageColorTokens.textSecondary }}>
                  {step.count}
                  {index > 0 && step.rateFromPrev != null
                    ? ` · ${step.rateFromPrev}%`
                    : ""}
                </span>
              </div>
              <div
                style={{
                  height: 28,
                  borderRadius: 6,
                  background: pageColorTokens.surfaceMuted,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: color,
                    opacity: 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
