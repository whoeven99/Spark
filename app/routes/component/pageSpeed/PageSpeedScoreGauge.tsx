import type { PageSpeedScoreBand } from "../../../lib/pageSpeedTypes";
import { pageColorTokens } from "../../page/pageUiStyles";
import { bandColor } from "./pageSpeedUi";

export function PageSpeedScoreGauge({
  label,
  score,
  band,
}: {
  label: string;
  score: number | null;
  band: PageSpeedScoreBand | null;
}) {
  const color = bandColor(band);
  const clamped = score == null ? 0 : Math.max(0, Math.min(100, score));
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={pageColorTokens.borderSubtle}
          strokeWidth="8"
        />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={score == null ? circumference : offset}
          transform="rotate(-90 44 44)"
        />
        <text
          x="44"
          y="50"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill={pageColorTokens.textPrimary}
        >
          {score == null ? "—" : score}
        </text>
      </svg>
      <div
        style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color: pageColorTokens.textPrimary,
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
}
