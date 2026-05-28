import { useCallback, useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import type { loader } from "../app.translation-v4";
import {
  TERMINAL_V4_STATUSES,
  type TranslationV4Job,
  type TranslationV4Status,
} from "../../server/translation/v4/types";
import {
  PageSurface,
  pageColorTokens,
  pageContentStyle,
  pageFieldLabelStyle,
  pageIntroBannerStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  stickyAsideColumnStyle,
  formErrorBoxStyle,
  pageEmptyStateStyle,
} from "./pageUiStyles";

const POLL_INTERVAL = 3000;
const ACTIVE_STATUSES: TranslationV4Status[] = [
  "INIT_QUEUED", "INITIALIZING", "INIT_DONE",
  "TRANSLATE_QUEUED", "TRANSLATING", "TRANSLATE_DONE",
  "WRITEBACK_QUEUED", "WRITING_BACK",
  "VERIFY_QUEUED", "VERIFYING",
];

/** Aligns with stageFromStatus in api.translate.v4.task-action.ts */
function stageFromV4Status(status: TranslationV4Status): string {
  if (["INIT_QUEUED", "INITIALIZING", "INIT_DONE"].includes(status)) return "INIT";
  if (["TRANSLATE_QUEUED", "TRANSLATING", "TRANSLATE_DONE"].includes(status)) return "TRANSLATE";
  if (["WRITEBACK_QUEUED", "WRITING_BACK"].includes(status)) return "WRITEBACK";
  if (["VERIFY_QUEUED", "VERIFYING"].includes(status)) return "VERIFY";
  return "INIT";
}

/** Aligns with resolveResumeStatus in api.translate.v4.task-action.ts */
function resolveResumeV4Status(
  currentStatus: TranslationV4Status,
  errorStage: string | null,
): TranslationV4Status | null {
  if (currentStatus !== "PAUSED" && currentStatus !== "FAILED") return null;
  switch (errorStage) {
    case "TRANSLATE": return "TRANSLATE_QUEUED";
    case "WRITEBACK": return "WRITEBACK_QUEUED";
    case "VERIFY": return "VERIFY_QUEUED";
    default: return "INIT_QUEUED";
  }
}

type OptimisticActionIntent = "pause" | "cancel" | "resume";

type OptimisticJobPatch = {
  status: TranslationV4Status;
  priorStatus: TranslationV4Status;
  errorStage?: string | null;
  errorMessage?: string | null;
};

function progressFromJob(
  job: TranslationV4Job,
  status: TranslationV4Status,
  errorStage: string | null,
): ProgressData {
  return {
    status,
    testMode: job.testMode,
    source: job.source,
    target: job.target,
    errorMessage: job.errorMessage,
    errorStage,
    lastHeartbeat: job.lastHeartbeat,
    updatedAt: job.updatedAt,
    metrics: {
      initTotal: job.metrics.initTotal,
      initDone: job.metrics.initDone,
      translateTotal: job.metrics.translateTotal,
      translateDone: job.metrics.translateDone,
      translateFailed: job.metrics.translateFailed,
      writebackTotal: job.metrics.writebackTotal,
      writebackDone: job.metrics.writebackDone,
      writebackFailed: job.metrics.writebackFailed,
      verifyTotal: job.metrics.verifyTotal,
      verifyDone: job.metrics.verifyDone,
      verifyFailed: job.metrics.verifyFailed,
      currentModule: null,
    },
  };
}

type ProgressData = {
  status: TranslationV4Status;
  testMode: boolean;
  source: string;
  target: string;
  errorMessage: string | null;
  errorStage: string | null;
  lastHeartbeat: string | null;
  updatedAt: string;
  metrics: {
    initTotal: number; initDone: number;
    translateTotal: number; translateDone: number; translateFailed: number;
    writebackTotal: number; writebackDone: number; writebackFailed: number;
    verifyTotal: number; verifyDone: number; verifyFailed: number;
    currentModule: string | null;
  };
};

/** job.status 为暂停/终端态时以 Cosmos 列表为准，避免陈旧 poll 覆盖 UI */
function resolveDisplayStatus(
  job: TranslationV4Job,
  progress: ProgressData | undefined,
): TranslationV4Status {
  if (job.status === "PAUSED" || TERMINAL_V4_STATUSES.includes(job.status)) {
    return job.status;
  }
  if (
    ACTIVE_STATUSES.includes(job.status) &&
    progress?.status === "PAUSED"
  ) {
    return job.status;
  }
  return (progress?.status ?? job.status) as TranslationV4Status;
}

export function TranslationV4Page() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData<typeof loader>();

  const [source, setSource] = useState("zh-CN");
  const [target, setTarget] = useState("en");
  const [modules, setModules] = useState<string[]>(["PRODUCT", "COLLECTION", "PAGE", "ARTICLE"]);
  const [limitPerType, setLimitPerType] = useState(20);
  const [isCover, setIsCover] = useState(false);
  const [isHandle, setIsHandle] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<TranslationV4Job[]>(loaderData.jobs as TranslationV4Job[]);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressData>>({});
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const optimisticActionRef = useRef<Map<string, OptimisticActionIntent>>(new Map());

  const shopName = loaderData.shop;
  const query = typeof window !== "undefined" ? window.location.search : "";
  const querySep = query ? "&" : "?";

  const refreshJobList = useCallback(async () => {
    const listRes = await fetch(`/api/translate/v4/tasks${query}${querySep}shopName=${shopName}`);
    const listPayload = (await listRes.json()) as { ok: boolean; jobs?: TranslationV4Job[] };
    if (listPayload.ok && listPayload.jobs) setJobs(listPayload.jobs);
  }, [query, shopName]);

  const applyOptimisticPatch = useCallback(
    (taskId: string, job: TranslationV4Job, patch: OptimisticJobPatch) => {
      const errorStage =
        patch.errorStage !== undefined ? patch.errorStage : job.errorStage;
      const errorMessage =
        patch.errorMessage !== undefined ? patch.errorMessage : job.errorMessage;

      setJobs((prev) =>
        prev.map((j) =>
          j.id === taskId
            ? {
                ...j,
                status: patch.status,
                errorStage,
                errorMessage,
              }
            : j,
        ),
      );
      setProgressMap((prev) => {
        const base =
          prev[taskId] ?? progressFromJob(job, patch.priorStatus, job.errorStage);
        return {
          ...prev,
          [taskId]: {
            ...base,
            status: patch.status,
            errorStage,
            errorMessage,
          },
        };
      });
    },
    [],
  );

  const syncTaskAction = useCallback(
    async (taskId: string, action: OptimisticActionIntent) => {
      try {
        const res = await fetch(`/api/translate/v4/task-action${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, shopName, action }),
        });
        const payload = (await res.json()) as { ok?: boolean };
        if (!res.ok || !payload.ok) throw new Error("task action failed");
        optimisticActionRef.current.delete(taskId);
        await refreshJobList();
      } catch {
        optimisticActionRef.current.delete(taskId);
        shopify.toast.show("操作失败");
        await refreshJobList();
      }
    },
    [query, shopName, refreshJobList, shopify],
  );

  // Poll active jobs
  const pollActiveJobs = useCallback(async () => {
    const activeJobIds = jobs
      .filter((j) => ACTIVE_STATUSES.includes(j.status as TranslationV4Status))
      .map((j) => j.id);
    if (!activeJobIds.length) return;

    await Promise.all(
      activeJobIds.map(async (taskId) => {
        try {
          const res = await fetch(
            `/api/translate/v4/task-progress${query}${querySep}taskId=${taskId}&shopName=${shopName}`,
          );
          if (!res.ok) return;
          const payload = (await res.json()) as { ok: boolean } & ProgressData;
          if (!payload.ok) return;

          const intent = optimisticActionRef.current.get(taskId);
          if (intent === "pause" || intent === "cancel") {
            if (ACTIVE_STATUSES.includes(payload.status)) return;
          }
          if (intent === "resume" && payload.status === "PAUSED") return;

          if (payload.status === "PAUSED") {
            optimisticActionRef.current.delete(taskId);
          }

          setProgressMap((prev) => ({ ...prev, [taskId]: payload }));
          setJobs((prev) =>
            prev.map((j) => (j.id === taskId ? { ...j, status: payload.status } : j)),
          );
        } catch {
          // ignore
        }
      }),
    );
  }, [jobs, query, shopName]);

  useEffect(() => {
    pollTimerRef.current = setInterval(pollActiveJobs, POLL_INTERVAL);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [pollActiveJobs]);

  const handleToggleModule = (m: string) => {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const handleCreateJob = async () => {
    setFormError(null);
    if (!target.trim()) { setFormError("目标语言不能为空"); return; }
    if (!modules.length) { setFormError("至少选择一个模块"); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/translate/v4/tasks${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, target, modules, limitPerType, isCover, isHandle, testMode }),
      });
      const payload = (await res.json()) as { ok: boolean; jobId?: string; error?: string; testMode?: boolean };
      if (!res.ok || !payload.ok) {
        setFormError(payload.error || "创建失败");
        return;
      }
      const modeLabel = payload.testMode ? "（测试模式）" : "";
      shopify.toast.show(`翻译任务已创建${modeLabel}`);
      // Refresh job list
      const listRes = await fetch(`/api/translate/v4/tasks${query}${querySep}shopName=${shopName}`);
      const listPayload = (await listRes.json()) as { ok: boolean; jobs?: TranslationV4Job[] };
      if (listPayload.ok && listPayload.jobs) setJobs(listPayload.jobs);
    } catch {
      setFormError("请求失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = (taskId: string, action: "cancel" | "pause" | "resume") => {
    const job = jobs.find((j) => j.id === taskId);
    if (!job) return;

    const priorStatus = (progressMap[taskId]?.status ?? job.status) as TranslationV4Status;

    if (action === "pause") {
      optimisticActionRef.current.set(taskId, "pause");
      applyOptimisticPatch(taskId, job, {
        status: "PAUSED",
        priorStatus,
        errorStage: stageFromV4Status(priorStatus),
      });
      void syncTaskAction(taskId, "pause");
      return;
    }

    if (action === "cancel") {
      optimisticActionRef.current.set(taskId, "cancel");
      applyOptimisticPatch(taskId, job, {
        status: "CANCELLED",
        priorStatus,
      });
      void syncTaskAction(taskId, "cancel");
      return;
    }

    if (action === "resume") {
      const resumeStatus = resolveResumeV4Status(job.status, job.errorStage);
      if (!resumeStatus) {
        shopify.toast.show("无法重试该任务");
        return;
      }
      optimisticActionRef.current.set(taskId, "resume");
      applyOptimisticPatch(taskId, job, {
        status: resumeStatus,
        priorStatus,
        errorStage: null,
        errorMessage: null,
      });
      void syncTaskAction(taskId, "resume");
    }
  };

  return (
    <s-page heading="翻译 v4">
      <div style={pageIntroBannerStyle("translation", { marginBottom: "1.5rem" })}>
        新版翻译系统 — 任务状态持久化，服务重启后自动续跑，支持商品/集合/页面/文章等多模块并行。
      </div>

      <div style={pageContentStyle}>
        <div style={twoColumnLayoutStyle}>
          {/* Left: Create form */}
          <div style={twoColumnMainStyle}>
            <PageSurface title="创建翻译任务">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 140px" }}>
                    <s-text-field
                      label="源语言"
                      value={source}
                      onChange={(e) => setSource(e.currentTarget.value)}
                      autocomplete="off"
                    />
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <s-text-field
                      label="目标语言"
                      value={target}
                      onChange={(e) => setTarget(e.currentTarget.value)}
                      autocomplete="off"
                    />
                  </div>
                  <div style={{ flex: "1 1 100px" }}>
                    <s-text-field
                      label="每模块数量限制"
                      value={String(limitPerType)}
                      onChange={(e) => setLimitPerType(Number(e.currentTarget.value) || 20)}
                      autocomplete="off"
                    />
                  </div>
                </div>

                <div>
                  <div style={pageFieldLabelStyle}>翻译模块</div>
                  <s-stack direction="inline" gap="small">
                    {loaderData.modules.map((m) => (
                      <s-button
                        key={m}
                        type="button"
                        variant={modules.includes(m) ? "primary" : "secondary"}
                        onClick={() => handleToggleModule(m)}
                      >
                        {m}
                      </s-button>
                    ))}
                  </s-stack>
                </div>

                <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                  <label style={checkboxLabelStyle}>
                    <input type="checkbox" checked={isCover} onChange={(e) => setIsCover(e.target.checked)} />
                    <span>覆盖已有翻译</span>
                  </label>
                  <label style={checkboxLabelStyle}>
                    <input type="checkbox" checked={isHandle} onChange={(e) => setIsHandle(e.target.checked)} />
                    <span>翻译 Handle/Slug</span>
                  </label>
                </div>

                {/* Test mode toggle — prominently styled */}
                <div style={testModeBannerStyle(testMode)}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={testMode}
                      onChange={(e) => setTestMode(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: "pointer" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.875rem", color: testMode ? "#b54708" : pageColorTokens.textBody }}>
                        测试模式{testMode ? "（已开启）" : ""}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                        翻译阶段直接使用原值作为译文，跳过 LLM 调用 — 适合快速测试流程
                      </div>
                    </div>
                  </label>
                </div>

                {formError && <div style={formErrorBoxStyle}>{formError}</div>}

                <div>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={handleCreateJob}
                    {...(isSubmitting ? { disabled: true } : {})}
                  >
                    {isSubmitting ? "创建中..." : "创建翻译任务"}
                  </s-button>
                </div>
              </s-stack>
            </PageSurface>
          </div>

          {/* Right: Pipeline legend */}
          <div style={stickyAsideColumnStyle}>
            <PageSurface title="流程说明">
              <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>
                {[
                  ["① 初始化", "拉取 Shopify 数据 → Blob"],
                  ["② 翻译", "读取 Blob → LLM 翻译 → 写回 Blob"],
                  ["③ 回写", "读取翻译结果 → 写回 Shopify"],
                  ["④ 验证", "重试回写失败的资源，确保写入完整"],
                ].map(([step, desc]) => (
                  <div key={step} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 600, color: pageColorTokens.textBody, whiteSpace: "nowrap" }}>{step}</span>
                    <span>{desc}</span>
                  </div>
                ))}
                <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${pageColorTokens.border}` }}>
                  Worker 每 30 秒轮询，服务重启后自动续跑。
                </div>
              </div>
            </PageSurface>
          </div>
        </div>

        {/* Job list */}
        <PageSurface title={`任务列表（${jobs.length}）`}>
          {jobs.length === 0 ? (
            <div style={pageEmptyStateStyle}>暂无翻译任务，创建一个开始</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {jobs.map((job) => {
                const progress = progressMap[job.id];
                const status = resolveDisplayStatus(job, progress);
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    status={status}
                    progress={progress ?? null}
                    onAction={handleAction}
                  />
                );
              })}
            </div>
          )}
        </PageSurface>
      </div>
    </s-page>
  );
}

type JobCardProps = {
  job: TranslationV4Job;
  status: TranslationV4Status;
  progress: ProgressData | null;
  onAction: (taskId: string, action: "cancel" | "pause" | "resume") => void | Promise<void>;
};

function JobCard({ job, status, progress, onAction }: JobCardProps) {
  const metrics = progress?.metrics ?? job.metrics;
  const isActive = ACTIVE_STATUSES.includes(status);
  const isCompleted = status === "COMPLETED";
  const isFailed = status === "FAILED";

  return (
    <div style={jobCardStyle(status)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textPrimary }}>
              {job.source} → {job.target}
            </span>
            <StatusBadge status={status} />
            {(progress?.testMode ?? job.testMode) && (
              <span style={testModePillStyle}>TEST</span>
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 3 }}>
            {job.id.slice(0, 8)}… · {job.modules.join(", ")} · 每类 {job.limitPerType} 条
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {isActive && (
            <s-button type="button" variant="secondary" onClick={() => onAction(job.id, "pause")}>暂停</s-button>
          )}
          {(status === "PAUSED" || isFailed) && (
            <s-button type="button" variant="secondary" onClick={() => onAction(job.id, "resume")}>重试</s-button>
          )}
          {!isCompleted && status !== "CANCELLED" && (
            <s-button type="button" variant="secondary" onClick={() => onAction(job.id, "cancel")}>取消</s-button>
          )}
        </div>
      </div>

      {/* Stage progress bars */}
      <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <StageBar label="初始化" done={metrics.initDone} total={metrics.initTotal} active={status === "INITIALIZING"} complete={["INIT_DONE","TRANSLATE_QUEUED","TRANSLATING","TRANSLATE_DONE","WRITEBACK_QUEUED","WRITING_BACK","VERIFY_QUEUED","VERIFYING","COMPLETED"].includes(status)} />
        <StageBar label="翻译" done={metrics.translateDone} total={metrics.translateTotal} active={status === "TRANSLATING"} complete={["TRANSLATE_DONE","WRITEBACK_QUEUED","WRITING_BACK","VERIFY_QUEUED","VERIFYING","COMPLETED"].includes(status)} failed={metrics.translateFailed} />
        <StageBar label="回写" done={metrics.writebackDone} total={metrics.writebackTotal} active={status === "WRITING_BACK"} complete={["VERIFY_QUEUED","VERIFYING","COMPLETED"].includes(status)} failed={metrics.writebackFailed} />
        {(metrics.verifyTotal > 0 || ["VERIFY_QUEUED","VERIFYING"].includes(status)) && (
          <StageBar label="验证" done={metrics.verifyDone} total={metrics.verifyTotal} active={status === "VERIFYING"} complete={status === "COMPLETED" && metrics.verifyTotal > 0} failed={metrics.verifyFailed} />
        )}
      </div>

      {metrics.currentModule && isActive && (
        <div style={{ fontSize: "0.75rem", color: pageColorTokens.brandBlue, marginTop: "0.4rem", fontWeight: 600 }}>
          ▶ 当前模块: {metrics.currentModule}
        </div>
      )}

      {isFailed && (progress?.errorMessage ?? job.errorMessage) && (
        <div style={{ ...failErrorStyle, marginTop: "0.5rem" }}>
          [{progress?.errorStage ?? job.errorStage}] {progress?.errorMessage ?? job.errorMessage}
        </div>
      )}
    </div>
  );
}

type StageBarProps = {
  label: string;
  done: number;
  total: number;
  active: boolean;
  complete: boolean;
  failed?: number;
};

function StageBar({ label, done, total, active, complete, failed = 0 }: StageBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (complete ? 100 : 0);

  const fillBg = complete
    ? "linear-gradient(90deg, #00c48c 0%, #00a67c 60%, #007a5a 100%)"
    : active
    ? "linear-gradient(90deg, #6090ff 0%, #4070f4 60%, #2952d8 100%)"
    : pageColorTokens.borderInput;

  const fillGlow = complete
    ? "0 0 10px rgba(0, 166, 124, 0.5)"
    : active
    ? "0 0 10px rgba(64, 112, 244, 0.45)"
    : "none";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
      <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, width: 46, flexShrink: 0, fontWeight: active || complete ? 600 : 400 }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "linear-gradient(90deg, #e8eaef 0%, #dfe3ea 100%)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: fillBg, borderRadius: 4, transition: "width 0.45s ease", boxShadow: fillGlow }} />
      </div>
      <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, minWidth: 84, flexShrink: 0, textAlign: "right" }}>
        {total > 0 ? `${done}/${total}` : "等待"}
        {" "}{complete ? <span style={{ color: "#00a67c", fontWeight: 700 }}>✓</span> : active ? <span style={{ color: "#4070f4" }}>⟳</span> : ""}
        {failed > 0 ? <span style={{ color: "#f59e0b", fontWeight: 600 }}> ⚠{failed}</span> : ""}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: TranslationV4Status }) {
  const config = STATUS_DISPLAY[status] ?? { label: status, color: "#4b5563", bg: "#f3f4f6" };
  return (
    <span style={{
      padding: "0.18rem 0.65rem",
      borderRadius: 999,
      fontSize: "0.75rem",
      fontWeight: 700,
      color: config.color,
      background: config.bg,
      boxShadow: config.shadow ?? "none",
      letterSpacing: "0.01em",
    }}>
      {config.label}
    </span>
  );
}

const STATUS_DISPLAY: Partial<Record<TranslationV4Status, { label: string; color: string; bg: string; shadow?: string }>> = {
  CREATED:         { label: "已创建",    color: "#4b5563", bg: "linear-gradient(135deg, #f3f4f6 0%, #e9ebee 100%)" },
  INIT_QUEUED:     { label: "等待初始化", color: "#2952d8", bg: "linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%)", shadow: "0 1px 4px rgba(64,112,244,0.18)" },
  INITIALIZING:    { label: "初始化中",  color: "#1d40c0", bg: "linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 100%)", shadow: "0 1px 6px rgba(64,112,244,0.25)" },
  INIT_DONE:       { label: "初始化完成", color: "#005c46", bg: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)", shadow: "0 1px 4px rgba(0,166,124,0.18)" },
  TRANSLATE_QUEUED:{ label: "等待翻译",  color: "#2952d8", bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)", shadow: "0 1px 4px rgba(64,112,244,0.18)" },
  TRANSLATING:     { label: "翻译中",    color: "#1d40c0", bg: "linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)", shadow: "0 1px 8px rgba(64,112,244,0.3)" },
  TRANSLATE_DONE:  { label: "翻译完成",  color: "#005c46", bg: "linear-gradient(135deg, #d1fae5 0%, #6ee7b7 100%)", shadow: "0 1px 4px rgba(0,166,124,0.2)" },
  WRITEBACK_QUEUED:{ label: "等待回写",  color: "#2952d8", bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)", shadow: "0 1px 4px rgba(64,112,244,0.18)" },
  WRITING_BACK:    { label: "回写中",    color: "#1d40c0", bg: "linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)", shadow: "0 1px 8px rgba(64,112,244,0.3)" },
  VERIFY_QUEUED:   { label: "等待验证",  color: "#5b21b6", bg: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)", shadow: "0 1px 4px rgba(124,92,214,0.2)" },
  VERIFYING:       { label: "验证中",    color: "#4c1d95", bg: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)", shadow: "0 1px 8px rgba(124,92,214,0.3)" },
  COMPLETED:       { label: "已完成",    color: "#005c46", bg: "linear-gradient(135deg, #34d399 0%, #10b981 100%)", shadow: "0 1px 8px rgba(0,166,124,0.35)" },
  FAILED:          { label: "失败",      color: "#991b1b", bg: "linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)", shadow: "0 1px 4px rgba(220,38,38,0.2)" },
  PAUSED:          { label: "已暂停",    color: "#7a4f00", bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", shadow: "0 1px 4px rgba(245,158,11,0.2)" },
  CANCELLED:       { label: "已取消",    color: "#6b7280", bg: "linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)" },
};

function jobCardStyle(status: TranslationV4Status): React.CSSProperties {
  const isActive = ACTIVE_STATUSES.includes(status);
  const isCompleted = status === "COMPLETED";
  const isFailed = status === "FAILED";
  const isPaused = status === "PAUSED";

  if (isActive) {
    return {
      padding: "1.1rem 1.2rem",
      border: "1.5px solid rgba(64, 112, 244, 0.4)",
      borderRadius: "14px",
      background: "linear-gradient(160deg, #ffffff 0%, #f3f7ff 100%)",
      boxShadow: "0 6px 24px rgba(64, 112, 244, 0.14), 0 1px 4px rgba(0,0,0,0.05)",
      transition: "border-color 0.2s, box-shadow 0.2s",
    };
  }
  if (isCompleted) {
    return {
      padding: "1.1rem 1.2rem",
      border: "1.5px solid rgba(0, 166, 124, 0.35)",
      borderRadius: "14px",
      background: "linear-gradient(160deg, #ffffff 0%, #f3fdf8 100%)",
      boxShadow: "0 4px 16px rgba(0, 166, 124, 0.12), 0 1px 3px rgba(0,0,0,0.04)",
      transition: "border-color 0.2s, box-shadow 0.2s",
    };
  }
  if (isFailed) {
    return {
      padding: "1.1rem 1.2rem",
      border: "1.5px solid rgba(220, 38, 38, 0.3)",
      borderRadius: "14px",
      background: "linear-gradient(160deg, #ffffff 0%, #fff5f5 100%)",
      boxShadow: "0 4px 14px rgba(220, 38, 38, 0.1), 0 1px 3px rgba(0,0,0,0.04)",
      transition: "border-color 0.2s, box-shadow 0.2s",
    };
  }
  if (isPaused) {
    return {
      padding: "1.1rem 1.2rem",
      border: "1.5px solid rgba(245, 158, 11, 0.35)",
      borderRadius: "14px",
      background: "linear-gradient(160deg, #ffffff 0%, #fffbf0 100%)",
      boxShadow: "0 4px 14px rgba(245, 158, 11, 0.1), 0 1px 3px rgba(0,0,0,0.04)",
      transition: "border-color 0.2s, box-shadow 0.2s",
    };
  }
  return {
    padding: "1.1rem 1.2rem",
    border: `1px solid ${pageColorTokens.border}`,
    borderRadius: "14px",
    background: "linear-gradient(160deg, #ffffff 0%, #f8faff 100%)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)",
    transition: "border-color 0.2s, box-shadow 0.2s",
  };
}

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "0.875rem",
  color: pageColorTokens.textBody,
  cursor: "pointer",
  userSelect: "none",
};

function testModeBannerStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.8rem 1rem",
    borderRadius: "10px",
    border: `2px solid ${active ? "#f59e0b" : pageColorTokens.border}`,
    background: active
      ? "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)"
      : "linear-gradient(135deg, #f5f6f8 0%, #eef0f6 100%)",
    cursor: "pointer",
    boxShadow: active ? "0 2px 10px rgba(245, 158, 11, 0.2)" : "none",
    transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
  };
}

const testModePillStyle: React.CSSProperties = {
  padding: "0.12rem 0.5rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  fontWeight: 800,
  letterSpacing: "0.06em",
  color: "#92400e",
  background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
  border: "1px solid rgba(245, 158, 11, 0.5)",
  boxShadow: "0 1px 4px rgba(245, 158, 11, 0.25)",
};

const failErrorStyle: React.CSSProperties = {
  padding: "0.45rem 0.7rem",
  borderRadius: "9px",
  background: "linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.05) 100%)",
  border: "1px solid rgba(220,38,38,0.2)",
  color: "#991b1b",
  fontSize: "0.75rem",
  lineHeight: 1.45,
  wordBreak: "break-word",
};
