import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Table,
  Spin,
  Alert,
  Drawer,
  Descriptions,
  Typography,
  Tag,
  Collapse,
  Space,
  Button,
  Tooltip,
  Badge,
  Spin as AntSpin,
  Modal,
  message,
} from "antd";
import { ApiOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import {
  fetchTranslations,
  fetchTranslationJob,
  fetchTranslationContent,
  fetchTranslationContentModules,
  fetchLLMKeyStats,
  fetchLLMKeyHistory,
  repairStuckTranslationJobs,
  type TranslationJob,
  type TranslationContentPage,
  type TranslationContentModule,
  type LLMKeyStats,
  type LLMKeyHistoryEntry,
} from "../api";

/* ──────────────────────────────────────────────────────────────────────────
   Design tokens (shared visual language with 自动翻译监控)
   ──────────────────────────────────────────────────────────────────────── */

const FONT = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const C = {
  bg: "#eef0f3",
  card: "#fff",
  border: "#e6e8ec",
  borderSoft: "#f2f3f5",
  ink: "#1a1d21",
  sub: "#6b7280",
  faint: "#9aa0a8",
  track: "#edeef1",
  done: "#1f9d57",
  active: "#2f6df0",
  failed: "#d93838",
  warn: "#e08a16",
  verify: "#7c52e6",
};

/** Inject IBM Plex once. */
function useDesignFont() {
  useEffect(() => {
    const id = "ibm-plex-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);

    const styleId = "tx-redesign-style";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        @keyframes txPulseDot { 0%,100%{opacity:1} 50%{opacity:.25} }
        .tx-row:hover { background:#f7f8fa !important; }
      `;
      document.head.appendChild(s);
    }
  }, []);
}

/* ──────────────────────────────────────────────────────────────────────────
   Status / progress helpers
   ──────────────────────────────────────────────────────────────────────── */

const ACTIVE_STATUSES = new Set([
  "INIT_QUEUED",
  "INITIALIZING",
  "INIT_DONE",
  "TRANSLATE_QUEUED",
  "TRANSLATING",
  "TRANSLATE_DONE",
  "WRITEBACK_QUEUED",
  "WRITING_BACK",
  "VERIFY_QUEUED",
  "VERIFYING",
]);

type StatusStyle = {
  label: string;
  bg: string;
  fg: string;
  dot: string;
  accent: string;
};

function statusStyle(status: string): StatusStyle {
  const s = status.toUpperCase();
  if (s === "COMPLETED")
    return { label: "已完成", bg: "#e7f3ec", fg: "#16703f", dot: C.done, accent: "#cdd2d8" };
  if (s === "FAILED")
    return { label: "已失败", bg: "#fdecec", fg: "#a11c1c", dot: C.failed, accent: C.failed };
  if (s === "CANCELLED")
    return { label: "已取消", bg: "#f4f5f7", fg: C.sub, dot: "#aeb3ba", accent: "#cdd2d8" };
  if (s === "PAUSED")
    return { label: "已暂停", bg: "#f4f5f7", fg: C.sub, dot: "#aeb3ba", accent: "#cdd2d8" };
  if (s.includes("VERIF"))
    return { label: "验证中", bg: "#f0ecfd", fg: "#5a3bbf", dot: C.verify, accent: C.verify };
  if (s.includes("WRIT"))
    return { label: "写回中", bg: "#fff3e3", fg: "#9a5a08", dot: C.warn, accent: C.warn };
  if (s.includes("TRANSLAT"))
    return { label: "翻译中", bg: "#e8effe", fg: "#1f4fc4", dot: C.active, accent: C.active };
  if (s.includes("INIT"))
    return { label: "初始化", bg: "#eef0f3", fg: "#52585f", dot: "#7a818a", accent: "#7a818a" };
  return { label: status, bg: "#f4f5f7", fg: C.sub, dot: "#aeb3ba", accent: "#cdd2d8" };
}

function StatusPill({ status }: { status: string }) {
  const st = statusStyle(status);
  const pulse = ACTIVE_STATUSES.has(status.toUpperCase());
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 22,
        padding: "0 9px",
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 600,
        background: st.bg,
        color: st.fg,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: st.dot,
          animation: pulse ? "txPulseDot 1.6s infinite" : undefined,
        }}
      />
      {st.label}
    </span>
  );
}

function calcProgress(job: TranslationJob): number {
  if (typeof job.progressPercent === "number") return job.progressPercent;
  const m = job.metrics;
  const total = m.translateTotal || m.initTotal;
  if (total === 0) return job.status === "COMPLETED" ? 100 : 0;
  const done = m.translateDone + m.translateFailed;
  return Math.round((done / total) * 100);
}

const PHASE_DEFS = [
  { key: "init", label: "初始化" },
  { key: "translate", label: "翻译" },
  { key: "writeback", label: "写回" },
  { key: "verify", label: "验证" },
] as const;

type PhaseView = { label: string; fill: number; color: string; labelColor: string; detail: string };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function failedStageIndex(job: TranslationJob): number {
  const up = (job.errorStage ?? "").toUpperCase();
  if (up.includes("VERIF")) return 3;
  if (up.includes("WRIT")) return 2;
  if (up.includes("TRANSLAT")) return 1;
  if (up.includes("INIT")) return 0;
  const m = job.metrics;
  if (m.verifyTotal > 0 || m.verifyDone > 0) return 3;
  if (m.writebackTotal > 0 || m.writebackDone > 0) return 2;
  if (m.translateTotal > 0 || m.translateDone > 0) return 1;
  return 0;
}

function computePhases(job: TranslationJob): PhaseView[] {
  const m = job.metrics;
  const ratios: (number | null)[] = [
    m.initTotal > 0 ? m.initDone / m.initTotal : null,
    m.translateUnitTotal > 0
      ? m.translateUnitDone / m.translateUnitTotal
      : m.translateTotal > 0
        ? m.translateDone / m.translateTotal
        : null,
    m.writebackTotal > 0 ? m.writebackDone / m.writebackTotal : null,
    m.verifyTotal > 0 ? m.verifyDone / m.verifyTotal : null,
  ];
  const details = [
    `${m.initDone}/${m.initTotal}`,
    m.translateUnitTotal > 0
      ? `${m.translateUnitDone}/${m.translateUnitTotal} 子节点`
      : `${m.translateDone}/${m.translateTotal}`,
    `${m.writebackDone}/${m.writebackTotal}`,
    `${m.verifyDone}/${m.verifyTotal}`,
  ];

  const completed = job.status === "COMPLETED";
  const failed = job.status === "FAILED";
  const failStage = failed ? failedStageIndex(job) : -1;
  const laterProgress = (i: number) => ratios.some((r, j) => j > i && (r ?? 0) > 0);

  return PHASE_DEFS.map((def, i) => {
    const ratio = ratios[i] ?? 0;
    let fill = 0;
    let color = C.track;
    let labelColor = "#aeb3ba";

    if (completed) {
      fill = 1;
      color = C.done;
      labelColor = "#3a3f45";
    } else if (failed) {
      if (i < failStage) {
        fill = 1;
        color = C.done;
        labelColor = "#3a3f45";
      } else if (i === failStage) {
        fill = ratio > 0 ? ratio : 1;
        color = C.failed;
        labelColor = C.failed;
      }
    } else if (ratio >= 1 || laterProgress(i)) {
      fill = 1;
      color = C.done;
      labelColor = "#3a3f45";
    } else if (ratio > 0) {
      fill = ratio;
      color = C.active;
      labelColor = C.active;
    }

    return { label: def.label, fill: clamp01(fill), color, labelColor, detail: details[i] };
  });
}

/** Segmented 4-phase pipeline bar with labels under each segment. */
function PipelineBar({ job }: { job: TranslationJob }) {
  const pct = calcProgress(job);
  const phases = computePhases(job);
  const pctColor =
    job.status === "FAILED" ? C.failed : job.status === "COMPLETED" ? C.done : C.ink;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 5, flex: 1, minWidth: 0 }}>
        {phases.map((p) => (
          <Tooltip key={p.label} title={`${p.label} · ${p.detail}`}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ height: 6, borderRadius: 4, background: C.track, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${p.fill * 100}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: p.color,
                    transition: "width .3s ease",
                  }}
                />
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: p.labelColor, whiteSpace: "nowrap" }}>
                {p.label}
              </span>
            </div>
          </Tooltip>
        ))}
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: MONO,
          color: pctColor,
          width: 38,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Formatting helpers
   ──────────────────────────────────────────────────────────────────────── */

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtRpm(remaining: number, limit: number): string {
  if (limit < 0) return "—";
  return `${fmtNum(remaining)} / ${fmtNum(limit)}`;
}

function fmtAgo(epochMs: number): string {
  if (!epochMs) return "—";
  const diff = Math.round((Date.now() - epochMs) / 1_000);
  if (diff < 60) return `${diff}s 前`;
  if (diff < 3600) return `${Math.round(diff / 60)}min 前`;
  return `${Math.round(diff / 3600)}h 前`;
}

/* ──────────────────────────────────────────────────────────────────────────
   LLM Key history charts (functionally unchanged)
   ──────────────────────────────────────────────────────────────────────── */

function fmtTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type ChartPoint = {
  time: string;
  calls: number;
  tokens: number;
  latMs: number;
  conc: number;
  rpmPct: number | null;
  tpmPct: number | null;
};

function buildChartData(entries: LLMKeyHistoryEntry[]): ChartPoint[] {
  return entries.map((e) => ({
    time: fmtTime(e.t),
    calls: e.dC,
    tokens: e.dT,
    latMs: e.lat,
    conc: e.conc,
    rpmPct: e.lR > 0 ? Math.round((e.rR / e.lR) * 100) : null,
    tpmPct: e.lT > 0 ? Math.round((e.rT / e.lT) * 100) : null,
  }));
}

function KeyHistoryCharts({ label }: { label: string }) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLLMKeyHistory(label)
      .then((r) => {
        const entries = r.history[label] ?? [];
        setData(buildChartData(entries));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [label]);

  if (loading) return <AntSpin size="small" style={{ padding: 16 }} />;
  if (data.length === 0) {
    return (
      <Typography.Text type="secondary" style={{ padding: "8px 16px", display: "block" }}>
        暂无历史数据（翻译任务运行时每 10s 记录一次，保留最近 30 分钟）
      </Typography.Text>
    );
  }

  const hasPct = data.some((d) => d.rpmPct !== null || d.tpmPct !== null);

  return (
    <div style={{ padding: "12px 0", display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 340px", minWidth: 280 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          吞吐量（每 10s）
        </Typography.Text>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="calls" tick={{ fontSize: 10 }} width={28} />
            <YAxis
              yAxisId="tokens"
              orientation="right"
              tick={{ fontSize: 10 }}
              width={36}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
            />
            <RechartTooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) =>
                name === "tokens" ? [`${fmtNum(value)}`, "Token"] : [value, "调用"]
              }
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="calls" dataKey="calls" name="调用" fill={C.active} opacity={0.7} maxBarSize={12} />
            <Line yAxisId="tokens" dataKey="tokens" name="tokens" stroke={C.done} dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ flex: "1 1 300px", minWidth: 260 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          延迟 & 并发上限
        </Typography.Text>
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="lat" tick={{ fontSize: 10 }} width={36} tickFormatter={(v: number) => `${v}ms`} />
            <YAxis yAxisId="conc" orientation="right" tick={{ fontSize: 10 }} width={24} />
            <RechartTooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(value: number, name: string) =>
                name === "conc" ? [value, "并发上限"] : [`${value}ms`, "延迟"]
              }
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="lat" dataKey="latMs" name="延迟ms" stroke={C.warn} dot={false} strokeWidth={1.5} />
            <Line
              yAxisId="conc"
              dataKey="conc"
              name="conc"
              stroke={C.verify}
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {hasPct && (
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
            配额余量 %（RPM / TPM）
          </Typography.Text>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={28} tickFormatter={(v: number) => `${v}%`} />
              <RechartTooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(value: string | number, name: string) =>
                  value == null ? ["—", name] : [`${value}%`, name]
                }
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {data.some((d) => d.rpmPct !== null) && (
                <Area dataKey="rpmPct" name="RPM%" stroke={C.active} fill="#e6f7ff" strokeWidth={1.5} dot={false} connectNulls />
              )}
              {data.some((d) => d.tpmPct !== null) && (
                <Area dataKey="tpmPct" name="TPM%" stroke={C.done} fill="#f6ffed" strokeWidth={1.5} dot={false} connectNulls />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   LLM Key Stats Panel (kept as a collapsible card, restyled trigger)
   ──────────────────────────────────────────────────────────────────────── */

function LLMKeyStatsPanel() {
  const [stats, setStats] = useState<LLMKeyStats[]>([]);
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    fetchLLMKeyStats()
      .then((r) => {
        setStats(r.stats);
        setNote(r.note ?? "");
        setLastFetch(Date.now());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: "Key",
      dataIndex: "label",
      key: "label",
      render: (v: string) => (
        <Typography.Text code style={{ fontSize: 12 }}>
          {v}
        </Typography.Text>
      ),
    },
    { title: "调用次数", dataIndex: "calls", key: "calls", render: (v: number) => fmtNum(v), sorter: (a: LLMKeyStats, b: LLMKeyStats) => a.calls - b.calls },
    { title: "Token 消耗", dataIndex: "tokens", key: "tokens", render: (v: number) => fmtNum(v), sorter: (a: LLMKeyStats, b: LLMKeyStats) => a.tokens - b.tokens },
    { title: "平均延迟", dataIndex: "avgLatencyMs", key: "avgLatencyMs", render: (v: number) => (v > 0 ? `${v}ms` : "—") },
    {
      title: <Tooltip title="并发上限由 AdaptiveSemaphore 根据 X-RateLimit 响应头实时计算，所有 key 共享">并发上限</Tooltip>,
      dataIndex: "poolConcurrency",
      key: "poolConcurrency",
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: <Tooltip title="RPM 剩余 / 上限（-1 表示 provider 未返回）">RPM 剩余/上限</Tooltip>,
      key: "rpm",
      render: (_: unknown, r: LLMKeyStats) => (
        <Typography.Text
          type={r.remainingReq >= 0 && r.limitReq > 0 && r.remainingReq < r.limitReq * 0.2 ? "danger" : undefined}
          style={{ fontSize: 12 }}
        >
          {fmtRpm(r.remainingReq, r.limitReq)}
        </Typography.Text>
      ),
    },
    {
      title: <Tooltip title="TPM 剩余 / 上限（-1 表示 provider 未返回）">TPM 剩余/上限</Tooltip>,
      key: "tpm",
      render: (_: unknown, r: LLMKeyStats) => (
        <Typography.Text
          type={r.remainingTok >= 0 && r.limitTok > 0 && r.remainingTok < r.limitTok * 0.2 ? "danger" : undefined}
          style={{ fontSize: 12 }}
        >
          {fmtRpm(r.remainingTok, r.limitTok)}
        </Typography.Text>
      ),
    },
    {
      title: "限流次数",
      dataIndex: "throttleCount",
      key: "throttleCount",
      render: (v: number) => (v > 0 ? <Typography.Text type="warning">{v}</Typography.Text> : <Typography.Text type="secondary">0</Typography.Text>),
    },
    {
      title: "错误数",
      dataIndex: "errors",
      key: "errors",
      render: (v: number) => (v > 0 ? <Typography.Text type="danger">{v}</Typography.Text> : <Typography.Text type="secondary">0</Typography.Text>),
    },
    {
      title: "最后更新",
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (v: number) => (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          {fmtAgo(v)}
        </Typography.Text>
      ),
    },
  ];

  const headerExtra = (
    <Space size={8}>
      {lastFetch > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Worker 每 10s 写入一次
        </Typography.Text>
      )}
      <Button
        size="small"
        icon={<ReloadOutlined />}
        loading={loading}
        onClick={(e) => {
          e.stopPropagation();
          load();
        }}
      >
        刷新
      </Button>
    </Space>
  );

  return (
    <Collapse
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}
      items={[
        {
          key: "llm-keys",
          label: (
            <Space>
              <ApiOutlined style={{ color: C.active }} />
              <span style={{ fontWeight: 600 }}>LLM Key 调用情况</span>
              {stats.length > 0 && <Tag color="processing">{stats.length} 个 Key</Tag>}
            </Space>
          ),
          extra: headerExtra,
          children: (
            <Spin spinning={loading}>
              {note && <Alert type="warning" message={note} style={{ marginBottom: 8 }} showIcon />}
              {stats.length === 0 && !loading ? (
                <Typography.Text type="secondary">暂无数据（翻译任务运行时会自动上报）</Typography.Text>
              ) : (
                <Table
                  dataSource={stats}
                  columns={columns}
                  rowKey="label"
                  size="small"
                  pagination={false}
                  expandable={{
                    expandedRowRender: (row: LLMKeyStats) => <KeyHistoryCharts label={row.label} />,
                    rowExpandable: () => true,
                    expandRowByClick: false,
                  }}
                />
              )}
            </Spin>
          ),
        },
      ]}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   UI primitives
   ──────────────────────────────────────────────────────────────────────── */

function Kpi({ label, value, unit, accent, valColor }: { label: string; value: React.ReactNode; unit?: string; accent: string; valColor?: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: accent }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: C.sub }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: valColor ?? C.ink, fontFamily: MONO }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.faint }}>{unit}</span>}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: C.faint,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const GRID = "minmax(0,0.9fr) 80px 72px minmax(0,2.2fr) 52px 72px 88px 52px";

/* ──────────────────────────────────────────────────────────────────────────
   翻译内容（blob）查看器 —— 模块切换 + 翻译前后对照 + 翻页
   ──────────────────────────────────────────────────────────────────────── */

const CONTENT_PAGE_SIZE = 10;

function TranslationContentViewer({ job }: { job: TranslationJob }) {
  const [modules, setModules] = useState<TranslationContentModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [module, setModule] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TranslationContentPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  // 切换任务时：拉取「确有内容」的模块列表，默认选中第一个
  useEffect(() => {
    let cancelled = false;
    setModulesLoading(true);
    setModules([]);
    setModule("");
    setPage(1);
    setData(null);
    setErr("");
    fetchTranslationContentModules({ jobId: job.id, shop: job.shopName })
      .then((r) => {
        if (cancelled) return;
        setModules(r.modules);
        setModule(r.modules[0]?.module ?? "");
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setModulesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.shopName]);

  useEffect(() => {
    if (!module) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetchTranslationContent({
      jobId: job.id,
      shop: job.shopName,
      module,
      page,
      pageSize: CONTENT_PAGE_SIZE,
    })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [job.id, job.shopName, module, page, reloadTick]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / CONTENT_PAGE_SIZE)) : 1;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>翻译内容</Typography.Title>
        {data && (
          <span style={{ fontSize: 12, color: C.sub }}>
            共 {data.total} 个资源 · {module}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={loading || modulesLoading}
          onClick={() => setReloadTick((t) => t + 1)}
        />
      </div>

      {/* 模块切换 —— 仅展示确有翻译内容的模块 */}
      {modules.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {modules.map(({ module: m, count }) => {
            const on = m === module;
            return (
              <button
                key={m}
                onClick={() => {
                  if (m === module) return;
                  setModule(m);
                  setPage(1);
                }}
                style={{
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 6,
                  border: `1px solid ${on ? C.active : C.border}`,
                  background: on ? "#e8effe" : C.card,
                  color: on ? "#1f4fc4" : C.sub,
                  fontFamily: MONO,
                }}
              >
                {m}
                {count > 0 && (
                  <span style={{ marginLeft: 5, color: on ? "#5a7fe0" : C.faint }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {err && <Alert type="error" message={err} showIcon style={{ marginBottom: 12 }} />}
      {data?.note && <Alert type="info" message={data.note} showIcon style={{ marginBottom: 12 }} />}

      <Spin spinning={loading || modulesLoading}>
        {!modulesLoading && modules.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            该任务暂无可查看的翻译内容
          </Typography.Text>
        ) : !loading && data && data.items.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            当前模块暂无可查看的翻译内容
          </Typography.Text>
        ) : (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {data?.items.map((res) => (
              <div
                key={res.resourceId}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}
              >
                <div
                  style={{
                    padding: "6px 12px",
                    background: C.borderSoft,
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <Typography.Text
                    copyable={{ text: res.resourceId }}
                    style={{ fontSize: 11.5, color: C.sub, fontFamily: MONO }}
                  >
                    {res.resourceId}
                  </Typography.Text>
                </div>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(_r, i) => String(i)}
                  dataSource={res.translations}
                  columns={[
                    {
                      title: "字段",
                      dataIndex: "key",
                      width: 110,
                      render: (v: string) => (
                        <span style={{ fontSize: 11.5, fontFamily: MONO, color: C.sub }}>{v}</span>
                      ),
                    },
                    {
                      title: "翻译前",
                      dataIndex: "originalValue",
                      render: (v: string) => <ContentCell value={v} />,
                    },
                    {
                      title: "翻译后",
                      dataIndex: "translatedValue",
                      render: (v: string, r: { status?: string }) => (
                        <ContentCell value={v} fallback={r.status === "fallback"} />
                      ),
                    },
                  ]}
                />
              </div>
            ))}
          </Space>
        )}
      </Spin>

      {/* 翻页 */}
      {data && data.total > CONTENT_PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: C.sub }}>
            第 {page} / {totalPages} 页
          </span>
          <Button size="small" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </Button>
          <Button size="small" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}

function ContentCell({ value, fallback }: { value: string; fallback?: boolean }) {
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 180,
        overflow: "auto",
        color: fallback ? C.warn : C.ink,
      }}
    >
      {value || <span style={{ color: C.faint }}>—</span>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Page
   ──────────────────────────────────────────────────────────────────────── */

type ViewFilter = "all" | "active" | "stuck" | "COMPLETED" | "FAILED" | "PAUSED";

export default function Translations() {
  useDesignFont();

  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorLevel, setErrorLevel] = useState<"error" | "warning">("error");
  const [view, setView] = useState<ViewFilter>("all");
  const [shopFilter, setShopFilter] = useState("");
  const [selected, setSelected] = useState<TranslationJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchTranslations({ limit: 200 })
      .then((r) => {
        setJobs(r.jobs);
        if ((r as { note?: string }).note) {
          setError((r as { note?: string }).note!);
          setErrorLevel("warning");
        }
      })
      .catch((e) => {
        setError(String(e));
        setErrorLevel("error");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  function openDetail(job: TranslationJob) {
    setSelected(job);
    setDetailLoading(true);
    fetchTranslationJob(job.id, job.shopName)
      .then((r) => setSelected(r.job))
      .finally(() => setDetailLoading(false));
  }

  const runRepairStuck = useCallback((jobIds?: string[]) => {
    Modal.confirm({
      title: "修复僵死任务？",
      content:
        "将把心跳超时（60 秒）仍处于初始化/翻译/写回中的任务重置为排队状态，并向 Redis 补推 hint，适用于发版后 worker 异常退出导致的卡住。",
      okText: "确认修复",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        setRepairing(true);
        try {
          const result = await repairStuckTranslationJobs({
            heartbeatGraceMs: 60_000,
            jobIds: jobIds?.length ? jobIds : undefined,
            wakeQueuedHints: true,
          });
          const n = result.repaired.length;
          const wake = result.wakeHints;
          if (n === 0 && wake === 0) {
            message.info("未发现需要修复的僵死任务");
          } else {
            message.success(`已修复 ${n} 个僵死任务，唤醒 ${wake} 个排队 hint`);
          }
          load();
        } catch (e) {
          message.error(`修复失败：${String(e)}`);
        } finally {
          setRepairing(false);
        }
      },
    });
  }, [load]);

  const stuckJobs = useMemo(() => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    return jobs.filter((j) => ACTIVE_STATUSES.has(j.status) && new Date(j.updatedAt).getTime() < cutoff);
  }, [jobs]);
  const stuckIds = useMemo(() => new Set(stuckJobs.map((j) => j.id)), [stuckJobs]);

  const counts = useMemo(() => {
    const c = { all: jobs.length, active: 0, stuck: stuckJobs.length, COMPLETED: 0, FAILED: 0, PAUSED: 0 };
    for (const j of jobs) {
      if (ACTIVE_STATUSES.has(j.status)) c.active++;
      if (j.status === "COMPLETED") c.COMPLETED++;
      if (j.status === "FAILED") c.FAILED++;
      if (j.status === "PAUSED" || j.status === "CANCELLED") c.PAUSED++;
    }
    return c;
  }, [jobs, stuckJobs]);

  const totalTokens = useMemo(() => jobs.reduce((a, j) => a + (j.metrics.usedTokens || 0), 0), [jobs]);

  const displayed = useMemo(() => {
    let list = jobs;
    if (view === "active") list = list.filter((j) => ACTIVE_STATUSES.has(j.status));
    else if (view === "stuck") list = list.filter((j) => stuckIds.has(j.id));
    else if (view !== "all") list = list.filter((j) => (view === "PAUSED" ? j.status === "PAUSED" || j.status === "CANCELLED" : j.status === view));
    const q = shopFilter.trim().toLowerCase();
    if (q) list = list.filter((j) => j.shopName.toLowerCase().includes(q));
    // stuck jobs float to top
    return [...list].sort((a, b) => Number(stuckIds.has(b.id)) - Number(stuckIds.has(a.id)));
  }, [jobs, view, shopFilter, stuckIds]);

  const filterDefs: { key: ViewFilter; label: string; count: number }[] = [
    { key: "all", label: "全部", count: counts.all },
    { key: "active", label: "进行中", count: counts.active },
    { key: "stuck", label: "卡住", count: counts.stuck },
    { key: "COMPLETED", label: "已完成", count: counts.COMPLETED },
    { key: "FAILED", label: "已失败", count: counts.FAILED },
    { key: "PAUSED", label: "已暂停", count: counts.PAUSED },
  ];

  if (error && errorLevel === "error") return <Alert type="error" message={error} />;

  return (
    <div
      style={{
        background: C.bg,
        fontFamily: FONT,
        color: C.ink,
        padding: "4px 8px 48px",
        minHeight: "calc(100vh - 64px - 48px)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>翻译任务</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#e7f3ec", border: "1px solid #bfe2cd", padding: "3px 10px 3px 8px", borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.done, animation: "txPulseDot 1.6s infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#16703f" }}>实时监控</span>
            </div>
          </div>
          <span style={{ fontSize: 13, color: C.sub }}>共 {jobs.length} 个任务 · 数据每 15s 自动刷新</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              height: 36,
              padding: "0 14px",
              border: `1px solid ${autoRefresh ? C.done : C.border}`,
              background: C.card,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              color: "#374151",
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: autoRefresh ? C.done : "#c4c8cd" }} />
            {autoRefresh ? "自动刷新 15s" : "自动刷新已关"}
          </button>
          <button
            onClick={() => runRepairStuck()}
            disabled={repairing}
            title="发版后 worker 异常退出时，回收僵死的 processing 任务并唤醒排队"
            style={{
              height: 36,
              padding: "0 16px",
              border: `1px solid ${C.failed}`,
              background: "#fff5f5",
              color: "#a11c1c",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: repairing ? "not-allowed" : "pointer",
              opacity: repairing ? 0.6 : 1,
              fontFamily: FONT,
            }}
          >
            {repairing ? "修复中…" : "修复僵死任务"}
          </button>
          <button
            onClick={load}
            style={{ height: 36, padding: "0 16px", border: "none", background: C.ink, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <Kpi label="进行中" value={counts.active} unit="任务" accent={C.active} />
        <Kpi label="卡住" value={counts.stuck} unit="需介入" accent={C.failed} valColor={counts.stuck > 0 ? C.failed : C.ink} />
        <Kpi label="已完成" value={counts.COMPLETED} unit="任务" accent={C.done} />
        <Kpi label="已失败" value={counts.FAILED} unit="任务" accent={C.warn} />
        <Kpi label="累计 Token" value={fmtNum(totalTokens)} accent={C.verify} />
      </div>

      {/* Stuck banner */}
      {stuckJobs.length > 0 && (
        <div style={{ background: "#fff5f5", border: "1px solid #f3c2c2", borderLeft: `4px solid ${C.failed}`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: C.failed, color: "#fff", fontSize: 14, fontWeight: 700 }}>!</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#a11c1c" }}>{stuckJobs.length} 个任务卡住</span>
            <span style={{ fontSize: 12, color: "#b35858" }}>超过 1 小时未更新，可能需要人工介入</span>
            <button
              onClick={() => runRepairStuck(stuckJobs.map((j) => j.id))}
              disabled={repairing}
              style={{
                marginLeft: "auto",
                height: 32,
                padding: "0 14px",
                border: `1px solid ${C.failed}`,
                background: "#fff",
                color: "#a11c1c",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: repairing ? "not-allowed" : "pointer",
                fontFamily: FONT,
              }}
            >
              {repairing ? "修复中…" : "一键修复"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {stuckJobs.map((j) => (
              <button
                key={j.id}
                onClick={() => openDetail(j)}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #ecc9c9", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{j.shopName.split(".")[0]}</span>
                <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub, background: "#f3f4f6", padding: "2px 6px", borderRadius: 5 }}>{j.source} → {j.target}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.failed }}>停滞 {fmtAgo(new Date(j.updatedAt).getTime())}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && errorLevel === "warning" && <Alert type="warning" message={error} showIcon style={{ borderRadius: 10 }} />}

      <LLMKeyStatsPanel />

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
          {filterDefs.map((f) => {
            const active = view === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setView(f.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 30,
                  padding: "0 13px",
                  border: "none",
                  borderRadius: 7,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: FONT,
                  background: active ? C.ink : "transparent",
                  color: active ? "#fff" : f.key === "stuck" && f.count > 0 ? C.failed : "#52585f",
                }}
              >
                {f.label}
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, opacity: 0.75 }}>{f.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, minWidth: 240 }}>
          <span style={{ color: C.faint, fontSize: 14 }}>⌕</span>
          <input
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            placeholder="按商店搜索…"
            style={{ border: "none", outline: "none", fontSize: 13, fontFamily: FONT, background: "transparent", flex: 1, color: C.ink }}
          />
        </div>
      </div>

      {/* Task table */}
      <Spin spinning={loading}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", maxWidth: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, padding: "12px 20px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fafbfc" }}>
            <span style={TH}>商店 / 语言</span>
            <span style={TH}>状态</span>
            <span style={TH}>模块</span>
            <span style={TH}>流水线进度</span>
            <span style={{ ...TH, textAlign: "right" }}>失败</span>
            <span style={{ ...TH, textAlign: "right" }}>Token</span>
            <span style={TH}>更新</span>
            <span />
          </div>
          {displayed.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 13 }}>没有符合条件的任务</div>
          )}
          {displayed.map((j) => {
            const stuck = stuckIds.has(j.id);
            const st = statusStyle(j.status);
            const updatedMs = new Date(j.updatedAt).getTime();
            return (
              <div
                key={j.id}
                className="tx-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID,
                  gap: 16,
                  alignItems: "center",
                  padding: "10px 20px",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  borderLeft: `3px solid ${stuck ? C.failed : st.accent}`,
                  transition: "background .12s",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.shopName}</span>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub }}>{j.source} → {j.target}</span>
                </div>
                <div><StatusPill status={j.status} /></div>
                <Tooltip
                  title={
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {j.modules.map((m) => (
                        <span key={m} style={{ fontSize: 12 }}>{m}</span>
                      ))}
                    </div>
                  }
                >
                  <span style={{ fontSize: 12, color: C.sub, fontFamily: MONO, cursor: "default" }}>{j.modules.length} 个</span>
                </Tooltip>
                <PipelineBar job={j} />
                <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", fontFamily: MONO, color: j.metrics.translateFailed > 0 ? C.failed : "#aeb3ba" }}>
                  {j.metrics.translateFailed}
                </span>
                <span style={{ fontSize: 12.5, textAlign: "right", fontFamily: MONO, color: "#4b5158" }}>{fmtNum(j.metrics.usedTokens || 0)}</span>
                <span style={{ fontSize: 12, fontWeight: stuck ? 700 : 500, color: stuck ? C.failed : C.sub }}>
                  {stuck ? "⚠ " : ""}
                  {fmtAgo(updatedMs)}
                </span>
                <button
                  onClick={() => openDetail(j)}
                  style={{ height: 28, padding: "0 10px", border: `1px solid #e0e3e8`, background: "#fff", borderRadius: 7, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: FONT }}
                >
                  详情
                </button>
              </div>
            );
          })}
        </div>
      </Spin>

      {/* Detail drawer */}
      <Drawer title="翻译任务详情" open={!!selected} onClose={() => setSelected(null)} width={820}>
        {detailLoading ? (
          <Spin />
        ) : selected ? (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务 ID">
                <Typography.Text copyable style={{ fontSize: 12 }}>
                  {selected.id}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="商店">{selected.shopName}</Descriptions.Item>
              <Descriptions.Item label="语言对">{selected.source} → {selected.target}</Descriptions.Item>
              <Descriptions.Item label="模块">{selected.modules.join(", ")}</Descriptions.Item>
              <Descriptions.Item label="AI 模型"><Tag>{selected.aiModel}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><StatusPill status={selected.status} /></Descriptions.Item>
              <Descriptions.Item label="Worker">{selected.claimedBy ?? "-"}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 24 }}>进度指标</Typography.Title>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="初始化">{selected.metrics.initDone} / {selected.metrics.initTotal}</Descriptions.Item>
              <Descriptions.Item label="翻译">{selected.metrics.translateDone} / {selected.metrics.translateTotal}</Descriptions.Item>
              {selected.metrics.translateUnitTotal > 0 ? (
                <Descriptions.Item label="子节点">{selected.metrics.translateUnitDone} / {selected.metrics.translateUnitTotal}</Descriptions.Item>
              ) : null}
              {selected.metrics.currentModule ? (
                <Descriptions.Item label="当前模块">{selected.metrics.currentModule}</Descriptions.Item>
              ) : null}
              <Descriptions.Item label="翻译失败">
                <Typography.Text type={selected.metrics.translateFailed > 0 ? "danger" : undefined}>{selected.metrics.translateFailed}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="写回">{selected.metrics.writebackDone} / {selected.metrics.writebackTotal}</Descriptions.Item>
              <Descriptions.Item label="写回失败">
                <Typography.Text type={selected.metrics.writebackFailed > 0 ? "danger" : undefined}>{selected.metrics.writebackFailed}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="消耗 Tokens">{selected.metrics.usedTokens.toLocaleString()}</Descriptions.Item>
            </Descriptions>

            {selected.errorMessage && (
              <Alert type="error" message={`失败阶段: ${selected.errorStage ?? "未知"}`} description={selected.errorMessage} style={{ marginTop: 16 }} showIcon />
            )}

            <Descriptions column={1} bordered size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="创建时间">{new Date(selected.createdAt).toLocaleString("zh-CN")}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{new Date(selected.updatedAt).toLocaleString("zh-CN")}</Descriptions.Item>
            </Descriptions>

            <TranslationContentViewer job={selected} />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
