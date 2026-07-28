import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "./pageUiStyles";
import type { GscStatusResponse, GscStatusOk } from "../api.gsc.status";

type Days = 7 | 28 | 90;
type GscDimension = "query" | "page" | "country" | "device" | "searchAppearance" | "date";
type ActiveMetrics = { clicks: boolean; impressions: boolean };

type DimensionRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtLargeNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return String(Math.round(v));
}

function fmtAxisNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtPosition(v: number): string {
  return v.toFixed(1);
}

function fmtDateAxis(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDimensionKey(key: string, dimension: GscDimension): string {
  if (dimension === "device") {
    const map: Record<string, string> = { DESKTOP: "Desktop", MOBILE: "Mobile", TABLET: "Tablet" };
    return map[key.toUpperCase()] ?? key;
  }
  if (dimension === "searchAppearance") {
    const map: Record<string, string> = {
      AMP_BLUE_LINK: "AMP",
      RICHCARD: "Rich card",
      SITE_LINKS: "Sitelinks",
      VIDEO: "Video",
      REVIEW_SNIPPET: "Review snippet",
      RECIPE_RICH_SNIPPET: "Recipe",
      Q_AND_A: "Q&A",
      WEB_LIGHT_RESULT: "Web Light",
      TRANSLATED_RESULT: "Translated",
    };
    return map[key] ?? key;
  }
  if (dimension === "date") {
    const d = new Date(key + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return key;
}

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

function buildLinePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function niceMax(rawMax: number): number {
  if (rawMax === 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normed = rawMax / mag;
  const nice = normed <= 1 ? 1 : normed <= 2 ? 2 : normed <= 5 ? 5 : 10;
  return nice * mag;
}

function GscLineChart({
  timeSeries,
  activeMetrics,
}: {
  timeSeries: DimensionRow[];
  activeMetrics: ActiveMetrics;
}) {
  const W = 760;
  const H = 200;
  const pL = 58;
  const pR = 58;
  const pT = 16;
  const pB = 36;
  const chartW = W - pL - pR;
  const chartH = H - pT - pB;

  const n = timeSeries.length;
  const getX = (i: number) => pL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);

  const rawMaxClicks = Math.max(...timeSeries.map((r) => r.clicks), 0);
  const rawMaxImp = Math.max(...timeSeries.map((r) => r.impressions), 0);
  const maxClicks = niceMax(rawMaxClicks);
  const maxImp = niceMax(rawMaxImp);

  const getYClicks = (v: number) => pT + chartH * (1 - v / maxClicks);
  const getYImp = (v: number) => pT + chartH * (1 - v / maxImp);

  const clicksPts = timeSeries.map((r, i) => ({ x: getX(i), y: getYClicks(r.clicks) }));
  const impPts = timeSeries.map((r, i) => ({ x: getX(i), y: getYImp(r.impressions) }));

  const clicksLinePath = buildLinePath(clicksPts);
  const impLinePath = buildLinePath(impPts);

  const bottom = pT + chartH;
  const firstX = getX(0);
  const lastX = getX(n - 1);
  const buildArea = (linePath: string) =>
    `${linePath} L ${lastX.toFixed(1)} ${bottom.toFixed(1)} L ${firstX.toFixed(1)} ${bottom.toFixed(1)} Z`;

  // Y-axis ticks (5 levels: 0, 25%, 50%, 75%, 100%)
  const tickCount = 4;
  const leftTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxClicks * i) / tickCount),
  );
  const rightTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxImp * i) / tickCount),
  );

  // X-axis labels
  const xCount = Math.min(n, n <= 7 ? n : 8);
  const xIndices =
    xCount <= 1
      ? [0]
      : Array.from({ length: xCount }, (_, i) => Math.round((i / (xCount - 1)) * (n - 1)));

  if (n === 0) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="gsc-clicks-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4285f4" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#4285f4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gsc-imp-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9334ea" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#9334ea" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal grid lines */}
      {leftTicks.map((v, i) => (
        <line
          key={i}
          x1={pL}
          y1={getYClicks(v)}
          x2={W - pR}
          y2={getYClicks(v)}
          stroke="#e8eaed"
          strokeWidth="1"
          strokeDasharray={i === 0 ? "none" : "4 4"}
        />
      ))}

      {/* Left Y-axis labels (clicks, blue) */}
      {activeMetrics.clicks &&
        leftTicks.map((v, i) => (
          <text
            key={i}
            x={pL - 7}
            y={getYClicks(v) + 4}
            textAnchor="end"
            fontSize="10"
            fill="#4285f4"
          >
            {fmtAxisNum(v)}
          </text>
        ))}

      {/* Right Y-axis labels (impressions, purple) */}
      {activeMetrics.impressions &&
        rightTicks.map((v, i) => (
          <text
            key={i}
            x={W - pR + 7}
            y={getYImp(v) + 4}
            textAnchor="start"
            fontSize="10"
            fill="#9334ea"
          >
            {fmtAxisNum(v)}
          </text>
        ))}

      {/* Area fills */}
      {activeMetrics.clicks && clicksLinePath && (
        <path d={buildArea(clicksLinePath)} fill="url(#gsc-clicks-grad)" />
      )}
      {activeMetrics.impressions && impLinePath && (
        <path d={buildArea(impLinePath)} fill="url(#gsc-imp-grad)" />
      )}

      {/* Lines */}
      {activeMetrics.clicks && clicksLinePath && (
        <path
          d={clicksLinePath}
          fill="none"
          stroke="#4285f4"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {activeMetrics.impressions && impLinePath && (
        <path
          d={impLinePath}
          fill="none"
          stroke="#9334ea"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* X-axis baseline */}
      <line x1={pL} y1={bottom} x2={W - pR} y2={bottom} stroke="#e8eaed" strokeWidth="1" />

      {/* X-axis labels */}
      {xIndices.map((idx) => (
        <text
          key={idx}
          x={getX(idx)}
          y={bottom + 16}
          textAnchor="middle"
          fontSize="10"
          fill="#6b7280"
        >
          {fmtDateAxis(timeSeries[idx].key)}
        </text>
      ))}
    </svg>
  );
}

// ─── Metric Cards ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
  active,
  onToggle,
  toggleable,
}: {
  label: string;
  value: string;
  color: string;
  active: boolean;
  onToggle?: () => void;
  toggleable: boolean;
}) {
  return (
    <div
      onClick={toggleable ? onToggle : undefined}
      style={{
        flex: "1 1 140px",
        minWidth: 120,
        padding: "12px 16px",
        borderTop: `3px solid ${active ? color : "transparent"}`,
        borderBottom: `1px solid ${pageColorTokens.border}`,
        borderLeft: "1px solid transparent",
        borderRight: "1px solid transparent",
        background: active ? `${color}0d` : "transparent",
        cursor: toggleable ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        {toggleable && (
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: active ? color : "transparent",
              border: `2px solid ${color}`,
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: pageColorTokens.textPrimary }}>
        {value}
      </div>
    </div>
  );
}

// ─── Dimension Tabs ────────────────────────────────────────────────────────────

const DIMENSION_LIST: Array<{ key: GscDimension; i18nKey: string }> = [
  { key: "query", i18nKey: "gsc.tabQueries" },
  { key: "page", i18nKey: "gsc.tabPages" },
  { key: "country", i18nKey: "gsc.tabCountries" },
  { key: "device", i18nKey: "gsc.tabDevices" },
  { key: "searchAppearance", i18nKey: "gsc.tabSearchAppearance" },
  { key: "date", i18nKey: "gsc.tabDays" },
];

function DimensionTabs({
  active,
  onChange,
}: {
  active: GscDimension;
  onChange: (d: GscDimension) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${pageColorTokens.border}`,
        overflowX: "auto",
      }}
    >
      {DIMENSION_LIST.map(({ key, i18nKey }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: "10px 18px",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.03em",
            border: "none",
            borderBottom: active === key ? "2px solid #4285f4" : "2px solid transparent",
            background: "transparent",
            color: active === key ? "#4285f4" : pageColorTokens.textSecondary,
            cursor: "pointer",
            whiteSpace: "nowrap",
            marginBottom: -1,
          }}
        >
          {t(i18nKey)}
        </button>
      ))}
    </div>
  );
}

// ─── Dimension Table ───────────────────────────────────────────────────────────

const DIMENSION_COL_KEY: Record<GscDimension, string> = {
  query: "gsc.colQuery",
  page: "gsc.colPage",
  country: "gsc.colCountry",
  device: "gsc.colDevice",
  searchAppearance: "gsc.colAppearance",
  date: "gsc.colDate",
};

type SortKey = "clicks" | "impressions" | "ctr" | "position";
type SortDir = "asc" | "desc";

function SortArrow({ dir, active }: { dir: SortDir; active: boolean }) {
  return (
    <span
      style={{
        marginLeft: 4,
        opacity: active ? 1 : 0.3,
        fontSize: "0.7rem",
        display: "inline-block",
      }}
    >
      {dir === "desc" ? "↓" : "↑"}
    </span>
  );
}

function DimensionTable({
  rows,
  dimension,
  loading,
}: {
  rows: DimensionRow[];
  dimension: GscDimension;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  const sortedRows = [...rows].sort((a, b) => {
    const mult = sortDir === "desc" ? -1 : 1;
    return mult * (a[sortKey] - b[sortKey]);
  });

  const thBase: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "0.76rem",
    fontWeight: 600,
    color: pageColorTokens.textSecondary,
    borderBottom: `1px solid ${pageColorTokens.border}`,
    whiteSpace: "nowrap",
    letterSpacing: "0.04em",
    textAlign: "left",
  };
  const thSortable: React.CSSProperties = {
    ...thBase,
    textAlign: "right",
    cursor: "pointer",
    userSelect: "none",
  };
  const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "0.84rem",
    color: pageColorTokens.textPrimary,
    borderBottom: `1px solid ${pageColorTokens.divider}`,
    maxWidth: 280,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", maxWidth: "none" };

  if (loading) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: pageColorTokens.textSecondary,
          fontSize: "0.875rem",
        }}
      >
        {t("gsc.loadingData")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        style={{
          padding: "2rem",
          textAlign: "center",
          color: pageColorTokens.textSecondary,
          fontSize: "0.875rem",
        }}
      >
        {t("gsc.noData")}
      </div>
    );
  }

  const numCols: Array<{ key: SortKey; label: string }> = [
    { key: "clicks", label: t("gsc.colClicks") },
    { key: "impressions", label: t("gsc.colImpressions") },
    { key: "ctr", label: t("gsc.colCtr") },
    { key: "position", label: t("gsc.colPosition") },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thBase}>{t(DIMENSION_COL_KEY[dimension])}</th>
            {numCols.map(({ key, label }) => (
              <th key={key} style={thSortable} onClick={() => handleSort(key)}>
                {label}
                <SortArrow dir={sortKey === key ? sortDir : "desc"} active={sortKey === key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr
              key={i}
              style={{ background: i % 2 === 1 ? pageColorTokens.surfaceEvenRow : undefined }}
            >
              <td style={tdStyle} title={row.key}>
                {formatDimensionKey(row.key, dimension)}
              </td>
              <td style={tdNumStyle}>{row.clicks.toLocaleString()}</td>
              <td style={tdNumStyle}>{row.impressions.toLocaleString()}</td>
              <td style={tdNumStyle}>{fmtPercent(row.ctr)}</td>
              <td style={tdNumStyle}>{fmtPosition(row.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Days Selector ─────────────────────────────────────────────────────────────

const DAYS_OPTIONS: Array<{ value: Days; labelKey: string; labelCount?: number }> = [
  { value: 7, labelKey: "gsc.days", labelCount: 7 },
  { value: 28, labelKey: "gsc.days", labelCount: 28 },
  { value: 90, labelKey: "gsc.threeMonths" },
];

function DaysSelector({ days, onChange }: { days: Days; onChange: (d: Days) => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      {DAYS_OPTIONS.map(({ value, labelKey, labelCount }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          style={{
            padding: "0.3rem 0.8rem",
            borderRadius: 20,
            border: `1px solid ${days === value ? "#4285f4" : pageColorTokens.border}`,
            background: days === value ? "#e8f0fe" : "transparent",
            color: days === value ? "#4285f4" : pageColorTokens.textSecondary,
            fontWeight: days === value ? 600 : 400,
            fontSize: "0.8rem",
            cursor: "pointer",
          }}
        >
          {labelCount !== undefined ? t(labelKey, { count: labelCount }) : t(labelKey)}
        </button>
      ))}
    </div>
  );
}

// ─── Main Performance View ─────────────────────────────────────────────────────

export function GscPerformanceView() {
  const { t } = useTranslation();

  const [days, setDays] = useState<Days>(7);
  const [dimension, setDimension] = useState<GscDimension>("query");
  const [activeMetrics, setActiveMetrics] = useState<ActiveMetrics>({
    clicks: true,
    impressions: true,
  });

  // Cache the last successful full data to keep chart stable during dimension tab changes
  const [cachedData, setCachedData] = useState<GscStatusOk | null>(null);

  const statusFetcher = useFetcher<GscStatusResponse>();
  const statusFetcherRef = useRef(statusFetcher);
  statusFetcherRef.current = statusFetcher;

  // Fetch data when days or dimension changes
  useEffect(() => {
    statusFetcherRef.current.load(`/api/gsc/status?days=${days}&dimension=${dimension}`);
  }, [days, dimension]);

  // Cache successful responses
  useEffect(() => {
    if (statusFetcher.data?.ok && statusFetcher.data.connected) {
      setCachedData(statusFetcher.data as GscStatusOk);
    }
  }, [statusFetcher.data]);

  const toggleMetric = useCallback((metric: keyof ActiveMetrics) => {
    setActiveMetrics((prev) => ({
      ...prev,
      [metric]: !prev[metric],
    }));
  }, []);

  const isLoading = statusFetcher.state !== "idle";
  const isTableLoading = isLoading;
  const displayData = cachedData;
  const error =
    statusFetcher.data && !statusFetcher.data.ok
      ? (statusFetcher.data as { ok: false; error: string }).error
      : null;

  if (error) {
    return (
      <div
        style={{
          padding: "1rem",
          background: pageColorTokens.criticalBg,
          border: `1px solid ${pageColorTokens.critical}`,
          borderRadius: pageColorTokens.radiusCard,
          color: pageColorTokens.criticalText,
          fontSize: "0.875rem",
        }}
      >
        {t("gsc.dataError")}: {error}
      </div>
    );
  }

  const summary = displayData?.summary;
  const timeSeries = displayData?.timeSeries ?? [];
  const rows = isTableLoading ? [] : (displayData?.rows ?? []);
  const dateRange =
    displayData?.startDate && displayData?.endDate
      ? fmtDateRange(displayData.startDate, displayData.endDate)
      : null;

  return (
    <div
      style={{
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        borderRadius: pageColorTokens.radiusCard,
        overflow: "hidden",
      }}
    >
      {/* Header: title + date range + days selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px 12px",
          borderBottom: `1px solid ${pageColorTokens.border}`,
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: "0.95rem",
              color: pageColorTokens.textPrimary,
            }}
          >
            {t("gsc.performanceTitle")}
          </span>
          {dateRange && (
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {dateRange}
            </span>
          )}
        </div>
        <DaysSelector days={days} onChange={setDays} />
      </div>

      {/* Metric summary cards */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          borderBottom: `1px solid ${pageColorTokens.border}`,
        }}
      >
        <MetricCard
          label={t("gsc.metricClicks")}
          value={summary ? fmtLargeNum(summary.totalClicks) : "—"}
          color="#4285f4"
          active={activeMetrics.clicks}
          onToggle={() => toggleMetric("clicks")}
          toggleable
        />
        <MetricCard
          label={t("gsc.metricImpressions")}
          value={summary ? fmtLargeNum(summary.totalImpressions) : "—"}
          color="#9334ea"
          active={activeMetrics.impressions}
          onToggle={() => toggleMetric("impressions")}
          toggleable
        />
        <MetricCard
          label={t("gsc.metricCtr")}
          value={summary ? fmtPercent(summary.avgCtr) : "—"}
          color="#00a67c"
          active={false}
          toggleable={false}
        />
        <MetricCard
          label={t("gsc.metricPosition")}
          value={summary ? fmtPosition(summary.avgPosition) : "—"}
          color="#f5a623"
          active={false}
          toggleable={false}
        />
      </div>

      {/* Line chart */}
      <div style={{ padding: "16px 20px 8px" }}>
        {isLoading && timeSeries.length === 0 ? (
          <div
            style={{
              height: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: pageColorTokens.textSecondary,
              fontSize: "0.875rem",
            }}
          >
            {t("gsc.loadingData")}
          </div>
        ) : timeSeries.length === 0 ? (
          <div
            style={{
              height: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: pageColorTokens.textSecondary,
              fontSize: "0.875rem",
            }}
          >
            {t("gsc.noData")}
          </div>
        ) : (
          <GscLineChart timeSeries={timeSeries} activeMetrics={activeMetrics} />
        )}
      </div>

      {/* Dimension tabs */}
      <DimensionTabs active={dimension} onChange={setDimension} />

      {/* Table */}
      <DimensionTable
        rows={rows}
        dimension={dimension}
        loading={isTableLoading && !displayData}
      />
    </div>
  );
}
