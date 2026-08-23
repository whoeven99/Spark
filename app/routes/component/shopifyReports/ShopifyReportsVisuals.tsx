import { pageColorTokens } from "../../page/pageUiStyles";
import {
  chartAxisTicks,
  computeLinearChartDomain,
  formatReportCell,
  type ReportQueryResult,
} from "../../../lib/shopifyReports";

const SERIES_COLORS = ["#005bd3", "#008060", "#c05717"] as const;

function toNumber(value: string | number | boolean | null): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAxisLabel(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value.slice(5) || value;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function ShopifyReportsChart({
  result,
  locale,
  currencyCode,
}: {
  result: ReportQueryResult;
  locale: string;
  currencyCode: string | null;
}) {
  const xKey = result.xKey || "day";
  const seriesKeys = result.seriesKeys.filter((key) =>
    result.columns.some((column) => column.name === key),
  );
  const points = result.rows.map((row) => ({
    label: formatAxisLabel(String(row[xKey] ?? ""), locale),
    values: seriesKeys.map((key) => toNumber(row[key] ?? null)),
  }));

  if (points.length === 0 || seriesKeys.length === 0) return null;

  const width = 720;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const domain = computeLinearChartDomain(points.flatMap((point) => point.values));
  const span = domain.max - domain.min || 1;
  const ticks = chartAxisTicks(domain.min, domain.max);
  const getX = (index: number) =>
    pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const getY = (value: number) => pad.top + innerH - ((value - domain.min) / span) * innerH;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img">
        {ticks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke={pageColorTokens.borderSubtle}
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill={pageColorTokens.textSecondary}>
                {tick}
              </text>
            </g>
          );
        })}
        {seriesKeys.map((key, seriesIndex) => {
          const path = points
            .map((point, index) => {
              const command = index === 0 ? "M" : "L";
              return `${command} ${getX(index).toFixed(1)} ${getY(point.values[seriesIndex] ?? 0).toFixed(1)}`;
            })
            .join(" ");
          return (
            <path
              key={key}
              d={path}
              fill="none"
              stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {points.map((point, index) =>
          index === 0 || index === points.length - 1 || index % Math.ceil(points.length / 6) === 0 ? (
            <text
              key={point.label + index}
              x={getX(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize="10"
              fill={pageColorTokens.textSecondary}
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: 12, color: pageColorTokens.textSecondary }}>
        {seriesKeys.map((key, index) => {
          const column = result.columns.find((item) => item.name === key);
          return (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: SERIES_COLORS[index % SERIES_COLORS.length],
                }}
              />
              {column?.displayName || key}
              {column?.dataType.toUpperCase().includes("MONEY") && currencyCode ? ` (${currencyCode})` : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ShopifyReportsTable({
  result,
  locale,
  currencyCode,
}: {
  result: ReportQueryResult;
  locale: string;
  currencyCode: string | null;
}) {
  if (result.rows.length === 0) return null;
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 480 }}>
        <thead>
          <tr style={{ background: pageColorTokens.surfaceMuted, textAlign: "left", color: pageColorTokens.textSecondary }}>
            {result.columns.map((column) => (
              <th key={column.name} style={{ padding: "10px 12px", fontWeight: 600 }}>
                {column.displayName || column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {result.columns.map((column) => (
                <td
                  key={column.name}
                  style={{
                    padding: "10px 12px",
                    borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
                    color: pageColorTokens.textPrimary,
                  }}
                >
                  {formatReportCell(row[column.name] ?? null, column.dataType, { locale, currencyCode })}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
