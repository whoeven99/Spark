import { useCallback, useEffect, useRef, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import type { loader } from "../app.translation-v4";
import type { TranslationV4Job, TranslationV4Status } from "../../server/translation/v4/types";
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
];

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
    currentModule: string | null;
  };
};

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

  const shopName = loaderData.shop;
  const query = typeof window !== "undefined" ? window.location.search : "";

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
            `/api/translate/v4/task-progress${query}&taskId=${taskId}&shopName=${shopName}`,
          );
          if (!res.ok) return;
          const payload = (await res.json()) as { ok: boolean } & ProgressData;
          if (!payload.ok) return;
          setProgressMap((prev) => ({ ...prev, [taskId]: payload }));
          // Update job status in list
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
      const listRes = await fetch(`/api/translate/v4/tasks${query}&shopName=${shopName}`);
      const listPayload = (await listRes.json()) as { ok: boolean; jobs?: TranslationV4Job[] };
      if (listPayload.ok && listPayload.jobs) setJobs(listPayload.jobs);
    } catch {
      setFormError("请求失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (taskId: string, action: "cancel" | "pause" | "resume") => {
    try {
      await fetch(`/api/translate/v4/task-action${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, shopName, action }),
      });
      const listRes = await fetch(`/api/translate/v4/tasks${query}&shopName=${shopName}`);
      const listPayload = (await listRes.json()) as { ok: boolean; jobs?: TranslationV4Job[] };
      if (listPayload.ok && listPayload.jobs) setJobs(listPayload.jobs);
    } catch {
      shopify.toast.show("操作失败");
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
                const status = (progress?.status ?? job.status) as TranslationV4Status;
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
  onAction: (taskId: string, action: "cancel" | "pause" | "resume") => Promise<void>;
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
        <StageBar label="初始化" done={metrics.initDone} total={metrics.initTotal} active={status === "INITIALIZING"} complete={["INIT_DONE","TRANSLATE_QUEUED","TRANSLATING","TRANSLATE_DONE","WRITEBACK_QUEUED","WRITING_BACK","COMPLETED"].includes(status)} />
        <StageBar label="翻译" done={metrics.translateDone} total={metrics.translateTotal} active={status === "TRANSLATING"} complete={["TRANSLATE_DONE","WRITEBACK_QUEUED","WRITING_BACK","COMPLETED"].includes(status)} failed={metrics.translateFailed} />
        <StageBar label="回写" done={metrics.writebackDone} total={metrics.writebackTotal} active={status === "WRITING_BACK"} complete={status === "COMPLETED"} failed={metrics.writebackFailed} />
      </div>

      {metrics.currentModule && isActive && (
        <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: "0.35rem" }}>
          当前模块: {metrics.currentModule}
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
  const barColor = complete
    ? pageColorTokens.brandGreen
    : active
    ? pageColorTokens.brandBlue
    : pageColorTokens.border;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, width: 42, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: pageColorTokens.progressTrackGradient, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, minWidth: 80, flexShrink: 0, textAlign: "right" }}>
        {total > 0 ? `${done}/${total}` : "等待"} {complete ? "✓" : active ? "⟳" : ""}
        {failed > 0 ? ` ⚠${failed}` : ""}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: TranslationV4Status }) {
  const config = STATUS_DISPLAY[status] ?? { label: status, color: "#6d7175", bg: "#f1f2f3" };
  return (
    <span style={{
      padding: "0.15rem 0.55rem",
      borderRadius: 999,
      fontSize: "0.75rem",
      fontWeight: 600,
      color: config.color,
      background: config.bg,
    }}>
      {config.label}
    </span>
  );
}

const STATUS_DISPLAY: Partial<Record<TranslationV4Status, { label: string; color: string; bg: string }>> = {
  CREATED:         { label: "已创建",   color: "#6d7175", bg: "#f1f2f3" },
  INIT_QUEUED:     { label: "等待初始化", color: "#2c6ecb", bg: "#e8f0fb" },
  INITIALIZING:    { label: "初始化中",  color: "#2c6ecb", bg: "#e8f0fb" },
  INIT_DONE:       { label: "初始化完成", color: "#008060", bg: "#f1f8f5" },
  TRANSLATE_QUEUED:{ label: "等待翻译",  color: "#2c6ecb", bg: "#e8f0fb" },
  TRANSLATING:     { label: "翻译中",    color: "#2c6ecb", bg: "#e8f0fb" },
  TRANSLATE_DONE:  { label: "翻译完成",  color: "#008060", bg: "#f1f8f5" },
  WRITEBACK_QUEUED:{ label: "等待回写",  color: "#2c6ecb", bg: "#e8f0fb" },
  WRITING_BACK:    { label: "回写中",    color: "#2c6ecb", bg: "#e8f0fb" },
  COMPLETED:       { label: "已完成",    color: "#006e52", bg: "#f1f8f5" },
  FAILED:          { label: "失败",      color: "#bf0711", bg: "rgba(216,44,13,0.08)" },
  PAUSED:          { label: "已暂停",    color: "#b54708", bg: "#fff4e5" },
  CANCELLED:       { label: "已取消",    color: "#6d7175", bg: "#f1f2f3" },
};

function jobCardStyle(status: TranslationV4Status): React.CSSProperties {
  const isActive = ACTIVE_STATUSES.includes(status);
  return {
    padding: "1rem",
    border: `1px solid ${isActive ? pageColorTokens.brandBlue : pageColorTokens.border}`,
    borderRadius: pageColorTokens.radiusControl,
    background: pageColorTokens.surface,
    boxShadow: isActive ? `0 0 0 1px ${pageColorTokens.brandBlue}22` : "none",
    transition: "border-color 0.2s",
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
    padding: "0.75rem 1rem",
    borderRadius: pageColorTokens.radiusControl,
    border: `2px solid ${active ? "#f0b429" : pageColorTokens.border}`,
    background: active ? "#fffbeb" : pageColorTokens.surfaceMuted,
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
  };
}

const testModePillStyle: React.CSSProperties = {
  padding: "0.1rem 0.4rem",
  borderRadius: 4,
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "#b54708",
  background: "#fff4e5",
  border: "1px solid #f0b429",
};

const failErrorStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderRadius: pageColorTokens.radiusControl,
  background: pageColorTokens.criticalBg,
  color: pageColorTokens.criticalText,
  fontSize: "0.75rem",
  lineHeight: 1.45,
  wordBreak: "break-word",
};
