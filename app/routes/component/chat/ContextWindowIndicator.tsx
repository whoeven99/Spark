import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const ratio = Math.min(currentTokens / maxTokens, 1);
  const percent = Math.round(ratio * 100);
  const color = getColor(ratio);
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <div
      style={containerStyle}
      title={t("workspace.shell.chat.contextUsage", {
        current: formatTokenCount(currentTokens),
        max: formatTokenCount(maxTokens),
        percent,
      })}
      aria-label={t("workspace.shell.chat.contextUsage", {
        current: formatTokenCount(currentTokens),
        max: formatTokenCount(maxTokens),
        percent,
      })}
    >
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
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: 4,
  borderRadius: 999,
  background: "transparent",
  lineHeight: 1,
  userSelect: "none",
  whiteSpace: "nowrap",
};

const svgStyle: CSSProperties = {
  flexShrink: 0,
};
