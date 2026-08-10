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

export type ActivityReferralSummary = {
  paidCount: number;
  organicCount: number;
  directCount: number;
  paidPct: number;
  topReferrers: Array<{ label: string; count: number }>;
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

function conversionPillStyle(rate: number): { background: string; color: string } {
  if (rate >= 80) {
    return { background: pageColorTokens.brandGreenLight, color: pageColorTokens.brandGreenDeep };
  }
  return { background: "#fff1e8", color: "#c05717" };
}

function buildFunnelSegmentPath(
  x: number,
  y: number,
  width: number,
  height: number,
  isFirst: boolean,
  isLast: boolean,
): string {
  const taper = Math.min(10, width * 0.12);
  const topY = y;
  const bottomY = y + height;
  if (isFirst && isLast) {
    return `M ${x} ${topY} L ${x + width} ${topY} L ${x + width} ${bottomY} L ${x} ${bottomY} Z`;
  }
  if (isFirst) {
    return `M ${x} ${topY} L ${x + width} ${topY} L ${x + width - taper} ${bottomY} L ${x} ${bottomY} Z`;
  }
  if (isLast) {
    return `M ${x + taper} ${topY} L ${x + width} ${topY} L ${x + width} ${bottomY} L ${x} ${bottomY} Z`;
  }
  return `M ${x + taper} ${topY} L ${x + width} ${topY} L ${x + width - taper} ${bottomY} L ${x} ${bottomY} Z`;
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
      <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelActivity.dailyTitle")}</h3>
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
            <g key={event}>
              <path
                d={buildLinePath(points)}
                fill="none"
                stroke={TREND_COLORS[event]}
                strokeWidth="2.2"
              />
              {points.map((point, index) => (
                <circle
                  key={`${event}-${daily[index]?.day ?? index}`}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill={TREND_COLORS[event]}
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              ))}
            </g>
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
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 16,
          marginTop: 8,
          fontSize: 12,
        }}
      >
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
  );
}

export function FunnelChart({ funnel }: { funnel: ActivityFunnelStep[] }) {
  const { t } = useTranslation();
  const W = 680;
  const H = 148;
  const padX = 8;
  const barTop = 16;
  const barHeight = 52;
  const labelY = barTop + barHeight + 22;
  const countY = labelY + 16;
  const max = Math.max(1, ...funnel.map((step) => step.count));
  const chartW = W - padX * 2;
  const weightSum = funnel.reduce((sum, step) => sum + Math.max(step.count, max * 0.12), 0);

  let cursorX = padX;
  const segments = funnel.map((step, index) => {
    const weight = Math.max(step.count, max * 0.12);
    const width = (weight / weightSum) * chartW;
    const segment = { step, index, x: cursorX, width };
    cursorX += width;
    return segment;
  });

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{t("googlePixelActivity.funnelTitle")}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 12 }}>
        {segments.map(({ step, index, x, width }) => {
          const color =
            TREND_COLORS[step.event as keyof typeof TREND_COLORS] ?? pageColorTokens.brandGreen;
          const isFirst = index === 0;
          const isLast = index === funnel.length - 1;
          return (
            <g key={step.event}>
              <path
                d={buildFunnelSegmentPath(x, barTop, width, barHeight, isFirst, isLast)}
                fill={color}
              />
              <text
                x={x + width / 2}
                y={labelY}
                textAnchor="middle"
                fontSize="11"
                fill={pageColorTokens.textPrimary}
              >
                {t(`googlePixelActivity.events.${step.event}`)}
              </text>
              <text
                x={x + width / 2}
                y={countY}
                textAnchor="middle"
                fontSize="18"
                fontWeight="700"
                fill={pageColorTokens.textPrimary}
              >
                {step.count}
              </text>
              {index > 0 && step.rateFromPrev != null ? (
                (() => {
                  const pill = conversionPillStyle(step.rateFromPrev);
                  const pillX = x;
                  const pillY = barTop + barHeight / 2;
                  return (
                    <g transform={`translate(${pillX - 18}, ${pillY - 12})`}>
                      <rect
                        x={0}
                        y={0}
                        width={36}
                        height={24}
                        rx={12}
                        fill={pill.background}
                        stroke={pageColorTokens.borderSubtle}
                        strokeWidth="1"
                      />
                      <text
                        x={18}
                        y={16}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill={pill.color}
                      >
                        {step.rateFromPrev}%
                      </text>
                    </g>
                  );
                })()
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ReferralPanel({ referral }: { referral: ActivityReferralSummary }) {
  const { t } = useTranslation();
  const total = referral.paidCount + referral.organicCount + referral.directCount;
  const pct = (count: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
        {t("googlePixelActivity.referralHeadline", { pct: referral.paidPct })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: pageColorTokens.brandGreen,
              }}
            />
            {t("googlePixelActivity.referralPaid")}
          </span>
          <span style={{ color: pageColorTokens.textSecondary }}>
            {referral.paidCount} ({pct(referral.paidCount)}%)
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: pageColorTokens.borderSubtle,
              }}
            />
            {t("googlePixelActivity.referralOrganic")}
          </span>
          <span style={{ color: pageColorTokens.textSecondary }}>
            {referral.organicCount + referral.directCount} ({pct(referral.organicCount + referral.directCount)}%)
          </span>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: pageColorTokens.textSecondary,
            marginBottom: 8,
          }}
        >
          {t("googlePixelActivity.topReferrers")}
        </div>
        {referral.topReferrers.length === 0 ? (
          <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("googlePixelActivity.referralEmpty")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {referral.topReferrers.map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  gap: 8,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
                <span style={{ color: pageColorTokens.textSecondary, flexShrink: 0 }}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
