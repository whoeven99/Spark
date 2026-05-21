import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  formatRedisTranslatePhaseLabel,
  readRuntimeChunksFileTotal,
} from "../../../lib/redisTranslatePhaseLabel";
import { formatTranslateTaskV3CosmosStatusText } from "../../../lib/translateTaskV3CosmosStatusLabel";
import { PagePanel, pageColorTokens } from "../../page/pageUiStyles";

export type JsonRuntimeTaskDetailEnvelope = {
  success: boolean;
  errorCode?: number;
  errorMsg?: string;
  response?: JsonRuntimeTaskDetailPayload | null;
};

export type BlobSnapshot = {
  uri?: string;
  blobPath?: string;
  exists?: boolean;
  note?: string;
  sizeBytes?: number;
  preview?: string;
  previewTruncated?: boolean;
};

export type JsonRuntimeTaskListRow = {
  id?: string;
  shopName?: string;
  source?: string;
  target?: string;
  status?: number;
  statusText?: string;
  taskType?: string;
  aiModel?: string;
  createdAt?: string;
  updatedAt?: string;
  sessionId?: string;
  moduleList?: string;
};

export type JsonRuntimeTaskListPayload = {
  shopName?: string;
  total?: number;
  tasks?: JsonRuntimeTaskListRow[];
};

export type JsonRuntimeTaskListEnvelope = {
  success: boolean;
  errorCode?: number;
  errorMsg?: string;
  response?: JsonRuntimeTaskListPayload | null;
};

export type JsonRuntimeTaskDetailPayload = {
  cosmos?: Record<string, unknown>;
  resolvedRedisPrefix?: string;
  /** 由后端从当前 report Blob 解析，弥补 Redis failMap 跨 chunk 覆盖问题 */
  runtimeReportFailures?: Array<{ path?: string; reason?: string }>;
  runtimeReportFailuresTruncated?: boolean;
  /** tasks/{shop}/{taskId}/chunks/failed.json，含每条 sourceValue（与 Java mergeWriteChunksFailedJson 一致） */
  runtimeFailedJson?: Record<string, unknown>;
  runtimeFailedJsonTruncated?: boolean;
  redisRuntime?: {
    taskId?: string;
    redisPrefix?: string;
    meta?: Record<string, string>;
    doneSize?: number;
    chunkDoneSize?: number;
    resultSize?: number;
    failMap?: Record<string, string>;
  };
  blobs?: {
    input?: BlobSnapshot;
    output?: BlobSnapshot;
    report?: BlobSnapshot;
    /** tasks/{shop}/{taskId}/chunks/translation-report.md（LLM 整包报告） */
    translationReportMd?: BlobSnapshot;
    /** tasks/{shop}/{taskId}/chunks/translation-quality-report.md（LLM 对照原文/译文抽检质量报告） */
    qualityReportMd?: BlobSnapshot;
  };
  reportParsed?: Record<string, unknown>;
  /** V3 任务监控 Hash（translate_monitor_v3:{taskId}）：初始化拉取阶段的 phase、totalCount、initAccumulatedCount 等 */
  translateMonitor?: Record<string, string>;
};

type Props = {
  /** 默认填入店铺域名（当前登录店铺） */
  defaultShopName: string;
};

function readString(record: Record<string, unknown> | undefined, key: string) {
  const v = record?.[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function readNumber(raw: string | undefined) {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Cosmos metrics / checkpoint 可能是 number 或字符串 */
function readMetricNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") return readNumber(raw);
  return null;
}

/** translate_monitor_v3 Hash 的 updatedAt 多为毫秒时间戳字符串 */
function formatMonitorUpdatedAt(raw: string | undefined): string {
  if (raw === undefined || raw === "") return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  try {
    return new Date(n).toLocaleString();
  } catch {
    return raw;
  }
}

function formatBytes(n: number | undefined) {
  if (n === undefined || !Number.isFinite(n)) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function sortedEntries(map: Record<string, string> | undefined) {
  if (!map) return [];
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

/** Redis 键形如 chunk-0.json::/2/sourceValue，取 JSON Pointer 段用于匹配 failed.json */
function pointerFromFailStoragePath(fullPath: string): string {
  const sep = fullPath.indexOf("::");
  return sep > 0 ? fullPath.slice(sep + 2) : fullPath;
}

/** 从 runtimeFailedJson.items 匹配 sourceValue（与后端 failed.json 结构一致） */
function lookupSourceValueFromRuntimeFailedJson(
  runtimeFailedJson: unknown,
  fullPath: string,
  reason: string,
): string | undefined {
  const doc = runtimeFailedJson as { items?: unknown[] } | undefined;
  if (!doc?.items || !Array.isArray(doc.items)) return undefined;
  const pointer = pointerFromFailStoragePath(fullPath);
  for (const raw of doc.items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const sk = typeof row.storageKey === "string" ? row.storageKey : "";
    const p = typeof row.path === "string" ? row.path : "";
    const r = typeof row.reason === "string" ? row.reason : "";
    const sv = row.sourceValue;
    if (typeof sv !== "string" || sv.length === 0) continue;
    const reasonOk = r === reason || reason === "(no reason)";
    const pathOk =
      sk === fullPath ||
      p === pointer ||
      (pointer.length > 0 && fullPath.endsWith(p)) ||
      pointerFromFailStoragePath(sk) === pointer;
    if (reasonOk && pathOk) return sv;
  }
  return undefined;
}

/** 列表行 statusText（Spark Cosmos）粗略映射到徽章色调 */
function listRowBadgeTone(statusText?: string): "success" | "warning" | "critical" | "info" {
  const s = (statusText ?? "").toUpperCase();
  if (s.includes("DONE") || s.includes("COMPLETE") || s.includes("SAVE_DONE")) return "success";
  if (s.includes("FAIL") || s.includes("STOPPED") || s.includes("ERROR")) return "critical";
  if (s.includes("RUNNING") || s.includes("PENDING") || s.includes("FETCH") || s.includes("TRANSLATE"))
    return "warning";
  return "info";
}

function cosmosBadgeTone(statusText?: string): "success" | "warning" | "critical" | "info" {
  const s = (statusText ?? "").toUpperCase();
  if (s.includes("STOPPED") && !s.includes("TOKEN")) return "critical";
  if (s.includes("PENDING") || s.includes("RUNNING")) return "warning";
  if (s.includes("SAVE_PENDING") || s.includes("VERIFY")) return "info";
  return "success";
}

function ProgressBarRow(props: {
  title: string;
  detail?: ReactNode;
  percent: number;
  barGradient: string;
  trackHeight?: number;
}) {
  const { title, detail, percent, barGradient, trackHeight = 12 } = props;
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div style={{ marginTop: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "13px", color: pageColorTokens.textPrimary }}>{title}</span>
          {detail ? (
            <span style={{ display: "block", color: pageColorTokens.textSecondary, fontSize: "12px", marginTop: 2 }}>
              {detail}
            </span>
          ) : null}
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: "15px",
            color: pageColorTokens.textPrimary,
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
          height: trackHeight,
          background: pageColorTokens.progressTrackGradient,
          borderRadius: 999,
          overflow: "hidden",
          boxShadow: "inset 0 1px 2px rgba(32,34,35,0.12)",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: barGradient,
            borderRadius: 999,
            transition: "width 0.4s cubic-bezier(0.33, 1, 0.68, 1)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        />
      </div>
    </div>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: pageColorTokens.surface,
        border: `1px solid ${pageColorTokens.border}`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: "11px", color: pageColorTokens.textSecondary, marginBottom: 4, letterSpacing: "0.02em" }}>
        {props.label}
      </div>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: pageColorTokens.textPrimary,
          wordBreak: "break-all",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

const MD_PREVIEW_MODAL_OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "1rem",
};

const MD_PREVIEW_MODAL_CARD_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: "720px",
  maxHeight: "90vh",
  backgroundColor: pageColorTokens.surface,
  borderRadius: "12px",
  boxShadow: pageColorTokens.shadowModal,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

/** 与下方自动刷新定时器一致（秒） */
const DETAIL_POLL_INTERVAL_SEC = 4;
/** 任务列表静默刷新间隔（秒），低于详情频率 */
const LIST_POLL_INTERVAL_SEC = 25;

export function JsonRuntimeTaskStatusPanel({ defaultShopName }: Props) {
  const { t, i18n } = useTranslation();
  const [taskId, setTaskId] = useState("");
  const [includeBlobPreview, setIncludeBlobPreview] = useState(false);
  const [maxPreviewBytes, setMaxPreviewBytes] = useState(8192);
  /** 默认开启：选中任务后周期性静默拉取详情 */
  const [pollEnabled, setPollEnabled] = useState(true);
  /** 距离下次自动刷新剩余秒数；未开启轮询或未选任务时为 null */
  const [pollCountdownSec, setPollCountdownSec] = useState<number | null>(null);

  const [listLoading, setListLoading] = useState(false);
  const [listErrorText, setListErrorText] = useState("");
  const [taskList, setTaskList] = useState<JsonRuntimeTaskListRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [payload, setPayload] = useState<JsonRuntimeTaskDetailPayload | null>(null);

  const [mdPreviewOpen, setMdPreviewOpen] = useState(false);
  const [mdPreviewLoading, setMdPreviewLoading] = useState(false);
  const [mdPreviewText, setMdPreviewText] = useState("");
  const [mdPreviewTruncated, setMdPreviewTruncated] = useState(false);
  const [mdPreviewTitle, setMdPreviewTitle] = useState("");

  const shopName = defaultShopName.trim();

  const fetchTaskList = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!shopName) {
      setTaskList([]);
      setListErrorText("");
      return;
    }
    if (!silent) {
      setListLoading(true);
      setListErrorText("");
    }
    try {
      const params = new URLSearchParams();
      params.set("shopName", shopName);
      params.set("taskType", "spark-transtion");
      const response = await fetch(`/api/translate/v4/tasks?${params.toString()}`);
      const envelope = (await response.json().catch(() => ({}))) as JsonRuntimeTaskListEnvelope;
      if (!response.ok || envelope.success === false) {
        if (!silent) {
          setTaskList([]);
          setListErrorText(
            envelope.errorMsg ||
              t("translationRuntime.listLoadFailed", { status: response.status }),
          );
        }
        return;
      }
      const tasks = envelope.response?.tasks;
      setTaskList(Array.isArray(tasks) ? tasks : []);
      if (!silent) setListErrorText("");
    } catch {
      if (!silent) {
        setTaskList([]);
        setListErrorText(t("translationRuntime.listLoadFailedRetry"));
      }
    } finally {
      if (!silent) setListLoading(false);
    }
  }, [shopName]);

  useEffect(() => {
    void fetchTaskList();
  }, [fetchTaskList]);

  useEffect(() => {
    if (!shopName) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchTaskList({ silent: true });
      }
    }, LIST_POLL_INTERVAL_SEC * 1000);
    return () => window.clearInterval(timer);
  }, [shopName, fetchTaskList]);

  const fetchDetail = useCallback(
    async (options?: { silent?: boolean; overrideTaskId?: string }) => {
      const tid = (options?.overrideTaskId ?? taskId).trim();
      if (!tid) {
        setErrorText("");
        setPayload(null);
        return;
      }

      const silent = options?.silent === true;
      if (!silent) {
        setLoading(true);
        setErrorText("");
      }

      try {
        const params = new URLSearchParams();
        params.set("taskId", tid);
        if (shopName) params.set("shopName", shopName);
        if (includeBlobPreview) params.set("includeBlobPreview", "true");
        params.set("maxPreviewBytes", String(maxPreviewBytes));

        const response = await fetch(
          `/api/translate/v3/json-runtime-task-detail?${params.toString()}`,
        );
        const envelope = (await response.json().catch(() => ({}))) as JsonRuntimeTaskDetailEnvelope;

        if (!response.ok || envelope.success === false) {
          if (!silent) setPayload(null);
          setErrorText(
            envelope.errorMsg || t("translationRuntime.requestFailed", { status: response.status }),
          );
          return;
        }

        setPayload(envelope.response ?? null);
        setErrorText("");
      } catch {
        if (!silent) setPayload(null);
        setErrorText(t("translationRuntime.serviceErrorRetry"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [taskId, shopName, includeBlobPreview, maxPreviewBytes],
  );

  const fetchTranslationReportMdPreview = useCallback(async () => {
    const tid = taskId.trim();
    if (!tid) return;
    setMdPreviewLoading(true);
    try {
      setMdPreviewTitle(t("translationRuntime.reportTitle"));
      const params = new URLSearchParams();
      params.set("taskId", tid);
      if (shopName) params.set("shopName", shopName);
      params.set("includeBlobPreview", "true");
      params.set("maxPreviewBytes", String(512 * 1024));
      const rp = payload?.resolvedRedisPrefix?.trim();
      if (rp) params.set("redisPrefix", rp);
      const response = await fetch(
        `/api/translate/v3/json-runtime-task-detail?${params.toString()}`,
      );
      const envelope = (await response.json().catch(() => ({}))) as JsonRuntimeTaskDetailEnvelope;
      if (!response.ok || envelope.success === false) {
        setMdPreviewText(
          envelope.errorMsg || t("translationRuntime.loadFailedStatus", { status: response.status }),
        );
        setMdPreviewTruncated(false);
        setMdPreviewOpen(true);
        return;
      }
      const snap = envelope.response?.blobs?.translationReportMd;
      const text = typeof snap?.preview === "string" ? snap.preview : "";
      setMdPreviewText(text.length > 0 ? text : t("translationRuntime.fileEmptyOrNoBlobContent"));
      setMdPreviewTruncated(snap?.previewTruncated === true);
      setMdPreviewOpen(true);
    } catch {
      setMdPreviewText(t("translationRuntime.loadFailedRetry"));
      setMdPreviewTruncated(false);
      setMdPreviewOpen(true);
    } finally {
      setMdPreviewLoading(false);
    }
  }, [taskId, shopName, payload?.resolvedRedisPrefix]);

  const fetchQualityReportMdPreview = useCallback(async () => {
    const tid = taskId.trim();
    if (!tid) return;
    setMdPreviewLoading(true);
    try {
      setMdPreviewTitle(t("translationRuntime.qualityReportTitle"));
      const params = new URLSearchParams();
      params.set("taskId", tid);
      if (shopName) params.set("shopName", shopName);
      params.set("includeBlobPreview", "true");
      params.set("maxPreviewBytes", String(512 * 1024));
      const rp = payload?.resolvedRedisPrefix?.trim();
      if (rp) params.set("redisPrefix", rp);
      const response = await fetch(
        `/api/translate/v3/json-runtime-task-detail?${params.toString()}`,
      );
      const envelope = (await response.json().catch(() => ({}))) as JsonRuntimeTaskDetailEnvelope;
      if (!response.ok || envelope.success === false) {
        setMdPreviewText(
          envelope.errorMsg || t("translationRuntime.loadFailedStatus", { status: response.status }),
        );
        setMdPreviewTruncated(false);
        setMdPreviewOpen(true);
        return;
      }
      const snap = envelope.response?.blobs?.qualityReportMd;
      const text = typeof snap?.preview === "string" ? snap.preview : "";
      setMdPreviewText(text.length > 0 ? text : t("translationRuntime.fileEmptyOrNoBlobContent"));
      setMdPreviewTruncated(snap?.previewTruncated === true);
      setMdPreviewOpen(true);
    } catch {
      setMdPreviewText(t("translationRuntime.loadFailedRetry"));
      setMdPreviewTruncated(false);
      setMdPreviewOpen(true);
    } finally {
      setMdPreviewLoading(false);
    }
  }, [taskId, shopName, payload?.resolvedRedisPrefix]);

  useEffect(() => {
    if (!pollEnabled || !taskId.trim()) {
      setPollCountdownSec(null);
      return;
    }

    setPollCountdownSec(DETAIL_POLL_INTERVAL_SEC);
    const timer = window.setInterval(() => {
      setPollCountdownSec((prev) => {
        if (document.visibilityState !== "visible") {
          return prev;
        }
        const cur = prev ?? DETAIL_POLL_INTERVAL_SEC;
        if (cur <= 1) {
          void fetchDetail({ silent: true });
          return DETAIL_POLL_INTERVAL_SEC;
        }
        return cur - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [pollEnabled, taskId, fetchDetail]);

  const handleSelectTask = (id: string) => {
    const clean = id.trim();
    if (!clean) return;
    setTaskId(clean);
    void fetchDetail({ overrideTaskId: clean });
  };

  const progressView = useMemo(() => {
    if (!payload?.redisRuntime) {
      return {
        meta: undefined as Record<string, string> | undefined,
        entryTotal: null as number | null,
        entryDone: null as number | null,
        entryPercent: null as number | null,
        entryDetail: "" as ReactNode,
        chunkTotal: null as number | null,
        chunkDone: null as number | null,
        chunkPercent: null as number | null,
        chunkDetail: "" as ReactNode,
        doneSize: null as number | null,
        failMapKeyCount: 0,
        hasAnyBar: false,
        noBarHint: "" as ReactNode,
      };
    }

    const meta = payload.redisRuntime.meta;
    const rt = payload.redisRuntime;
    const cosmos = payload.cosmos;
    const cm = cosmos?.metrics as Record<string, unknown> | undefined;
    const ck = cosmos?.checkpoint as Record<string, unknown> | undefined;

    const doneSize =
      typeof rt.doneSize === "number" && Number.isFinite(rt.doneSize) ? rt.doneSize : null;
    const failMap = rt.failMap;
    const failMapKeyCount = failMap ? Object.keys(failMap).length : 0;

    const translatedM = readMetricNumber(cm?.translatedCount);
    const failedM = readMetricNumber(cm?.failedCount);
    /** Java 完成后 metrics 常有 totalCount；若 Redis meta 缺总数，可用 成功+失败 推断（与 partial failed 场景一致） */
    const inferredEntryTotal =
      translatedM !== null && failedM !== null && translatedM + failedM > 0
        ? translatedM + failedM
        : null;

    const entryTotal =
      readMetricNumber(meta?.totalCountThisBlob) ??
      readMetricNumber(cm?.totalCount) ??
      inferredEntryTotal;

    const entryDone =
      readMetricNumber(meta?.currentDoneThisBlob) ??
      translatedM ??
      doneSize;

    const entryPercent =
      entryTotal !== null && entryTotal > 0 && entryDone !== null
        ? Math.min(
            100,
            Math.round((Math.min(entryDone, entryTotal) / entryTotal) * 100),
          )
        : null;

    const failForDetail =
      readMetricNumber(meta?.failCountThisBlob) ??
      readMetricNumber(meta?.currentFailThisBlob) ??
      readMetricNumber(cm?.failedCount);

    const entryDetail: ReactNode =
      entryTotal !== null ? (
        <>
          {t("translationRuntime.completedTextNodes", {
            done: entryDone ?? 0,
            total: entryTotal,
          })}
          {failForDetail !== null && failForDetail > 0
            ? ` · ${t("translationRuntime.failCountShort", { count: failForDetail })}`
            : ""}
        </>
      ) : (
        ""
      );

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

    const chunkPercent =
      chunkTotal !== null && chunkTotal > 0 && chunkDone !== null
        ? Math.min(100, Math.round((Math.min(chunkDone, chunkTotal) / chunkTotal) * 100))
        : null;

    const chunkDetail: ReactNode =
      chunkTotal !== null ? (
        <>{t("translationRuntime.completedChunkFiles", { done: chunkDone ?? 0, total: chunkTotal })}</>
      ) : (
        ""
      );

    const hasAnyBar = entryPercent !== null || chunkPercent !== null;

    let noBarHint: ReactNode = "";
    if (!hasAnyBar) {
      noBarHint = (
        <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px", lineHeight: 1.5 }}>
          {t("translationRuntime.noPercentReason")}
          {doneSize !== null ? (
            <>
              {" "}
              {t("translationRuntime.redisDoneContains", { count: doneSize })}
            </>
          ) : null}
          {failMapKeyCount > 0 ? (
            <>
              {" "}
              {t("translationRuntime.redisFailContains", { count: failMapKeyCount })}
            </>
          ) : null}
        </span>
      );
    }

    return {
      meta,
      entryTotal,
      entryDone,
      entryPercent,
      entryDetail,
      chunkTotal,
      chunkDone,
      chunkPercent,
      chunkDetail,
      doneSize,
      failMapKeyCount,
      hasAnyBar,
      noBarHint,
    };
  }, [payload, t]);

  const meta = progressView.meta ?? payload?.redisRuntime?.meta;
  const metaEntries = useMemo(() => sortedEntries(meta), [meta]);

  const progressPercent = progressView.entryPercent;
  const chunkPercent = progressView.chunkPercent;

  const failEntries = useMemo(
    () => sortedEntries(payload?.redisRuntime?.failMap),
    [payload?.redisRuntime?.failMap],
  );

  /** Redis failMap + report Blob 解析出的 failures；原文优先匹配 runtimeFailedJson.items[].sourceValue */
  const mergedFailRows = useMemo(() => {
    const rows: {
      source: string;
      path: string;
      reason: string;
      sourceText?: string;
    }[] = [];
    const seen = new Set<string>();
    const fd = payload?.runtimeFailedJson;
    for (const [path, reason] of failEntries) {
      const key = `r:${path}\t${reason}`;
      seen.add(key);
      const sourceText = lookupSourceValueFromRuntimeFailedJson(fd, path, reason);
      rows.push({ source: t("translationRuntime.sourceRedisFailMap"), path, reason, sourceText });
    }
    const rep = payload?.runtimeReportFailures;
    if (Array.isArray(rep)) {
      for (const item of rep) {
        const path =
          typeof item?.path === "string" ? item.path : "(no path)";
        const reason =
          typeof item?.reason === "string" ? item.reason : "(no reason)";
        const key = `p:${path}\t${reason}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sourceText = lookupSourceValueFromRuntimeFailedJson(fd, path, reason);
        rows.push({ source: t("translationRuntime.sourceReportFailures"), path, reason, sourceText });
      }
    }
    return rows;
  }, [failEntries, payload?.runtimeReportFailures, payload?.runtimeFailedJson, t]);

  const effectiveFailCount = useMemo(() => {
    const m =
      readNumber(meta?.failCountThisBlob) ?? readNumber(meta?.currentFailThisBlob);
    const n = mergedFailRows.length;
    if (m !== null && m > 0) {
      return Math.max(m, n);
    }
    if (n > 0) {
      return n;
    }
    return m;
  }, [meta?.failCountThisBlob, meta?.currentFailThisBlob, mergedFailRows.length]);

  const runtimeChunksFileTotal = useMemo(
    () => readRuntimeChunksFileTotal(payload ?? null),
    [payload],
  );

  const cosmos = payload?.cosmos;

  const emptyInput = !taskId.trim();

  const trBlob = payload?.blobs?.translationReportMd;
  const qrBlob = payload?.blobs?.qualityReportMd;
  const blobLabels = useMemo(
    () => ({
      input: t("translationRuntime.blobInput"),
      output: t("translationRuntime.blobOutput"),
      report: t("translationRuntime.blobReport"),
    }),
    [t],
  );

  return (
    <>
    <s-stack direction="block" gap="base">
      <PagePanel>
        <s-stack direction="block" gap="small">
          <s-paragraph>
            <span style={{ color: pageColorTokens.textMuted, lineHeight: 1.5 }}>
              {t("translationRuntime.panelIntro", {
                listSec: LIST_POLL_INTERVAL_SEC,
                detailSec: DETAIL_POLL_INTERVAL_SEC,
              })}
            </span>
          </s-paragraph>
        </s-stack>
      </PagePanel>

      <s-section heading={t("translationRuntime.currentShopTasksHeading")}>
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-button
            type="button"
            variant="secondary"
            onClick={() => void fetchTaskList()}
            {...(listLoading ? { disabled: true } : {})}
          >
            {listLoading ? t("translationRuntime.refreshListLoading") : t("translationRuntime.refreshList")}
          </s-button>
          {!listLoading && taskList.length > 0 ? (
            <span style={{ fontSize: "13px", color: pageColorTokens.textSecondary }}>
              {t("translationRuntime.totalTasks", { count: taskList.length })}
            </span>
          ) : null}
        </s-stack>
        {listErrorText ? (
          <PagePanel>
            <s-paragraph>
              <span style={{ color: pageColorTokens.critical }}>{t("translationRuntime.listErrorPrefix")}：{listErrorText}</span>
            </s-paragraph>
          </PagePanel>
        ) : null}
        {!listLoading && !listErrorText && taskList.length === 0 ? (
          <PagePanel padding="large">
            <s-paragraph>
              <span style={{ color: pageColorTokens.textSecondary }}>
                {t("translationRuntime.noTaskRecords")}
              </span>
            </s-paragraph>
          </PagePanel>
        ) : null}
        {taskList.length > 0 ? (
          <s-stack direction="block" gap="small">
            {taskList.map((row) => {
              const rid = row.id?.trim() ?? "";
              const active = rid !== "" && taskId.trim() === rid;
              return (
                <PagePanel key={rid || `${row.updatedAt}-${row.sessionId}`} highlighted={active}>
                  <s-stack direction="block" gap="small">
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-badge tone={listRowBadgeTone(row.statusText)}>
                        {formatTranslateTaskV3CosmosStatusText(row.statusText, t, i18n)}
                      </s-badge>
                      <span
                        style={{
                          fontFamily:
                            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                          fontSize: "13px",
                          color: pageColorTokens.textPrimary,
                          wordBreak: "break-all",
                          flex: 1,
                          minWidth: 0,
                        }}
                        title={rid || undefined}
                      >
                        {rid || t("translationRuntime.noId")}
                      </span>
                      <s-button
                        type="button"
                        variant={active ? "primary" : "secondary"}
                        onClick={() => handleSelectTask(rid)}
                        disabled={!rid}
                      >
                        {active ? t("translationRuntime.viewing") : t("translationRuntime.viewDetail")}
                      </s-button>
                    </s-stack>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px 16px",
                        fontSize: "12px",
                        color: pageColorTokens.textSecondary,
                      }}
                    >
                      <span>
                        <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.langLabel")}</span>{" "}
                        <strong style={{ color: pageColorTokens.textMuted }}>
                          {row.source ?? "—"} → {row.target ?? "—"}
                        </strong>
                      </span>
                      <span>
                        <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.updatedAt")}</span>{" "}
                        <strong style={{ color: pageColorTokens.textMuted }}>{row.updatedAt ?? "—"}</strong>
                      </span>
                      {row.aiModel ? (
                        <span>
                          <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.modelLabel")}</span>{" "}
                          <strong style={{ color: pageColorTokens.textMuted }}>{row.aiModel}</strong>
                        </span>
                      ) : null}
                    </div>
                  </s-stack>
                </PagePanel>
              );
            })}
          </s-stack>
        ) : null}
      </s-section>

      <PagePanel>
        <s-stack direction="block" gap="small">
          <s-stack direction="inline" gap="small" alignItems="end">
            <div style={{ flex: "1 1 180px", minWidth: 140 }}>
              <s-text-field
                label={t("translationRuntime.maxPreviewBytes")}
                value={String(maxPreviewBytes)}
                onChange={(e) =>
                  setMaxPreviewBytes(Number(e.currentTarget.value) || 8192)
                }
                autocomplete="off"
              />
            </div>
            <s-button
              type="button"
              variant="primary"
              onClick={() => void fetchDetail()}
              {...(loading || emptyInput ? { disabled: true } : {})}
            >
              {loading ? t("translationRuntime.refreshing") : t("translationRuntime.refreshDetail")}
            </s-button>
            <s-button
              type="button"
              variant={pollEnabled ? "primary" : "secondary"}
              onClick={() => setPollEnabled((v) => !v)}
            >
              {pollEnabled
                ? pollCountdownSec != null
                  ? t("translationRuntime.autoRefreshOnWithCountdown", { sec: pollCountdownSec })
                  : t("translationRuntime.autoRefreshOn")
                : t("translationRuntime.autoRefreshOff")}
            </s-button>
            <s-button
              type="button"
              variant={includeBlobPreview ? "primary" : "secondary"}
              onClick={() => setIncludeBlobPreview((v) => !v)}
            >
              {includeBlobPreview
                ? t("translationRuntime.blobPreviewOn")
                : t("translationRuntime.blobPreviewOff")}
            </s-button>
          </s-stack>
        </s-stack>
      </PagePanel>

      {emptyInput ? (
        <PagePanel padding="large">
          <s-paragraph>
            <span style={{ color: pageColorTokens.textSecondary }}>
              {t("translationRuntime.selectTaskToView")}
            </span>
          </s-paragraph>
        </PagePanel>
      ) : null}

      {!emptyInput && loading && !payload ? (
        <PagePanel padding="large">
          <s-paragraph>
            <span style={{ color: pageColorTokens.textSecondary }}>{t("translationRuntime.loadingTaskDetail")}</span>
          </s-paragraph>
        </PagePanel>
      ) : null}

      {errorText ? (
        <PagePanel>
          <s-paragraph>
            <span style={{ color: pageColorTokens.critical }}>{t("translationRuntime.errorPrefix")}：{errorText}</span>
          </s-paragraph>
        </PagePanel>
      ) : null}

      {!emptyInput && !loading && !errorText && !payload ? (
        <PagePanel>
          <s-paragraph>
            <span style={{ color: pageColorTokens.textSecondary }}>{t("translationRuntime.noDataEmptyResponse")}</span>
          </s-paragraph>
        </PagePanel>
      ) : null}

      {payload ? (
        <s-stack direction="block" gap="base">
          <s-section heading={t("translationRuntime.cosmosSummary")}>
            <PagePanel>
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-badge tone="info">{readString(cosmos, "taskType") || "—"}</s-badge>
                  <s-badge tone={cosmosBadgeTone(readString(cosmos, "statusText"))}>
                    {formatTranslateTaskV3CosmosStatusText(readString(cosmos, "statusText"), t, i18n)}
                  </s-badge>
                  <span style={{ fontSize: "12px", color: pageColorTokens.textSecondary }}>
                    {t("translationRuntime.statusCode")} {String(cosmos?.status ?? "—")}
                  </span>
                </s-stack>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: "12px 20px",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.taskIdLabel")}</div>
                    <div
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        wordBreak: "break-all",
                        color: pageColorTokens.textPrimary,
                      }}
                    >
                      {readString(cosmos, "id") || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.shopLabel")}</div>
                    <div style={{ color: pageColorTokens.textPrimary }}>{readString(cosmos, "shopName") || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.langLabel")}</div>
                    <div style={{ color: pageColorTokens.textPrimary }}>
                      {readString(cosmos, "source") || "—"} → {readString(cosmos, "target") || "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.modelLabel")}</div>
                    <div style={{ color: pageColorTokens.textPrimary }}>{readString(cosmos, "aiModel") || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.createdAt")}</div>
                    <div style={{ color: pageColorTokens.textMuted }}>{readString(cosmos, "createdAt") || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.updatedAt")}</div>
                    <div style={{ color: pageColorTokens.textMuted }}>{readString(cosmos, "updatedAt") || "—"}</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 4 }}>{t("translationRuntime.sessionIdLabel")}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: pageColorTokens.textMuted,
                        wordBreak: "break-all",
                      }}
                    >
                      {readString(cosmos, "sessionId") || "—"}
                    </div>
                  </div>
                </div>
                {cosmos?.checkpoint !== undefined ? (
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "13px", color: pageColorTokens.brandBlue }}>
                      {t("translationRuntime.viewCheckpoint")}
                    </summary>
                    <pre
                      style={{
                        marginTop: 10,
                        maxHeight: 280,
                        overflow: "auto",
                        fontSize: 12,
                        background: pageColorTokens.surface,
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${pageColorTokens.border}`,
                      }}
                    >
                      {JSON.stringify(cosmos.checkpoint, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </s-stack>
            </PagePanel>
          </s-section>

          {payload.translateMonitor && Object.keys(payload.translateMonitor).length > 0 ? (
            <s-section heading={t("translationRuntime.initFetchHeading")}>
              <PagePanel>
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-badge tone="info">
                      {formatRedisTranslatePhaseLabel(payload.translateMonitor.phase?.trim() || "—")}
                    </s-badge>
                    {runtimeChunksFileTotal !== null ? (
                      <span style={{ fontSize: "13px", color: pageColorTokens.textMuted }}>
                        {t("translationRuntime.chunkFileCount", { count: runtimeChunksFileTotal })}
                      </span>
                    ) : null}
                    <span style={{ fontSize: "12px", color: pageColorTokens.textSecondary, lineHeight: 1.5 }}>
                      {t("translationRuntime.initFetchExplain", { sec: DETAIL_POLL_INTERVAL_SEC })}
                    </span>
                  </s-stack>
                  {payload.translateMonitor.initCurrentModule?.trim() ? (
                    <div style={{ fontSize: "13px", color: pageColorTokens.textMuted }}>
                      <span style={{ color: pageColorTokens.textFootnote }}>{t("translationRuntime.currentModule")} </span>
                      <strong>{payload.translateMonitor.initCurrentModule}</strong>
                    </div>
                  ) : null}
                  {readMetricNumber(payload.translateMonitor.initAccumulatedCount) !== null ? (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: "linear-gradient(145deg, #e8f6f1 0%, #dff3ea 100%)",
                        border: "1px solid #84c8a8",
                        boxShadow: "0 1px 2px rgba(0, 82, 54, 0.08)",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#244235" }}>{t("translationRuntime.accumFetched")}</span>
                      <span
                        style={{
                          fontSize: "26px",
                          fontWeight: 800,
                          color: pageColorTokens.brandGreen,
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {readMetricNumber(payload.translateMonitor.initAccumulatedCount)}
                      </span>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "#244235" }}>{t("translationRuntime.itemsUnit")}</span>
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <MetricTile
                      label={t("translationRuntime.moduleProgressShort")}
                      value={
                        readMetricNumber(payload.translateMonitor.initModuleDone) !== null &&
                        readMetricNumber(payload.translateMonitor.initModuleTotal) !== null
                          ? `${readMetricNumber(payload.translateMonitor.initModuleDone) ?? 0} / ${readMetricNumber(payload.translateMonitor.initModuleTotal) ?? 0}`
                          : "—"
                      }
                    />
                    <MetricTile
                      label={t("translationRuntime.initTotalCountLabel")}
                      value={String(readMetricNumber(payload.translateMonitor.totalCount) ?? "—")}
                    />
                    <MetricTile
                      label={t("translationRuntime.monitorUpdatedAt")}
                      value={formatMonitorUpdatedAt(payload.translateMonitor.updatedAt)}
                    />
                  </div>
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "13px", color: pageColorTokens.brandBlue }}>
                      {t("translationRuntime.viewFullMonitorFields")}
                    </summary>
                    <pre
                      style={{
                        marginTop: 10,
                        maxHeight: 240,
                        overflow: "auto",
                        fontSize: 12,
                        background: pageColorTokens.surface,
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${pageColorTokens.border}`,
                      }}
                    >
                      {JSON.stringify(payload.translateMonitor, null, 2)}
                    </pre>
                  </details>
                </s-stack>
              </PagePanel>
            </s-section>
          ) : null}

          <s-section heading={t("translationRuntime.redisProgressHeading")}>
            <s-stack direction="block" gap="small">
                <PagePanel>
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <span style={{ fontSize: "12px", color: pageColorTokens.textSecondary }}>{t("translationRuntime.prefixLabel")}</span>
                    <s-badge tone="info">{payload.resolvedRedisPrefix ?? "—"}</s-badge>
                    {payload.redisRuntime?.redisPrefix &&
                    payload.redisRuntime.redisPrefix !== payload.resolvedRedisPrefix ? (
                      <s-badge tone="info">{payload.redisRuntime.redisPrefix}</s-badge>
                    ) : null}
                    {meta?.status ? <s-badge tone="warning">{meta.status}</s-badge> : null}
                    {meta?.updatedAt ? (
                      <span style={{ fontSize: "12px", color: pageColorTokens.textFootnote, marginLeft: "auto" }}>
                        {t("translationRuntime.updatedAt")} {meta.updatedAt}
                      </span>
                    ) : null}
                  </s-stack>
                </PagePanel>

                <PagePanel padding="large">
                  <s-stack direction="block" gap="large">
                    {!progressView.hasAnyBar ? (
                      <s-paragraph>{progressView.noBarHint}</s-paragraph>
                    ) : null}
                    {progressPercent !== null ? (
                      <>
                        <ProgressBarRow
                          title={t("translationRuntime.entryProgressDetailTitle")}
                          detail={progressView.entryDetail}
                          percent={progressPercent}
                          barGradient="linear-gradient(90deg, #006fbb 0%, #2c6ecb 55%, #5c9ecf 100%)"
                          trackHeight={10}
                        />
                        {effectiveFailCount !== null && effectiveFailCount > 0 ? (
                          <div style={{ marginTop: 6 }}>
                            <button
                              type="button"
                              style={{
                                border: "none",
                                background: "none",
                                color: pageColorTokens.brandBlue,
                                cursor: "pointer",
                                padding: 0,
                                fontSize: "13px",
                                textDecoration: "underline",
                                fontWeight: 600,
                              }}
                              onClick={() =>
                                document
                                  .getElementById("json-runtime-failure-panel")
                                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
                              }
                            >
                              {t("translationRuntime.viewFailuresWithCount", { count: effectiveFailCount })}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {chunkPercent !== null ? (
                      <ProgressBarRow
                        title={t("translationRuntime.chunkProgressLabel")}
                        detail={progressView.chunkDetail}
                        percent={chunkPercent}
                        barGradient="linear-gradient(90deg, #007146 0%, #008060 45%, #36ba8f 100%)"
                        trackHeight={12}
                      />
                    ) : null}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: 12,
                      }}
                    >
                      <MetricTile
                        label="doneSize"
                        value={String(payload.redisRuntime?.doneSize ?? "—")}
                      />
                      <MetricTile
                        label="resultSize"
                        value={String(payload.redisRuntime?.resultSize ?? "—")}
                      />
                      <MetricTile
                        label="chunkDoneSize"
                        value={String(payload.redisRuntime?.chunkDoneSize ?? "—")}
                      />
                    </div>

                    <details>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: "13px",
                          color: pageColorTokens.brandBlue,
                          fontWeight: 500,
                        }}
                      >
                        {t("translationRuntime.redisMetaAll")}
                      </summary>
                      <div
                        style={{
                          marginTop: 12,
                          border: `1px solid ${pageColorTokens.border}`,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: pageColorTokens.surface,
                        }}
                      >
                        {metaEntries.length ? (
                          metaEntries.map(([k, v], i) => (
                            <div
                              key={k}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(100px, 32%) 1fr",
                                gap: 12,
                                padding: "10px 12px",
                                fontSize: 12,
                                borderTop: i === 0 ? "none" : "1px solid #f1f2f4",
                                background:
                                  i % 2 === 0
                                    ? pageColorTokens.surfaceEvenRow
                                    : pageColorTokens.surface,
                              }}
                            >
                              <span
                                style={{
                                  color: pageColorTokens.textSecondary,
                                  wordBreak: "break-all",
                                  fontFamily: "ui-monospace, monospace",
                                }}
                              >
                                {k}
                              </span>
                              <span style={{ wordBreak: "break-word", color: pageColorTokens.textPrimary }}>{v}</span>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: 12, color: pageColorTokens.textSecondary, fontSize: 13 }}>{t("translationRuntime.noMeta")}</div>
                        )}
                      </div>
                    </details>
                  </s-stack>
                </PagePanel>
            </s-stack>
          </s-section>

          <div id="json-runtime-failure-panel">
          <s-section heading={t("translationRuntime.failuresHeading")}>
            {payload.runtimeReportFailuresTruncated ? (
              <PagePanel>
                <s-paragraph>
                  <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px" }}>
                    {t("translationRuntime.largeReportBlobHint")}
                  </span>
                </s-paragraph>
              </PagePanel>
            ) : null}
            {payload.runtimeFailedJsonTruncated ? (
              <PagePanel>
                <s-paragraph>
                  <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px" }}>
                    {t("translationRuntime.failedJsonLargeHint")}
                  </span>
                </s-paragraph>
              </PagePanel>
            ) : null}
            {mergedFailRows.length ? (
              <s-stack direction="block" gap="small">
                {mergedFailRows.map((row, idx) => (
                  <div
                    key={`${row.source}-${idx}-${row.path}`}
                    style={{
                      borderLeft: "4px solid #d82c0d",
                      borderRadius: "0 8px 8px 0",
                      background: "#fff4f4",
                      padding: "12px 14px",
                      border: "1px solid #fec6c3",
                      borderLeftWidth: 4,
                    }}
                  >
                    <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 6 }}>
                      {t("translationRuntime.sourceLabel")}：{row.source}
                    </div>
                    <div
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 12,
                        color: pageColorTokens.textPrimary,
                        wordBreak: "break-all",
                        marginBottom: 6,
                      }}
                    >
                      {row.path}
                    </div>
                    {row.sourceText ? (
                      <div
                        style={{
                          marginBottom: 10,
                          padding: "10px 12px",
                          background: pageColorTokens.surface,
                          borderRadius: 8,
                          border: `1px solid ${pageColorTokens.border}`,
                          fontSize: 14,
                          color: pageColorTokens.textPrimary,
                          lineHeight: 1.45,
                          wordBreak: "break-word",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        <div style={{ fontSize: "11px", color: pageColorTokens.textFootnote, marginBottom: 6 }}>
                          {t("translationRuntime.sourceValueLabel")}
                        </div>
                        {row.sourceText}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>{row.reason}</div>
                  </div>
                ))}
              </s-stack>
            ) : Array.isArray((payload.runtimeFailedJson as { items?: unknown[] } | undefined)?.items) &&
              ((payload.runtimeFailedJson as { items: unknown[] }).items?.length ?? 0) > 0 ? null : (
              <PagePanel>
                <s-paragraph>
                  <span style={{ color: pageColorTokens.textSecondary }}>
                    {t("translationRuntime.noFailureDetailHint")}
                  </span>
                </s-paragraph>
              </PagePanel>
            )}
            {Array.isArray((payload.runtimeFailedJson as { items?: unknown[] } | undefined)?.items) &&
            ((payload.runtimeFailedJson as { items: unknown[] }).items?.length ?? 0) > 0 ? (
              <details style={{ marginTop: 12 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: "13px",
                    color: pageColorTokens.brandBlue,
                    fontWeight: 600,
                  }}
                >
                  {t("translationRuntime.expandFailedJsonAll", {
                    count: (payload.runtimeFailedJson as { items: unknown[] }).items.length,
                  })}
                </summary>
                <div style={{ marginTop: 12 }}>
                  {(payload.runtimeFailedJson as { items: unknown[] }).items.map((it, i) => {
                    const row = it as Record<string, unknown>;
                    const sv =
                      typeof row.sourceValue === "string" ? row.sourceValue : "";
                    const mod = typeof row.module === "string" ? row.module : "—";
                    const cf = typeof row.chunkFile === "string" ? row.chunkFile : "—";
                    const p = typeof row.path === "string" ? row.path : "—";
                    const r = typeof row.reason === "string" ? row.reason : "—";
                    const sk = typeof row.storageKey === "string" ? row.storageKey : "";
                    return (
                      <div
                        key={`fj-${i}-${sk || p}`}
                        style={{
                          marginBottom: 12,
                          padding: "12px 14px",
                          background: pageColorTokens.surfaceEvenRow,
                          borderRadius: 8,
                          border: `1px solid ${pageColorTokens.border}`,
                        }}
                      >
                        <div style={{ fontSize: "12px", color: pageColorTokens.textSecondary, marginBottom: 8 }}>
                          {t("translationRuntime.moduleChunkFile", { module: mod, chunkFile: cf })}
                        </div>
                        <div
                          style={{
                            fontFamily: "ui-monospace, monospace",
                            fontSize: 12,
                            wordBreak: "break-all",
                            color: pageColorTokens.textMuted,
                            marginBottom: 8,
                          }}
                        >
                          {sk || p}
                        </div>
                        {sv ? (
                          <div
                            style={{
                              padding: "10px 12px",
                              background: pageColorTokens.surface,
                              borderRadius: 6,
                              border: `1px solid ${pageColorTokens.borderSubtle}`,
                              fontSize: 14,
                              lineHeight: 1.45,
                              wordBreak: "break-word",
                              whiteSpace: "pre-wrap",
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ fontSize: "11px", color: pageColorTokens.textFootnote }}>{t("translationRuntime.sourceTextPrefix")} · </span>
                            {sv}
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", color: pageColorTokens.textFootnote, marginBottom: 8 }}>
                            {t("translationRuntime.noSourceValueHint")}
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>{r}</div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </s-section>
          </div>

          <s-section heading={t("translationRuntime.blobArtifactsHeading")}>
            <s-stack direction="block" gap="small">
              {(["input", "output", "report"] as const).map((key) => {
                const b = payload.blobs?.[key];
                const existsOk = b?.exists === true;
                return (
                  <PagePanel key={key}>
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <span style={{ fontWeight: 600, fontSize: "14px", color: pageColorTokens.textPrimary }}>
                          {blobLabels[key]}
                        </span>
                        <s-badge tone={existsOk ? "success" : b?.exists === false ? "critical" : "info"}>
                          {existsOk
                            ? t("translationRuntime.exists")
                            : b?.exists === false
                              ? t("translationRuntime.notExists")
                              : t("translationRuntime.unknown")}
                        </s-badge>
                        <span style={{ fontSize: "13px", color: pageColorTokens.textSecondary }}>
                          {formatBytes(b?.sizeBytes)}
                          {b?.previewTruncated ? ` · ${t("translationRuntime.previewTruncatedShort")}` : ""}
                        </span>
                      </s-stack>
                      {b?.note ? (
                        <s-paragraph>
                          <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px" }}>{b.note}</span>
                        </s-paragraph>
                      ) : null}
                      {b?.uri ? (
                        <div
                          style={{
                            wordBreak: "break-all",
                            color: pageColorTokens.textSecondary,
                            fontSize: "12px",
                            lineHeight: 1.45,
                          }}
                        >
                          {b.uri}
                        </div>
                      ) : null}
                      {b?.preview ? (
                        <pre
                          style={{
                            maxHeight: 200,
                            overflow: "auto",
                            fontSize: 11,
                            margin: 0,
                            background: pageColorTokens.surface,
                            padding: 10,
                            borderRadius: 8,
                            border: `1px solid ${pageColorTokens.border}`,
                          }}
                        >
                          {b.preview}
                        </pre>
                      ) : includeBlobPreview ? (
                        <s-paragraph>
                          <span style={{ color: pageColorTokens.textFootnote, fontSize: "13px" }}>{t("translationRuntime.noPreviewContent")}</span>
                        </s-paragraph>
                      ) : null}
                    </s-stack>
                  </PagePanel>
                );
              })}
              <PagePanel>
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <span style={{ fontWeight: 600, fontSize: "14px", color: pageColorTokens.textPrimary }}>
                      {t("translationRuntime.reportTitleWithFile")}
                    </span>
                    <s-badge tone={trBlob?.exists === true ? "success" : "info"}>
                      {trBlob?.exists === true
                        ? t("translationRuntime.exists")
                        : trBlob?.exists === false
                          ? t("translationRuntime.notExists")
                          : t("translationRuntime.unknown")}
                    </s-badge>
                    <span style={{ fontSize: "13px", color: pageColorTokens.textSecondary }}>
                      {formatBytes(trBlob?.sizeBytes)}
                    </span>
                  </s-stack>
                  <s-paragraph>
                    <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px" }}>
                      {t("translationRuntime.reportBlobDesc")}
                    </span>
                  </s-paragraph>
                  {trBlob?.blobPath ? (
                    <div
                      style={{
                        wordBreak: "break-all",
                        color: pageColorTokens.textSecondary,
                        fontSize: "12px",
                        lineHeight: 1.45,
                      }}
                    >
                      {trBlob.blobPath}
                    </div>
                  ) : null}
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => void fetchTranslationReportMdPreview()}
                    {...(mdPreviewLoading || emptyInput ? { disabled: true } : {})}
                  >
                    {mdPreviewLoading
                      ? t("translationRuntime.loading")
                      : t("translationRuntime.previewMarkdownInModal")}
                  </s-button>
                </s-stack>
              </PagePanel>
              <PagePanel>
                <s-stack direction="block" gap="small">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <span style={{ fontWeight: 600, fontSize: "14px", color: pageColorTokens.textPrimary }}>
                      {t("translationRuntime.qualityReportTitleLong")}
                    </span>
                    <s-badge tone={qrBlob?.exists === true ? "success" : "info"}>
                      {qrBlob?.exists === true
                        ? t("translationRuntime.exists")
                        : qrBlob?.exists === false
                          ? t("translationRuntime.notExists")
                          : t("translationRuntime.unknown")}
                    </s-badge>
                    <span style={{ fontSize: "13px", color: pageColorTokens.textSecondary }}>
                      {formatBytes(qrBlob?.sizeBytes)}
                    </span>
                  </s-stack>
                  <s-paragraph>
                    <span style={{ color: pageColorTokens.textSecondary, fontSize: "13px" }}>
                      {t("translationRuntime.qualityBlobDesc")}
                    </span>
                  </s-paragraph>
                  {qrBlob?.blobPath ? (
                    <div
                      style={{
                        wordBreak: "break-all",
                        color: pageColorTokens.textSecondary,
                        fontSize: "12px",
                        lineHeight: 1.45,
                      }}
                    >
                      {qrBlob.blobPath}
                    </div>
                  ) : null}
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => void fetchQualityReportMdPreview()}
                    {...(mdPreviewLoading || emptyInput ? { disabled: true } : {})}
                  >
                    {mdPreviewLoading
                      ? t("translationRuntime.loading")
                      : t("translationRuntime.previewQualityInModal")}
                  </s-button>
                </s-stack>
              </PagePanel>
            </s-stack>
          </s-section>

          {payload.reportParsed && Object.keys(payload.reportParsed).length ? (
            <s-section heading={t("translationRuntime.parsedReportHeading")}>
              <PagePanel>
                <pre
                  style={{
                    maxHeight: 320,
                    overflow: "auto",
                    fontSize: 12,
                    margin: 0,
                    background: pageColorTokens.surface,
                    padding: 14,
                    borderRadius: 8,
                    border: `1px solid ${pageColorTokens.border}`,
                  }}
                >
                  {JSON.stringify(payload.reportParsed, null, 2)}
                </pre>
              </PagePanel>
            </s-section>
          ) : null}
        </s-stack>
      ) : null}
    </s-stack>

    {mdPreviewOpen ? (
      <div
        role="presentation"
        style={MD_PREVIEW_MODAL_OVERLAY_STYLE}
        onClick={() => setMdPreviewOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMdPreviewOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={mdPreviewTitle}
          style={MD_PREVIEW_MODAL_CARD_STYLE}
          onClick={(e) => e.stopPropagation()}
        >
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
            <strong style={{ fontSize: "15px", color: pageColorTokens.textPrimary }}>{mdPreviewTitle}</strong>
            <s-button type="button" variant="secondary" onClick={() => setMdPreviewOpen(false)}>
              {t("common.close")}
            </s-button>
          </div>
          {mdPreviewTruncated ? (
            <div
              style={{
                padding: "8px 16px",
                fontSize: "12px",
                color: pageColorTokens.textSecondary,
                background: "#fff5ea",
                borderBottom: "1px solid #ffd79c",
                flexShrink: 0,
              }}
            >
              {t("translationRuntime.previewServerTruncatedHint")}
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
              color: pageColorTokens.textPrimary,
            }}
            className="json-runtime-md-preview"
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
              {mdPreviewText}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
