import type { CSSProperties } from "react";

type Props = {
  currentTokens: number;
  maxTokens: number;
};

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function getColor(ratio: number): string {
  if (ratio > 0.85) return "#dc2626";
  if (ratio > 0.6) return "#f59e0b";
  return "#4070f4";
}

const RING_SIZE = 22;
const STROKE_WIDTH = 3;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ContextWindowIndicator({ currentTokens, maxTokens }: Props) {
  const ratio = Math.min(currentTokens / maxTokens, 1);
  const percent = Math.round(ratio * 100);
  const color = getColor(ratio);
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div style={containerStyle}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        style={svgStyle}
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>
      <span style={{ ...labelStyle, color }}>
        {formatTokenCount(currentTokens)} / {formatTokenCount(maxTokens)}
      </span>
      <span style={{ ...percentStyle, color }}>{percent}%</span>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 8px",
  borderRadius: 6,
  background: "rgba(107, 114, 128, 0.06)",
  fontSize: 11,
  lineHeight: 1,
  userSelect: "none",
  whiteSpace: "nowrap",
};

const svgStyle: CSSProperties = {
  flexShrink: 0,
};

const labelStyle: CSSProperties = {
  fontWeight: 500,
  fontVariantNumeric: "tabular-nums",
};

const percentStyle: CSSProperties = {
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
};
