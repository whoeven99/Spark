import { useEffect, useState, useCallback, useMemo } from "react";
import { Spin, Alert, Tag, Tooltip } from "antd";
import {
  fetchTranslations,
  fetchAutoTranslationSummary,
  AUTO_TASK_SOURCE,
  type TranslationJob,
  type AutoTranslationSummary,
} from "../api";

/* ──────────────────────────────────────────────────────────────────────────
   Shared design tokens (same visual language as 翻译任务)
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

function useDesignFont() {
  useEffect(() => {
    const id = "ibm-plex-font";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
      document.head.appendChild(link);
    }
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

const ACTIVE_STATUSES = new Set([
  "CREATED",
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

type StatusStyle = { label: string; bg: string; fg: string; dot: string; accent: string };

function statusStyle(status: string): StatusStyle {
  const s = status.toUpperCase();
  if (s === "COMPLETED") return { label: "已完成", bg: "#e7f3ec", fg: "#16703f", dot: C.done, accent: "#cdd2d8" };
  if (s === "FAILED") return { label: "已失败", bg: "#fdecec", fg: "#a11c1c", dot: C.failed, accent: C.failed };
  if (s === "CANCELLED") return { label: "已取消", bg: "#f4f5f7", fg: C.sub, dot: "#aeb3ba", accent: "#cdd2d8" };
  if (s === "PAUSED") return { label: "已暂停", bg: "#f4f5f7", fg: C.sub, dot: "#aeb3ba", accent: "#cdd2d8" };
  if (s.includes("VERIF")) return { label: "验证中", bg: "#f0ecfd", fg: "#5a3bbf", dot: C.verify, accent: C.verify };
  if (s.includes("WRIT")) return { label: "写回中", bg: "#fff3e3", fg: "#9a5a08", dot: C.warn, accent: C.warn };
  if (s.includes("TRANSLAT")) return { label: "翻译中", bg: "#e8effe", fg: "#1f4fc4", dot: C.active, accent: C.active };
  if (s.includes("INIT") || s === "CREATED") return { label: "初始化", bg: "#eef0f3", fg: "#52585f", dot: "#7a818a", accent: "#7a818a" };
  return { label: status, bg: "#f4f5f7", fg: C.sub, dot: "#aeb3ba", accent: "#cdd2d8" };
}

function StatusPill({ status }: { status: string }) {
  const st = statusStyle(status);
  const pulse = ACTIVE_STATUSES.has(status.toUpperCase());
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 9px", borderRadius: 6, fontSize: 11.5, fontWeight: 600, background: st.bg, color: st.fg, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.dot, animation: pulse ? "txPulseDot 1.6s infinite" : undefined }} />
      {st.label}
    </span>
  );
}

/* ── 4-phase pipeline bar (same as 翻译任务) ─────────────────────────────── */

const PHASE_DEFS = [
  { label: "初始化" },
  { label: "翻译" },
  { label: "写回" },
  { label: "验证" },
] as const;

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

function calcProgress(job: TranslationJob): number {
  if (typeof job.progressPercent === "number") return job.progressPercent;
  const m = job.metrics;
  const total = m.translateTotal || m.initTotal;
  if (!total) return job.status === "COMPLETED" ? 100 : 0;
  const done = m.translateDone + m.translateFailed;
  return Math.min(100, Math.round((done / total) * 100));
}

function PipelineBar({ job }: { job: TranslationJob }) {
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
    m.translateUnitTotal > 0 ? `${m.translateUnitDone}/${m.translateUnitTotal} 子节点` : `${m.translateDone}/${m.translateTotal}`,
    `${m.writebackDone}/${m.writebackTotal}`,
    `${m.verifyDone}/${m.verifyTotal}`,
  ];
  const completed = job.status === "COMPLETED";
  const failed = job.status === "FAILED";
  const failStage = failed ? failedStageIndex(job) : -1;
  const laterProgress = (i: number) => ratios.some((r, j) => j > i && (r ?? 0) > 0);

  const phases = PHASE_DEFS.map((def, i) => {
    const ratio = ratios[i] ?? 0;
    let fill = 0;
    let color = C.track;
    let labelColor = "#aeb3ba";
    if (completed) {
      fill = 1; color = C.done; labelColor = "#3a3f45";
    } else if (failed) {
      if (i < failStage) { fill = 1; color = C.done; labelColor = "#3a3f45"; }
      else if (i === failStage) { fill = ratio > 0 ? ratio : 1; color = C.failed; labelColor = C.failed; }
    } else if (ratio >= 1 || laterProgress(i)) {
      fill = 1; color = C.done; labelColor = "#3a3f45";
    } else if (ratio > 0) {
      fill = ratio; color = C.active; labelColor = C.active;
    }
    return { label: def.label, fill: clamp01(fill), color, labelColor, detail: details[i] };
  });

  const pct = calcProgress(job);
  const pctColor = failed ? C.failed : completed ? C.done : C.ink;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", gap: 5, flex: 1, minWidth: 120 }}>
        {phases.map((p) => (
          <Tooltip key={p.label} title={`${p.label} · ${p.detail}`}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ height: 6, borderRadius: 4, background: C.track, overflow: "hidden" }}>
                <div style={{ width: `${p.fill * 100}%`, height: "100%", borderRadius: 4, background: p.color, transition: "width .3s ease" }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 500, color: p.labelColor, whiteSpace: "nowrap" }}>{p.label}</span>
            </div>
          </Tooltip>
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: pctColor, width: 38, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtAgo(iso: string): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const diff = Math.round((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s 前`;
  if (diff < 3600) return `${Math.round(diff / 60)}min 前`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h 前`;
  return `${Math.round(diff / 86400)}d 前`;
}

function sumActive(byStatus: Record<string, number>): number {
  return Object.entries(byStatus)
    .filter(([s]) => ACTIVE_STATUSES.has(s))
    .reduce((acc, [, n]) => acc + n, 0);
}

function Kpi({ label, value, unit, accent, valColor }: { label: string; value: React.ReactNode; unit?: string; accent: string; valColor?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: accent }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: C.sub }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, color: valColor ?? C.ink, fontFamily: MONO }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.faint }}>{unit}</span>}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: C.faint, letterSpacing: 0.4, textTransform: "uppercase" };
const GRID = "minmax(220px,1fr) 96px minmax(280px,1.4fr) 96px 110px minmax(160px,1fr)";

type ViewFilter = "all" | "active" | "stuck" | "COMPLETED" | "FAILED" | "PAUSED";

export default function AutoTranslations() {
  useDesignFont();

  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [summary, setSummary] = useState<AutoTranslationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [view, setView] = useState<ViewFilter>("all");
  const [shopFilter, setShopFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [jobsRes, summaryRes] = await Promise.all([
        fetchTranslations({ source: AUTO_TASK_SOURCE, limit: 200 }),
        fetchAutoTranslationSummary(),
      ]);
      setJobs(jobsRes.jobs);
      setSummary(summaryRes);
      setNote(summaryRes.note ?? (jobsRes as { note?: string }).note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const byStatus = summary?.byStatus ?? {};

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

  const displayed = useMemo(() => {
    let list = jobs;
    if (view === "active") list = list.filter((j) => ACTIVE_STATUSES.has(j.status));
    else if (view === "stuck") list = list.filter((j) => stuckIds.has(j.id));
    else if (view !== "all") list = list.filter((j) => (view === "PAUSED" ? j.status === "PAUSED" || j.status === "CANCELLED" : j.status === view));
    const q = shopFilter.trim().toLowerCase();
    if (q) list = list.filter((j) => j.shopName.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const s = Number(stuckIds.has(b.id)) - Number(stuckIds.has(a.id));
      if (s !== 0) return s;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [jobs, view, shopFilter, stuckIds]);

  const filterDefs: { key: ViewFilter; label: string; count: number }[] = [
    { key: "all", label: "全部", count: counts.all },
    { key: "active", label: "进行中", count: counts.active },
    { key: "stuck", label: "卡住", count: counts.stuck },
    { key: "COMPLETED", label: "已完成", count: counts.COMPLETED },
    { key: "FAILED", label: "已失败", count: counts.FAILED },
    { key: "PAUSED", label: "暂停/取消", count: counts.PAUSED },
  ];

  return (
    <div style={{ background: C.bg, fontFamily: FONT, color: C.ink, margin: -24, padding: "28px 32px 48px", minHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>自动翻译监控</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#e7f3ec", border: "1px solid #bfe2cd", padding: "3px 10px 3px 8px", borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.done, animation: "txPulseDot 1.6s infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#16703f" }}>实时监控</span>
            </div>
          </div>
          <span style={{ fontSize: 13, color: C.sub }}>系统自动创建的翻译任务 · 数据每 10s 自动刷新</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 7, height: 36, padding: "0 14px", border: `1px solid ${autoRefresh ? C.done : C.border}`, background: C.card, borderRadius: 8, fontSize: 13, fontWeight: 500, color: "#374151", cursor: "pointer", fontFamily: FONT }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: autoRefresh ? C.done : "#c4c8cd" }} />
            {autoRefresh ? "自动刷新 10s" : "自动刷新已关"}
          </button>
          <button onClick={load} style={{ height: 36, padding: "0 16px", border: "none", background: C.ink, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>刷新</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <Kpi label="今日新建" value={summary?.createdToday ?? 0} unit="任务" accent={C.active} />
        <Kpi label="累计任务" value={summary?.total ?? 0} accent="#7a818a" />
        <Kpi label="进行中" value={sumActive(byStatus)} unit="任务" accent={C.active} />
        <Kpi label="卡住" value={counts.stuck} unit="需介入" accent={C.failed} valColor={counts.stuck > 0 ? C.failed : C.ink} />
        <Kpi label="成功" value={byStatus.COMPLETED ?? 0} accent={C.done} />
        <Kpi label="失败" value={byStatus.FAILED ?? 0} accent={C.warn} valColor={(byStatus.FAILED ?? 0) > 0 ? C.failed : C.ink} />
      </div>

      {/* Stuck banner */}
      {stuckJobs.length > 0 && (
        <div style={{ background: "#fff5f5", border: "1px solid #f3c2c2", borderLeft: `4px solid ${C.failed}`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: C.failed, color: "#fff", fontSize: 14, fontWeight: 700 }}>!</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#a11c1c" }}>{stuckJobs.length} 个任务卡住</span>
            <span style={{ fontSize: 12, color: "#b35858" }}>超过 1 小时未更新，可能需要人工介入</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {stuckJobs.map((j) => (
              <button
                key={j.id}
                onClick={() => { setShopFilter(j.shopName); setView("all"); }}
                style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #ecc9c9", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{j.shopName.split(".")[0]}</span>
                <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub, background: "#f3f4f6", padding: "2px 6px", borderRadius: 5 }}>{j.source} → {j.target}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.failed }}>停滞 {fmtAgo(j.updatedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {note && <Alert type="info" showIcon message={note} style={{ borderRadius: 10 }} />}
      {error && <Alert type="error" showIcon message={error} closable style={{ borderRadius: 10 }} />}

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
          {filterDefs.map((f) => {
            const active = view === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setView(f.key)}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 13px", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: FONT, background: active ? C.ink : "transparent", color: active ? "#fff" : f.key === "stuck" && f.count > 0 ? C.failed : "#52585f" }}
              >
                {f.label}
                <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, opacity: 0.75 }}>{f.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, minWidth: 240 }}>
          <span style={{ color: C.faint, fontSize: 14 }}>⌕</span>
          <input value={shopFilter} onChange={(e) => setShopFilter(e.target.value)} placeholder="按店铺搜索…" style={{ border: "none", outline: "none", fontSize: 13, fontFamily: FONT, background: "transparent", flex: 1, color: C.ink }} />
        </div>
      </div>

      {/* Task table */}
      <Spin spinning={loading}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, padding: "12px 20px", borderBottom: `1px solid ${C.borderSoft}`, background: "#fafbfc" }}>
            <span style={TH}>店铺 / 语言</span>
            <span style={TH}>状态</span>
            <span style={TH}>流水线进度</span>
            <span style={{ ...TH, textAlign: "right" }}>Token</span>
            <span style={TH}>更新</span>
            <span style={TH}>错误</span>
          </div>
          {displayed.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 13 }}>没有符合条件的任务</div>
          )}
          {displayed.map((j) => {
            const stuck = stuckIds.has(j.id);
            const st = statusStyle(j.status);
            return (
              <div key={j.id} className="tx-row" style={{ display: "grid", gridTemplateColumns: GRID, gap: 16, alignItems: "center", padding: "10px 20px", borderBottom: `1px solid ${C.borderSoft}`, borderLeft: `3px solid ${stuck ? C.failed : st.accent}`, transition: "background .12s" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{j.shopName}</span>
                  <span style={{ fontSize: 11, fontFamily: MONO, color: C.sub }}>{j.source} → {j.target}</span>
                </div>
                <div><StatusPill status={j.status} /></div>
                <PipelineBar job={j} />
                <span style={{ fontSize: 12.5, textAlign: "right", fontFamily: MONO, color: "#4b5158" }}>{fmtNum(j.metrics.usedTokens || 0)}</span>
                <span style={{ fontSize: 12, fontWeight: stuck ? 700 : 500, color: stuck ? C.failed : C.sub }}>
                  {stuck ? "⚠ " : ""}
                  {fmtAgo(j.updatedAt)}
                </span>
                {j.errorMessage ? (
                  <Tooltip title={`${j.errorStage ?? ""} ${j.errorMessage}`}>
                    <span style={{ fontSize: 12, color: C.failed, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{j.errorMessage}</span>
                  </Tooltip>
                ) : (
                  <span style={{ fontSize: 12, color: "#c4c8cd" }}>—</span>
                )}
              </div>
            );
          })}
        </div>
      </Spin>
    </div>
  );
}
