import type { PageSpeedMetric } from "../../../lib/pageSpeedTypes";
import { bandColor, pageSpeedCardStyle, pageSpeedMutedTextStyle } from "./pageSpeedUi";

export function PageSpeedMetricsRow({
  metrics,
  isMobile,
}: {
  metrics: PageSpeedMetric[];
  isMobile: boolean;
}) {
  if (metrics.length === 0) return null;

  return (
    <div style={pageSpeedCardStyle}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(5, minmax(0, 1fr))",
          gap: "0.75rem",
        }}
      >
        {metrics.map((metric) => (
          <div key={metric.id} style={{ minWidth: 0 }}>
            <div style={pageSpeedMutedTextStyle}>{metric.title}</div>
            <div
              style={{
                marginTop: 4,
                fontSize: "1.15rem",
                fontWeight: 700,
                color: bandColor(metric.band),
              }}
            >
              {metric.displayValue}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
