import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "./pageUiStyles";
import type { Ga4StatusResponse, Ga4StatusOk } from "../api.ga4.status";

type Days = 7 | 28 | 90;
type Ga4Dimension =
  | "date"
  | "sessionDefaultChannelGroup"
  | "country"
  | "deviceCategory"
  | "landingPage";
type ActiveMetrics = { users: boolean; sessions: boolean };

type DataRow = {
  key: string;
  users: number;
  sessions: number;
  pageViews: number;
  revenue: number;
};

// ─── Formatting ────────────────────────────────────────────────────────────────

function fmtLargeNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function fmtAxisNum(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(Math.round(v));
}

function fmtCurrency(v: number): string {
  if (v === 0) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtDateAxis(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDimensionKey(key: string, dimension: Ga4Dimension): string {
  if (dimension === "deviceCategory") {
    const map: Record<string, string> = {
      desktop: "Desktop",
      mobile: "Mobile",
      tablet: "Tablet",
    };
    return map[key.toLowerCase()] ?? key;
  }
  if (dimension === "date") {
    return new Date(key + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return key || "(direct)";
}

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

function buildLinePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function niceMax(rawMax: number): number {
  if (rawMax === 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const normed = rawMax / mag;
  const nice = normed <= 1 ? 1 : normed <= 2 ? 2 : normed <= 5 ? 5 : 10;
  return nice * mag;
}

function Ga4LineChart({
  timeSeries,
  activeMetrics,
}: {
  timeSeries: DataRow[];
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

  const maxUsers = niceMax(Math.max(...timeSeries.map((r) => r.users), 0));
  const maxSessions = niceMax(Math.max(...timeSeries.map((r) => r.sessions), 0));

  const getYUsers = (v: number) => pT + chartH * (1 - v / maxUsers);
  const getYSessions = (v: number) => pT + chartH * (1 - v / maxSessions);

  const usersPts = timeSeries.map((r, i) => ({ x: getX(i), y: getYUsers(r.users) }));
  const sessionsPts = timeSeries.map((r, i) => ({ x: getX(i), y: getYSessions(r.sessions) }));

  const usersPath = buildLinePath(usersPts);
  const sessionsPath = buildLinePath(sessionsPts);

  const bottom = pT + chartH;
  const firstX = getX(0);
  const lastX = getX(n - 1);
  const buildArea = (lp: string) =>
    `${lp} L ${lastX.toFixed(1)} ${bottom.toFixed(1)} L ${firstX.toFixed(1)} ${bottom.toFixed(1)} Z`;

  const tickCount = 4;
  const leftTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxUsers * i) / tickCount),
  );
  const rightTicks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((maxSessions * i) / tickCount),
  );

  const xCount = Math.min(n, n <= 7 ? n : 8);
  const xIndices =
    xCount <= 1
      ? [0]
      : Array.from({ length: xCount }, (_, i) => Math.round((i / (xCount - 1)) * (n - 1)));

  if (n === 0) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="ga4-users-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34a853" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#34a853" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ga4-sessions-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4285f4" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#4285f4" stopOpacity="0" />
        </linearGradient>
      </defs>

      {leftTicks.map((v, i) => (
        <line
          key={i}
          x1={pL} y1={getYUsers(v)} x2={W - pR} y2={getYUsers(v)}
          stroke="#e8eaed" strokeWidth="1" strokeDasharray={i === 0 ? "none" : "4 4"}
        />
      ))}

      {activeMetrics.users &&
        leftTicks.map((v, i) => (
          <text key={i} x={pL - 7} y={getYUsers(v) + 4} textAnchor="end" fontSize="10" fill="#34a853">
            {fmtAxisNum(v)}
          </text>
        ))}

      {activeMetrics.sessions &&
        rightTicks.map((v, i) => (
          <text key={i} x={W - pR + 7} y={getYSessions(v) + 4} textAnchor="start" fontSize="10" fill="#4285f4">
            {fmtAxisNum(v)}
          </text>
        ))}

      {activeMetrics.users && usersPath && (
        <path d={buildArea(usersPath)} fill="url(#ga4-users-grad)" />
      )}
      {activeMetrics.sessions && sessionsPath && (
        <path d={buildArea(sessionsPath)} fill="url(#ga4-sessions-grad)" />
      )}

      {activeMetrics.users && usersPath && (
        <path d={usersPath} fill="none" stroke="#34a853" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {activeMetrics.sessions && sessionsPath && (
        <path d={sessionsPath} fill="none" stroke="#4285f4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}

      <line x1={pL} y1={bottom} x2={W - pR} y2={bottom} stroke="#e8eaed" strokeWidth="1" />

      {xIndices.map((idx) => (
        <text key={idx} x={getX(idx)} y={bottom + 16} textAnchor="middle" fontSize="10" fill={pageColorTokens.textSecondary}>
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
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
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

const DIMENSION_LIST: Array<{ key: Ga4Dimension; i18nKey: string }> = [
  { key: "sessionDefaultChannelGroup", i18nKey: "ga4.tabChannels" },
  { key: "country", i18nKey: "ga4.tabCountries" },
  { key: "deviceCategory", i18nKey: "ga4.tabDevices" },
  { key: "landingPage", i18nKey: "ga4.tabLandingPages" },
  { key: "date", i18nKey: "ga4.tabDays" },
];

function DimensionTabs({
  active,
  onChange,
}: {
  active: Ga4Dimension;
  onChange: (d: Ga4Dimension) => void;
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
            borderBottom: active === key ? "2px solid #34a853" : "2px solid transparent",
            background: "transparent",
            color: active === key ? "#34a853" : pageColorTokens.textSecondary,
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

const DIMENSION_COL_KEY: Record<Ga4Dimension, string> = {
  sessionDefaultChannelGroup: "ga4.colChannel",
  country: "ga4.colCountry",
  deviceCategory: "ga4.colDevice",
  landingPage: "ga4.colLandingPage",
  date: "ga4.colDate",
};

type SortKey = "users" | "sessions" | "pageViews" | "revenue";
type SortDir = "asc" | "desc";

function SortArrow({ dir, active }: { dir: SortDir; active: boolean }) {
  return (
    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: "0.7rem" }}>
      {dir === "desc" ? "↓" : "↑"}
    </span>
  );
}

function DimensionTable({
  rows,
  dimension,
  loading,
}: {
  rows: DataRow[];
  dimension: Ga4Dimension;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("users");
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
  const thSortable: React.CSSProperties = { ...thBase, textAlign: "right", cursor: "pointer", userSelect: "none" };
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
  const tdNum: React.CSSProperties = { ...tdStyle, textAlign: "right", maxWidth: "none" };

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: pageColorTokens.textSecondary, fontSize: "0.875rem" }}>
        {t("ga4.loadingData")}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: pageColorTokens.textSecondary, fontSize: "0.875rem" }}>
        {t("ga4.noData")}
      </div>
    );
  }

  const numCols: Array<{ key: SortKey; label: string }> = [
    { key: "users", label: t("ga4.colUsers") },
    { key: "sessions", label: t("ga4.colSessions") },
    { key: "pageViews", label: t("ga4.colPageViews") },
    { key: "revenue", label: t("ga4.colRevenue") },
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
            <tr key={i} style={{ background: i % 2 === 1 ? pageColorTokens.surfaceEvenRow : undefined }}>
              <td style={tdStyle} title={row.key}>
                {formatDimensionKey(row.key, dimension)}
              </td>
              <td style={tdNum}>{row.users.toLocaleString()}</td>
              <td style={tdNum}>{row.sessions.toLocaleString()}</td>
              <td style={tdNum}>{row.pageViews.toLocaleString()}</td>
              <td style={tdNum}>{fmtCurrency(row.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Days Selector ─────────────────────────────────────────────────────────────

const DAYS_OPTIONS: Array<{ value: Days; labelKey: string; labelCount?: number }> = [
  { value: 7, labelKey: "ga4.days", labelCount: 7 },
  { value: 28, labelKey: "ga4.days", labelCount: 28 },
  { value: 90, labelKey: "ga4.threeMonths" },
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
            border: `1px solid ${days === value ? "#34a853" : pageColorTokens.border}`,
            background: days === value ? "#e8f5e9" : "transparent",
            color: days === value ? "#34a853" : pageColorTokens.textSecondary,
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

export function Ga4PerformanceView({ propertyId }: { propertyId: string }) {
  const { t } = useTranslation();
  const [days, setDays] = useState<Days>(7);
  const [dimension, setDimension] = useState<Ga4Dimension>("sessionDefaultChannelGroup");
  const [activeMetrics, setActiveMetrics] = useState<ActiveMetrics>({ users: true, sessions: true });
  const [cachedData, setCachedData] = useState<Ga4StatusOk | null>(null);

  const statusFetcher = useFetcher<Ga4StatusResponse>();
  const statusFetcherRef = useRef(statusFetcher);
  statusFetcherRef.current = statusFetcher;

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days), dimension });
    if (propertyId) params.set("propertyId", propertyId);
    statusFetcherRef.current.load(`/api/ga4/status?${params.toString()}`);
  }, [days, dimension, propertyId]);

  useEffect(() => {
    if (statusFetcher.data?.ok && statusFetcher.data.connected) {
      setCachedData(statusFetcher.data as Ga4StatusOk);
    }
  }, [statusFetcher.data]);

  const toggleMetric = useCallback((metric: keyof ActiveMetrics) => {
    setActiveMetrics((prev) => ({ ...prev, [metric]: !prev[metric] }));
  }, []);

  const isLoading = statusFetcher.state !== "idle";
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
        {t("ga4.dataError")}: {error}
      </div>
    );
  }

  const summary = displayData?.summary;
  const timeSeries = displayData?.timeSeries ?? [];
  const rows = isLoading ? [] : (displayData?.rows ?? []);
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
      {/* Header */}
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
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: pageColorTokens.textPrimary }}>
            {t("ga4.performanceTitle")}
          </span>
          {dateRange && (
            <span style={{ fontSize: "0.78rem", color: pageColorTokens.textSecondary }}>
              {dateRange}
            </span>
          )}
          {displayData && displayData.propertyCount > 1 && (
            <span
              style={{
                fontSize: "0.72rem",
                color: "#2e7d32",
                background: "#e8f5e9",
                border: "1px solid rgba(52,168,83,0.25)",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              {t("ga4.mergedProperties", { count: displayData.propertyCount })}
            </span>
          )}
          <span style={{ fontSize: "0.72rem", color: pageColorTokens.textSecondary }}>
            {t("ga4.dataDelayHint")}
          </span>
        </div>
        <DaysSelector days={days} onChange={setDays} />
      </div>

      {/* Metric cards */}
      <div style={{ display: "flex", flexWrap: "wrap", borderBottom: `1px solid ${pageColorTokens.border}` }}>
        <MetricCard
          label={t("ga4.metricUsers")}
          value={summary ? fmtLargeNum(summary.totalUsers) : "—"}
          color="#34a853"
          active={activeMetrics.users}
          onToggle={() => toggleMetric("users")}
          toggleable
        />
        <MetricCard
          label={t("ga4.metricSessions")}
          value={summary ? fmtLargeNum(summary.totalSessions) : "—"}
          color="#4285f4"
          active={activeMetrics.sessions}
          onToggle={() => toggleMetric("sessions")}
          toggleable
        />
        <MetricCard
          label={t("ga4.metricPageViews")}
          value={summary ? fmtLargeNum(summary.totalPageViews) : "—"}
          color="#fbbc04"
          active={false}
          toggleable={false}
        />
        <MetricCard
          label={t("ga4.metricRevenue")}
          value={summary ? fmtCurrency(summary.totalRevenue) : "—"}
          color="#ea4335"
          active={false}
          toggleable={false}
        />
      </div>

      {/* Line chart */}
      <div style={{ padding: "16px 20px 8px" }}>
        {isLoading && timeSeries.length === 0 ? (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: pageColorTokens.textSecondary, fontSize: "0.875rem" }}>
            {t("ga4.loadingData")}
          </div>
        ) : timeSeries.length === 0 ? (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: pageColorTokens.textSecondary, fontSize: "0.875rem" }}>
            {t("ga4.noData")}
          </div>
        ) : (
          <Ga4LineChart timeSeries={timeSeries} activeMetrics={activeMetrics} />
        )}
      </div>

      {/* Dimension tabs */}
      <DimensionTabs active={dimension} onChange={setDimension} />

      {/* Table */}
      <DimensionTable rows={rows} dimension={dimension} loading={isLoading && !displayData} />
    </div>
  );
}
