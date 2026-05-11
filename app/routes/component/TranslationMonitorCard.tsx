import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  JsonRuntimeTaskDetailEnvelope,
  JsonRuntimeTaskDetailPayload,
  JsonRuntimeTaskListEnvelope,
  JsonRuntimeTaskListRow,
} from "./JsonRuntimeTaskStatusPanel";
import { formatTranslateTaskV3CosmosStatusText } from "../../lib/translateTaskV3CosmosStatusLabel";

const POLL_SEC = 4;
/** 任务列表刷新间隔（秒），低于详情轮询频率，避免多余请求 */
const LIST_POLL_SEC = 25;

const MD_OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "1rem",
};

const MD_CARD: CSSProperties = {
  width: "100%",
  maxWidth: "720px",
  maxHeight: "90vh",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 12px 30px rgba(0, 0, 0, 0.2)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

function readNumber(raw: string | undefined) {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readMetricNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") return readNumber(raw);
  return null;
}

function readString(record: Record<string, unknown> | undefined, key: string) {
  const v = record?.[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function listBadgeTone(statusText?: string): "success" | "warning" | "critical" | "info" {
  const s = (statusText ?? "").toUpperCase();
  if (s.includes("DONE") || s.includes("COMPLETE") || s.includes("SAVE_DONE")) return "success";
  if (s.includes("FAIL") || s.includes("STOPPED") || s.includes("ERROR")) return "critical";
  if (s.includes("RUNNING") || s.includes("PENDING") || s.includes("FETCH") || s.includes("TRANSLATE"))
    return "warning";
  return "info";
}

function cosmosTone(statusText?: string): "success" | "warning" | "critical" | "info" {
  const s = (statusText ?? "").toUpperCase();
  if (s.includes("STOPPED") && !s.includes("TOKEN")) return "critical";
  if (s.includes("PENDING") || s.includes("RUNNING")) return "warning";
  if (s.includes("SAVE_PENDING") || s.includes("VERIFY")) return "info";
  return "success";
}

function ProgressBar(props: {
  label: string;
  sub?: ReactNode;
  percent: number;
  gradient: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(props.percent)));
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "13px", color: "#202223" }}>{props.label}</span>
          {props.sub ? (
            <span style={{ display: "block", color: "#6d7175", fontSize: "12px", marginTop: 2 }}>
              {props.sub}
            </span>
          ) : null}
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: "14px",
            color: "#202223",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          width: "100%",
          height: props.height ?? 10,
          background: "linear-gradient(180deg, #e7e9ec 0%, #dfe3e8 100%)",
          borderRadius: 999,
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(32,34,35,0.12)",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: props.gradient,
            borderRadius: 999,
            transition: "width 0.35s ease-out",
          }}
        />
      </div>
    </div>
  );
}

function useRuntimeProgress(payload: JsonRuntimeTaskDetailPayload | null) {
  return useMemo(() => {
    if (!payload?.redisRuntime) {
      return {
        entryPct: null as number | null,
        chunkPct: null as number | null,
        entrySub: null as ReactNode,
        chunkSub: null as ReactNode,
      };
    }
    const meta = payload.redisRuntime.meta;
    const rt = payload.redisRuntime;
    const cosmos = payload.cosmos;
    const cm = cosmos?.metrics as Record<string, unknown> | undefined;
    const ck = cosmos?.checkpoint as Record<string, unknown> | undefined;

    const translatedM = readMetricNumber(cm?.translatedCount);
    const failedM = readMetricNumber(cm?.failedCount);
    const inferred =
      translatedM !== null && failedM !== null && translatedM + failedM > 0
        ? translatedM + failedM
        : null;

    const entryTotal =
      readMetricNumber(meta?.totalCountThisBlob) ??
      readMetricNumber(cm?.totalCount) ??
      inferred;

    const doneSize =
      typeof rt.doneSize === "number" && Number.isFinite(rt.doneSize) ? rt.doneSize : null;
    const entryDone =
      readMetricNumber(meta?.currentDoneThisBlob) ?? translatedM ?? doneSize;

    const entryPct =
      entryTotal !== null && entryTotal > 0 && entryDone !== null
        ? Math.min(100, Math.round((Math.min(entryDone, entryTotal) / entryTotal) * 100))
        : null;

    const chunkTotal =
      readMetricNumber(meta?.runtimeChunksTotal) ??
      readMetricNumber(cm?.runtimeChunksTotal) ??
      readMetricNumber(ck?.runtimeChunksTotal);

    const chunkDoneRaw = rt.chunkDoneSize;
    const chunkDoneFromRedis =
      typeof chunkDoneRaw === "number" && Number.isFinite(chunkDoneRaw) ? chunkDoneRaw : null;
    const chunkDone =
      chunkDoneFromRedis ??
      readMetricNumber(meta?.runtimeChunkDoneSize) ??
      readMetricNumber(cm?.runtimeChunksDone);

    const chunkPct =
      chunkTotal !== null && chunkTotal > 0 && chunkDone !== null
        ? Math.min(100, Math.round((Math.min(chunkDone, chunkTotal) / chunkTotal) * 100))
        : null;

    const hasChunkBar = chunkPct !== null;

    /** 与 tasks/…/chunks/ 下分片文件数量一致，通常比「节点数」更直观 */
    const chunkSub =
      chunkTotal !== null ? (
        <>
          <span>
            已完成 <strong>{chunkDone ?? 0}</strong> / <strong>{chunkTotal}</strong> 个<strong>分块文件</strong>
          </span>
          <span
            style={{
              display: "block",
              fontSize: "11px",
              color: "#8c9196",
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            对应 Blob 中 <code style={{ fontSize: "10px" }}>chunks/</code>{" "}
            目录的分片，推荐用它衡量「还剩多少文件要跑」。
          </span>
        </>
      ) : null;

    const entrySubResolved =
      entryTotal !== null ? (
        <>
          <span>
            已完成 <strong>{entryDone ?? 0}</strong> / <strong>{entryTotal}</strong> 个
            <strong>文本节点</strong>
          </span>
          <span
            style={{
              display: "block",
              fontSize: "11px",
              color: "#8c9196",
              marginTop: 6,
              lineHeight: 1.45,
            }}
          >
            {hasChunkBar
              ? "节点由 JSON/HTML 解析得到（含嵌套字段）；整体进度也可对照上方的「分块文件」。"
              : "节点由 JSON/HTML 解析得到，数值通常大于商品或字段「条数」，属正常现象。"}
          </span>
        </>
      ) : null;

    return { entryPct, chunkPct, entrySub: entrySubResolved, chunkSub };
  }, [payload]);
}

/** 列表中的更新时间：只展示到秒（兼容带纳秒的 ISO 字符串） */
function formatTaskUpdatedAt(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const s = raw.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  return s;
}

type Props = { defaultShopName: string };

export function TranslationMonitorCard({ defaultShopName }: Props) {
  const shopName = defaultShopName.trim();

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [tasks, setTasks] = useState<JsonRuntimeTaskListRow[]>([]);

  const [selectedId, setSelectedId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detail, setDetail] = useState<JsonRuntimeTaskDetailPayload | null>(null);

  const [mdOpen, setMdOpen] = useState(false);
  const [mdLoading, setMdLoading] = useState(false);
  const [mdText, setMdText] = useState("");
  const [mdTruncated, setMdTruncated] = useState(false);

  const progress = useRuntimeProgress(detail);

  const fetchList = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!shopName) {
      setTasks([]);
      return;
    }
    if (!silent) {
      setListLoading(true);
      setListError("");
    }
    try {
      const params = new URLSearchParams();
      params.set("shopName", shopName);
      const res = await fetch(`/api/translate/v3/json-runtime-tasks?${params.toString()}`);
      const env = (await res.json().catch(() => ({}))) as JsonRuntimeTaskListEnvelope;
      if (!res.ok || env.success === false) {
        if (!silent) {
          setTasks([]);
          setListError(env.errorMsg || `加载失败（${res.status}）`);
        }
        return;
      }
      const list = env.response?.tasks;
      setTasks(Array.isArray(list) ? list : []);
      if (!silent) setListError("");
    } catch {
      if (!silent) {
        setTasks([]);
        setListError("加载失败，请稍后重试");
      }
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [shopName]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (!shopName) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchList({ silent: true });
      }
    }, LIST_POLL_SEC * 1000);
    return () => window.clearInterval(timer);
  }, [shopName, fetchList]);

  const fetchDetail = useCallback(
    async (taskId: string, silent?: boolean) => {
      const tid = taskId.trim();
      if (!tid) {
        setDetail(null);
        return;
      }
      if (!silent) {
        setDetailLoading(true);
        setDetailError("");
      }
      try {
        const params = new URLSearchParams();
        params.set("taskId", tid);
        if (shopName) params.set("shopName", shopName);
        params.set("maxPreviewBytes", "8192");
        const res = await fetch(`/api/translate/v3/json-runtime-task-detail?${params.toString()}`);
        const env = (await res.json().catch(() => ({}))) as JsonRuntimeTaskDetailEnvelope;
        if (!res.ok || env.success === false) {
          if (!silent) setDetail(null);
          setDetailError(env.errorMsg || `加载详情失败（${res.status}）`);
          return;
        }
        setDetail(env.response ?? null);
        setDetailError("");
      } catch {
        if (!silent) setDetail(null);
        setDetailError("网络异常，请稍后重试");
      } finally {
        if (!silent) setDetailLoading(false);
      }
    },
    [shopName],
  );

  useEffect(() => {
    if (!selectedId.trim()) return;
    void fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    if (!selectedId.trim()) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchDetail(selectedId, true);
      }
    }, POLL_SEC * 1000);
    return () => window.clearInterval(t);
  }, [selectedId, fetchDetail]);

  const openReportPreview = useCallback(async () => {
    const tid = selectedId.trim();
    if (!tid) return;
    setMdLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("taskId", tid);
      if (shopName) params.set("shopName", shopName);
      params.set("includeBlobPreview", "true");
      params.set("maxPreviewBytes", String(512 * 1024));
      const rp = detail?.resolvedRedisPrefix?.trim();
      if (rp) params.set("redisPrefix", rp);
      const res = await fetch(`/api/translate/v3/json-runtime-task-detail?${params.toString()}`);
      const env = (await res.json().catch(() => ({}))) as JsonRuntimeTaskDetailEnvelope;
      if (!res.ok || env.success === false) {
        setMdText(env.errorMsg || "加载失败");
        setMdTruncated(false);
        setMdOpen(true);
        return;
      }
      const snap = env.response?.blobs?.translationReportMd;
      const text = typeof snap?.preview === "string" ? snap.preview : "";
      setMdText(text.length > 0 ? text : "（暂无报告内容）");
      setMdTruncated(snap?.previewTruncated === true);
      setMdOpen(true);
    } catch {
      setMdText("加载失败，请稍后重试");
      setMdTruncated(false);
      setMdOpen(true);
    } finally {
      setMdLoading(false);
    }
  }, [selectedId, shopName, detail?.resolvedRedisPrefix]);

  const tm = detail?.translateMonitor;
  const cosmos = detail?.cosmos as Record<string, unknown> | undefined;
  const trBlob = detail?.blobs?.translationReportMd;

  /** 初始化阶段：阶段徽章 + 模块进度文案 + 醒目展示「已拉取条数」 */
  const initDisplay = useMemo(() => {
    if (!tm || Object.keys(tm).length === 0) return null;
    const phase = tm.phase?.trim() || "—";
    const md = readMetricNumber(tm.initModuleDone);
    const mt = readMetricNumber(tm.initModuleTotal);
    const acc = readMetricNumber(tm.initAccumulatedCount);
    const modulePart = md !== null && mt !== null ? `模块 ${md}/${mt}` : null;
    return { phase, modulePart, accumulatedCount: acc };
  }, [tm]);

  return (
    <>
      <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
        <s-stack direction="block" gap="small">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: "15px", color: "#202223" }}>翻译任务列表</span>
            <s-button
              type="button"
              variant="secondary"
              onClick={() => void fetchList()}
              {...(listLoading ? { disabled: true } : {})}
            >
              {listLoading ? "刷新中…" : "刷新"}
            </s-button>
          </div>

          {listError ? (
            <span style={{ color: "#bf0711", fontSize: "13px" }}>{listError}</span>
          ) : null}

          {!listLoading && !listError && tasks.length === 0 ? (
            <span style={{ color: "#6d7175", fontSize: "13px" }}>暂无任务</span>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map((row) => {
              const id = row.id?.trim() ?? "";
              const active = id !== "" && selectedId === id;
              return (
                <button
                  key={id || row.updatedAt}
                  type="button"
                  onClick={() => setSelectedId(id)}
                  disabled={!id}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: active ? "2px solid #2c6ecb" : "1px solid #e3e5e8",
                    background: active ? "#f4f6f8" : "#fff",
                    cursor: id ? "pointer" : "not-allowed",
                    opacity: id ? 1 : 0.6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: 700,
                        color: "#202223",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {(row.source ?? "—").trim()} → {(row.target ?? "—").trim()}
                    </span>
                    <s-badge tone={listBadgeTone(row.statusText)}>
                      {formatTranslateTaskV3CosmosStatusText(row.statusText)}
                    </s-badge>
                  </div>
                  {row.updatedAt ? (
                    <div style={{ fontSize: "12px", color: "#8c9196", marginTop: 8 }}>
                      更新 {formatTaskUpdatedAt(row.updatedAt)}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selectedId.trim() ? (
            <div
              style={{
                marginTop: 12,
                paddingTop: 14,
                borderTop: "1px solid #e3e5e8",
              }}
            >
              {detailLoading && !detail ? (
                <span style={{ color: "#6d7175", fontSize: "13px" }}>加载详情…</span>
              ) : null}
              {detailError ? (
                <span style={{ color: "#bf0711", fontSize: "13px" }}>{detailError}</span>
              ) : null}

              {detail ? (
                <s-stack direction="block" gap="small">
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#202223" }}>任务详情</div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <s-badge tone={cosmosTone(readString(cosmos, "statusText"))}>
                      {formatTranslateTaskV3CosmosStatusText(readString(cosmos, "statusText"))}
                    </s-badge>
                    <span style={{ fontSize: "13px", color: "#42474c" }}>
                      <strong>{readString(cosmos, "source") || "—"}</strong>
                      {" → "}
                      <strong>{readString(cosmos, "target") || "—"}</strong>
                    </span>
                  </div>

                  {initDisplay ? (
                    <div>
                      <div style={{ fontSize: "12px", color: "#8c9196", marginBottom: 6 }}>初始化</div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <s-badge tone="info">{initDisplay.phase}</s-badge>
                        {initDisplay.modulePart ? (
                          <span style={{ fontSize: "13px", color: "#42474c" }}>{initDisplay.modulePart}</span>
                        ) : null}
                        {initDisplay.accumulatedCount !== null ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "baseline",
                              gap: 6,
                              padding: "8px 14px",
                              borderRadius: 10,
                              background: "linear-gradient(145deg, #e8f6f1 0%, #dff3ea 100%)",
                              border: "1px solid #84c8a8",
                              boxShadow: "0 1px 2px rgba(0, 82, 54, 0.08)",
                            }}
                          >
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#244235" }}>已拉取</span>
                            <span
                              style={{
                                fontSize: "22px",
                                fontWeight: 800,
                                color: "#008060",
                                fontVariantNumeric: "tabular-nums",
                                lineHeight: 1,
                                letterSpacing: "-0.02em",
                              }}
                            >
                              {initDisplay.accumulatedCount}
                            </span>
                            <span style={{ fontSize: "14px", fontWeight: 700, color: "#244235" }}>条</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {progress.chunkPct !== null ? (
                    <ProgressBar
                      label="翻译分块（chunks 文件）"
                      sub={progress.chunkSub}
                      percent={progress.chunkPct}
                      gradient="linear-gradient(90deg, #007146 0%, #008060 65%)"
                      height={12}
                    />
                  ) : null}

                  {progress.entryPct !== null ? (
                    <ProgressBar
                      label="文本节点（解析明细）"
                      sub={progress.entrySub}
                      percent={progress.entryPct}
                      gradient="linear-gradient(90deg, #006fbb 0%, #2c6ecb 70%)"
                      height={10}
                    />
                  ) : (
                    <span style={{ fontSize: "12px", color: "#8c9196" }}>
                      {progress.chunkPct !== null
                        ? "暂无文本节点级进度数据"
                        : "翻译进度：暂无可用数据"}
                    </span>
                  )}

                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#202223" }}>
                        整包翻译报告
                      </span>
                      <s-badge tone={trBlob?.exists === true ? "success" : "info"}>
                        {trBlob?.exists === true
                          ? "已生成"
                          : trBlob?.exists === false
                            ? "未生成"
                            : "未知"}
                      </s-badge>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <s-button
                        type="button"
                        variant="primary"
                        onClick={() => void openReportPreview()}
                        {...(mdLoading ? { disabled: true } : {})}
                      >
                        {mdLoading ? "打开中…" : "弹窗预览"}
                      </s-button>
                    </div>
                  </div>
                </s-stack>
              ) : null}
            </div>
          ) : (
            <span style={{ color: "#8c9196", fontSize: "12px" }}>请从上方列表选择任务</span>
          )}
        </s-stack>
      </s-box>

      {mdOpen ? (
        <div
          role="presentation"
          style={MD_OVERLAY}
          onClick={() => setMdOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMdOpen(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="翻译报告" style={MD_CARD} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid #e3e5e8",
                flexShrink: 0,
              }}
            >
              <strong style={{ fontSize: "15px", color: "#202223" }}>整包翻译报告</strong>
              <s-button type="button" variant="secondary" onClick={() => setMdOpen(false)}>
                关闭
              </s-button>
            </div>
            {mdTruncated ? (
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  color: "#6d7175",
                  background: "#fff5ea",
                  borderBottom: "1px solid #ffd79c",
                }}
              >
                预览已截断；完整内容请在存储中下载。
              </div>
            ) : null}
            <div
              style={{
                padding: "16px 20px 20px",
                overflow: "auto",
                flex: 1,
                minHeight: 0,
                fontSize: "14px",
                lineHeight: 1.55,
                color: "#202223",
              }}
              className="translation-monitor-md"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 style={{ fontSize: "1.35rem", margin: "0.75em 0 0.4em" }}>{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 style={{ fontSize: "1.2rem", margin: "0.65em 0 0.35em" }}>{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 style={{ fontSize: "1.05rem", margin: "0.55em 0 0.3em" }}>{children}</h3>
                  ),
                  p: ({ children }) => <p style={{ margin: "0.45em 0" }}>{children}</p>,
                  ul: ({ children }) => (
                    <ul style={{ margin: "0.4em 0", paddingLeft: "1.25rem" }}>{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol style={{ margin: "0.4em 0", paddingLeft: "1.25rem" }}>{children}</ol>
                  ),
                  code: ({ className, children, ...props }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return (
                        <pre
                          style={{
                            background: "#f6f6f7",
                            padding: "10px 12px",
                            borderRadius: 8,
                            overflow: "auto",
                            fontSize: "12px",
                          }}
                        >
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      );
                    }
                    return (
                      <code
                        style={{
                          background: "#f1f2f4",
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontSize: "0.9em",
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {mdText}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
