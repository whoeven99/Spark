import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useLocation } from "react-router";
import { createTranslationV4Tasks } from "../../lib/createTranslationV4Tasks";
import { dedupeTranslationV4JobsByLocalePair } from "../../lib/dedupeTranslationV4JobsByLocalePair";
import {
  formatCreateTasksToast,
  resolveValidationErrorMessage,
} from "../../lib/translationCreateFeedback";
import type { loader } from "../app.translation-v4";
import {
  TERMINAL_V4_STATUSES,
  type TranslationV4Job,
  type TranslationV4Status,
} from "../../server/translation/v4/types";
import { useShopLocales } from "../../hooks/useShopLocales";
import { DialogShell } from "../component/shared/DialogShell";
import { SegmentedPageTabs } from "../component/shared/SegmentedPageTabs";
import {
  AITaskCardShell,
  type CardAction,
} from "../component/aiTask/AITaskCardShell";
import { TranslationLocaleFields } from "../component/translation/TranslationLocaleFields";
import { TranslationModuleMultiSelect } from "../component/translation/TranslationModuleMultiSelect";
import type { AITaskItem, AITaskStatus } from "../../lib/aiTaskTypes";
import {
  PageBackButton,
  PageSectionHeader,
  PageSurface,
  pageColorTokens,
  pageContentStyle,
  pageInnerPanelStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  stickyAsideColumnStyle,
  formErrorBoxStyle,
  pageEmptyStateStyle,
} from "./pageUiStyles";

const POLL_INTERVAL = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;
type PageTab = "config" | "tasks";
type TaskViewTab = "current" | "history";
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
      translateUnitTotal: job.metrics.translateUnitTotal ?? 0,
      translateUnitDone: job.metrics.translateUnitDone ?? 0,
      writebackTotal: job.metrics.writebackTotal,
      writebackDone: job.metrics.writebackDone,
      writebackFailed: job.metrics.writebackFailed,
      verifyTotal: job.metrics.verifyTotal,
      verifyDone: job.metrics.verifyDone,
      verifyFailed: job.metrics.verifyFailed,
      currentModule: null,
      usedTokens: job.metrics.usedTokens ?? 0,
      translateStartedAt: null,
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
    translateUnitTotal: number; translateUnitDone: number;
    writebackTotal: number; writebackDone: number; writebackFailed: number;
    verifyTotal: number; verifyDone: number; verifyFailed: number;
    currentModule: string | null;
    usedTokens?: number;
    translateStartedAt?: string | null;
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

function readPageTabFromSearch(search: string): PageTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("page") === "tasks" ? "tasks" : "config";
}

function readTaskViewFromSearch(search: string): TaskViewTab {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("taskView") === "history" ? "history" : "current";
}

function syncTranslationSearch(pageTab: PageTab, taskView: TaskViewTab) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (pageTab === "tasks") {
    url.searchParams.set("page", "tasks");
    url.searchParams.set("taskView", taskView);
  } else {
    url.searchParams.delete("page");
    url.searchParams.delete("taskView");
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function buildApiSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("page");
  params.delete("taskView");
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function withExtraParams(search: string, paramsObject: Record<string, string>): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [key, value] of Object.entries(paramsObject)) {
    params.set(key, value);
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function isCurrentJob(job: TranslationV4Job): boolean {
  return new Date(job.createdAt).getTime() >= Date.now() - DAY_MS;
}

export function TranslationV4Page() {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const loaderData = useLoaderData<typeof loader>();

  const initialSearch =
    typeof window !== "undefined" ? window.location.search : location.search;
  const [pageTab, setPageTab] = useState<PageTab>(() => readPageTabFromSearch(initialSearch));
  const [taskView, setTaskView] = useState<TaskViewTab>(() => readTaskViewFromSearch(initialSearch));
  const query = buildApiSearch(initialSearch);
  const {
    sourceLocale,
    sourceLabel,
    targetLocales,
    setTargetLocales,
    targetOptions,
    loading: localesLoading,
    isFallback: localesIsFallback,
  } = useShopLocales({
    locationSearch: query,
    initialShopLocales: loaderData.shopLocales,
    selectionMode: "multiple",
  });

  const [modules, setModules] = useState<string[]>(["PRODUCT", "COLLECTION", "PAGE", "ARTICLE"]);
  const [limitPerType, setLimitPerType] = useState(20);
  const [isCover, setIsCover] = useState(false);
  const [isHandle, setIsHandle] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [jobs, setJobs] = useState<TranslationV4Job[]>(loaderData.jobs as TranslationV4Job[]);
  const displayJobs = useMemo(
    () => dedupeTranslationV4JobsByLocalePair(jobs),
    [jobs],
  );
  const [progressMap, setProgressMap] = useState<Record<string, ProgressData>>({});
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const optimisticActionRef = useRef<Map<string, OptimisticActionIntent>>(new Map());

  const shopName = loaderData.shop;
  const currentJobs = useMemo(
    () => displayJobs.filter((job) => isCurrentJob(job)),
    [displayJobs],
  );
  const historyJobs = useMemo(
    () => displayJobs.filter((job) => !isCurrentJob(job)),
    [displayJobs],
  );
  const visibleJobs = taskView === "current" ? currentJobs : historyJobs;
  const runningCount = useMemo(
    () => displayJobs.filter((job) => ACTIVE_STATUSES.includes(job.status)).length,
    [displayJobs],
  );
  const completedCount = useMemo(
    () => currentJobs.filter((job) => job.status === "COMPLETED").length,
    [currentJobs],
  );
  const attentionCount = useMemo(
    () => displayJobs.filter((job) => job.status === "FAILED" || job.status === "PAUSED").length,
    [displayJobs],
  );

  const refreshJobList = useCallback(async () => {
    const listRes = await fetch(`/api/translate/v4/tasks${withExtraParams(query, { shopName })}`);
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
          const res = await fetch(`/api/translate/v4/task-progress${withExtraParams(query, { taskId, shopName })}`);
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

  useEffect(() => {
    syncTranslationSearch(pageTab, taskView);
  }, [pageTab, taskView]);

  useEffect(() => {
    setPageTab(readPageTabFromSearch(location.search));
    setTaskView(readTaskViewFromSearch(location.search));
  }, [location.search]);

  const validateCreateDraft = () => {
    setFormError(null);
    const source = sourceLocale.trim();
    if (!source) {
      setFormError("源语言加载中，请稍候");
      return false;
    }
    if (!targetLocales.length) {
      setFormError(resolveValidationErrorMessage("validationTargetRequired", t));
      return false;
    }
    if (!modules.length) {
      setFormError("至少选择一个模块");
      return false;
    }
    return true;
  };

  const handleOpenConfirm = () => {
    if (!validateCreateDraft()) return;
    setConfirmOpen(true);
  };

  const handleCreateJob = async () => {
    setConfirmOpen(false);
    setIsSubmitting(true);
    try {
      const source = sourceLocale.trim();
      const result = await createTranslationV4Tasks({
        search: query,
        source,
        targets: targetLocales,
        modules,
        limitPerType,
        isCover,
        isHandle,
        testMode,
        targetOptions,
      });

      if (result.validationError) {
        setFormError(resolveValidationErrorMessage(result.validationError, t));
        return;
      }

      const toast = formatCreateTasksToast(result, t);
      if (toast) {
        shopify.toast.show(toast);
      }

      if (result.failed.length) {
        const detail = result.failed.map((f) => `${f.target}: ${f.error}`).join("; ");
        setFormError(detail);
      }

      if (result.created.length) {
        await refreshJobList();
        setTaskView("current");
        setPageTab("tasks");
      } else if (!result.failed.length && !result.validationError) {
        setFormError("创建失败");
      }
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
      <div style={pageContentStyle}>
        <PageBackButton
          workspaceOnly
          label={t("common.backToPrevious", {
            defaultValue: i18n.language.toLowerCase().startsWith("zh") ? "返回上一页" : "Back",
          })}
        />
        <PageSectionHeader
          title="翻译 v4"
          subtitle="面向批量资源的翻译工具。创建任务后会在后台持续执行，并在任务页中以汇总方式展示阶段进度和结果。"
        />

        <SegmentedPageTabs
          activeTab={pageTab}
          onTabChange={setPageTab}
          ariaLabel="翻译页模式切换"
          items={[
            { key: "config", label: "配置页" },
            { key: "tasks", label: "任务页", badgeCount: runningCount },
          ]}
        />

        {pageTab === "config" ? (
          <div style={twoColumnLayoutStyle}>
            <div style={twoColumnMainStyle}>
              <PageSurface
                title="创建翻译任务"
                subtitle="配置目标语言、翻译模块和执行范围后，再确认创建批处理任务。"
              >
                <s-stack direction="block" gap="base">
                  <TranslationLocaleFields
                    sourceLocale={sourceLocale}
                    sourceLabel={sourceLabel}
                    selectionMode="multiple"
                    targetLocales={targetLocales}
                    onTargetLocalesChange={setTargetLocales}
                    targetOptions={targetOptions}
                    loading={localesLoading}
                    disabled={isSubmitting}
                    localesIsFallback={localesIsFallback}
                    targetFieldId="translation-v4-target-locale"
                  />
                  <TranslationModuleMultiSelect
                    id="translation-v4-modules"
                    values={modules}
                    onChange={setModules}
                    disabled={isSubmitting}
                  />

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

                  <div style={testEnvPanelStyle(testMode)}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textBody }}>
                      测试环境选项
                    </div>
                    <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2, marginBottom: "0.75rem" }}>
                      仅用于联调或流程验证，不影响正式批处理逻辑。
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={testMode}
                          onChange={(e) => setTestMode(e.target.checked)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem", color: pageColorTokens.textBody }}>
                            测试模式{testMode ? "（已开启）" : ""}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: 2 }}>
                            翻译阶段直接使用原值作为译文，跳过 LLM 调用，适合验证任务流转。
                          </div>
                        </div>
                      </label>
                      <div style={{ maxWidth: "20rem" }}>
                        <s-text-field
                          label="每模块数量限制"
                          value={String(limitPerType)}
                          onChange={(e) => {
                            const v = parseInt(e.currentTarget.value, 10);
                            setLimitPerType(isNaN(v) || v < 0 ? 20 : v);
                          }}
                          autocomplete="off"
                        />
                      </div>
                    </div>
                  </div>

                  {formError ? <div style={formErrorBoxStyle}>{formError}</div> : null}

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>
                      创建后会按目标语言拆分为独立后台任务，并自动执行初始化、翻译、回写与验证。
                    </div>
                    <s-button
                      type="button"
                      variant="primary"
                      onClick={handleOpenConfirm}
                      {...(isSubmitting ? { disabled: true } : {})}
                    >
                      {isSubmitting ? "创建中..." : "确认并创建任务"}
                    </s-button>
                  </div>
                </s-stack>
              </PageSurface>
            </div>

            <div style={stickyAsideColumnStyle}>
              <PageSurface
                title="流程说明"
                subtitle="翻译任务是批量后台作业，结果会在任务页中以汇总方式展示。"
              >
                <div style={{ ...pageInnerPanelStyle, display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    ["① 初始化", "从 Shopify 拉取待翻译资源并准备执行上下文。"],
                    ["② 翻译", "按模块与目标语言批量生成译文。"],
                    ["③ 回写", "将翻译结果写回 Shopify 对应资源。"],
                    ["④ 验证", "对异常写入做补偿重试，提升批处理完整性。"],
                  ].map(([step, desc]) => (
                    <div key={step} style={{ display: "flex", gap: "0.65rem" }}>
                      <span style={{ fontWeight: 600, color: pageColorTokens.textBody, whiteSpace: "nowrap" }}>{step}</span>
                      <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>{desc}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, lineHeight: 1.6 }}>
                  由于任务往往涉及大量资源，这里不进入逐条详情审核，而是以任务卡展示阶段进度、失败数和批量结果汇总。
                </div>
              </PageSurface>
            </div>
          </div>
        ) : (
          <PageSurface
            title="翻译任务"
            subtitle="查看最近任务与历史记录，并直接在列表中处理暂停、重试或取消。"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SegmentedPageTabs
                activeTab={taskView}
                onTabChange={setTaskView}
                ariaLabel="翻译任务视图切换"
                items={[
                  { key: "current", label: "当前任务", badgeCount: currentJobs.length },
                  { key: "history", label: "历史任务", badgeCount: historyJobs.length },
                ]}
              />

              <div style={taskSummaryGridStyle}>
                <TaskSummaryItem label="当前任务" value={currentJobs.length} />
                <TaskSummaryItem label="运行中" value={runningCount} tone="progress" />
                <TaskSummaryItem label="已完成" value={completedCount} tone="success" />
                <TaskSummaryItem label="需处理" value={attentionCount} tone="warning" />
              </div>

              <div style={taskHintBarStyle}>
                {taskView === "current"
                  ? "当前任务包含最近 24 小时内的运行中、已完成、失败或暂停任务。"
                  : "历史任务指创建时间超过 24 小时的记录，仅保留列表汇总信息。"}
              </div>

              {visibleJobs.length === 0 ? (
                <div style={pageEmptyStateStyle}>
                  {taskView === "current" ? "暂无当前翻译任务，先从配置页创建一个。" : "暂无历史任务记录。"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {visibleJobs
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((job) => {
                      const progress = progressMap[job.id];
                      const status = resolveDisplayStatus(job, progress);
                      return (
                        <JobCard
                          key={job.id}
                          job={job}
                          status={status}
                          progress={progress ?? null}
                          locationSearch={location.search}
                          onAction={handleAction}
                        />
                      );
                    })}
                </div>
              )}
            </div>
          </PageSurface>
        )}
      </div>

      <DialogShell
        open={confirmOpen}
        onClose={() => {
          if (!isSubmitting) setConfirmOpen(false);
        }}
        closeDisabled={isSubmitting}
        width={560}
        title="确认创建翻译任务"
        description="系统会按目标语言拆分批处理任务，并在后台自动执行翻译、回写与验证。"
        footer={
          <div style={confirmFooterStyle}>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={isSubmitting}
              style={dialogButtonStyle("secondary", isSubmitting)}
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleCreateJob()}
              disabled={isSubmitting}
              style={dialogButtonStyle("primary", isSubmitting)}
            >
              {isSubmitting ? "创建中..." : "确认创建"}
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <ConfirmSummaryRow label="任务目标" value="批量翻译 Shopify 资源" />
          <ConfirmSummaryRow label="目标语言数" value={`${targetLocales.length} 个`} />
          <ConfirmSummaryRow label="模块范围" value={modules.join("、")} />
          <ConfirmSummaryRow
            label="影响范围"
            value={`${modules.length} 个模块 · 每模块最多 ${limitPerType} 条`}
          />
          <ConfirmSummaryRow
            label="执行选项"
            value={[
              isCover ? "覆盖已有翻译" : "保留已有翻译",
              isHandle ? "翻译 Handle/Slug" : "不翻译 Handle/Slug",
              testMode ? "测试模式" : "正式模式",
            ].join(" · ")}
          />
        </div>
      </DialogShell>
    </s-page>
  );
}

type JobCardProps = {
  job: TranslationV4Job;
  status: TranslationV4Status;
  progress: ProgressData | null;
  locationSearch: string;
  onAction: (taskId: string, action: "cancel" | "pause" | "resume") => void | Promise<void>;
};

function mapV4StatusToTaskStatus(status: TranslationV4Status): AITaskStatus {
  if (ACTIVE_STATUSES.includes(status) || status === "CREATED") return "running";
  if (status === "COMPLETED") return "succeeded";
  if (status === "FAILED") return "failed";
  if (status === "CANCELLED") return "cancelled";
  return "pending_review";
}

function stageLabel(stage: string | null): string {
  switch (stage) {
    case "INIT":
      return "初始化";
    case "TRANSLATE":
      return "翻译";
    case "WRITEBACK":
      return "回写";
    case "VERIFY":
      return "验证";
    default:
      return "执行";
  }
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function getStageRatio(
  done: number,
  total: number,
  complete: boolean,
  queuedOrActive: boolean,
): number {
  if (total > 0) return Math.max(0, Math.min(1, done / total));
  if (complete) return 1;
  if (queuedOrActive) return 0.08;
  return 0;
}

function getJobProgressPercent(status: TranslationV4Status, metrics: ProgressData["metrics"]) {
  if (status === "COMPLETED") return 100;
  if (status === "CANCELLED") return 0;

  const initRatio = getStageRatio(
    metrics.initDone,
    metrics.initTotal,
    ["INIT_DONE", "TRANSLATE_QUEUED", "TRANSLATING", "TRANSLATE_DONE", "WRITEBACK_QUEUED", "WRITING_BACK", "VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status),
    ["INIT_QUEUED", "INITIALIZING"].includes(status),
  );
  const translateRatio = getStageRatio(
    metrics.translateUnitTotal > 0 ? metrics.translateUnitDone : metrics.translateDone,
    metrics.translateUnitTotal > 0 ? metrics.translateUnitTotal : metrics.translateTotal,
    ["TRANSLATE_DONE", "WRITEBACK_QUEUED", "WRITING_BACK", "VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status),
    ["TRANSLATE_QUEUED", "TRANSLATING"].includes(status),
  );
  const writebackRatio = getStageRatio(
    metrics.writebackDone,
    metrics.writebackTotal,
    ["VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status),
    ["WRITEBACK_QUEUED", "WRITING_BACK"].includes(status),
  );
  const includeVerify = metrics.verifyTotal > 0 || ["VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status);
  const verifyRatio = includeVerify
    ? getStageRatio(
        metrics.verifyDone,
        metrics.verifyTotal,
        status === "COMPLETED" && metrics.verifyTotal > 0,
        ["VERIFY_QUEUED", "VERIFYING"].includes(status),
      )
    : 0;

  const weighted = includeVerify
    ? (initRatio + translateRatio + writebackRatio + verifyRatio) / 4
    : (initRatio + translateRatio + writebackRatio) / 3;
  const percent = Math.round(weighted * 100);

  if (status === "FAILED" || status === "PAUSED") {
    return Math.max(percent, 8);
  }
  return percent;
}

function getProgressTone(status: TranslationV4Status): { background: string; text: string } {
  if (status === "COMPLETED") {
    return { background: pageColorTokens.brandGreen, text: pageColorTokens.brandGreenDark };
  }
  if (status === "FAILED") {
    return { background: "#d82c0d", text: pageColorTokens.criticalText };
  }
  if (status === "PAUSED") {
    return { background: "#b98900", text: "#8a6200" };
  }
  if (status === "CANCELLED") {
    return { background: "#9ca3af", text: pageColorTokens.textSecondary };
  }
  return { background: "#c05717", text: "#8a420f" };
}

function buildJobActions(
  job: TranslationV4Job,
  status: TranslationV4Status,
  onAction: JobCardProps["onAction"],
): CardAction[] {
  const actions: CardAction[] = [];

  if (ACTIVE_STATUSES.includes(status)) {
    actions.push({
      label: "暂停",
      tone: "secondary",
      onClick: () => void onAction(job.id, "pause"),
    });
  }

  if (status === "PAUSED" || status === "FAILED") {
    actions.push({
      label: "继续执行",
      tone: "primary",
      onClick: () => void onAction(job.id, "resume"),
    });
  }

  if (status !== "COMPLETED" && status !== "CANCELLED") {
    actions.push({
      label: "取消",
      tone: "subtle",
      onClick: () => void onAction(job.id, "cancel"),
    });
  }

  return actions;
}

function getPrimaryCopy(
  status: TranslationV4Status,
  metrics: ProgressData["metrics"],
  errorStageValue: string | null,
): string {
  switch (status) {
    case "CREATED":
    case "INIT_QUEUED":
      return "任务已创建，等待进入初始化队列";
    case "INITIALIZING":
      return `正在初始化资源 ${metrics.initDone}/${metrics.initTotal || "?"}`;
    case "INIT_DONE":
    case "TRANSLATE_QUEUED":
      return "初始化完成，等待开始翻译";
    case "TRANSLATING":
      if (metrics.translateUnitTotal > 0) {
        return `正在翻译内容节点 ${metrics.translateUnitDone}/${metrics.translateUnitTotal}`;
      }
      return `正在翻译资源 ${metrics.translateDone}/${metrics.translateTotal || "?"}`;
    case "TRANSLATE_DONE":
    case "WRITEBACK_QUEUED":
      return "翻译完成，等待回写到 Shopify";
    case "WRITING_BACK":
      return `正在回写资源 ${metrics.writebackDone}/${metrics.writebackTotal || "?"}`;
    case "VERIFY_QUEUED":
      return "回写完成，等待进入验证";
    case "VERIFYING":
      return `正在验证结果 ${metrics.verifyDone}/${metrics.verifyTotal || "?"}`;
    case "COMPLETED":
      return "批量翻译已完成";
    case "FAILED":
      return `任务执行失败，停留在${stageLabel(errorStageValue)}`;
    case "PAUSED":
      return `任务已暂停，当前停留在${stageLabel(errorStageValue)}`;
    case "CANCELLED":
      return "任务已取消";
    default:
      return "任务状态已更新";
  }
}

function getSecondaryCopy(
  job: TranslationV4Job,
  status: TranslationV4Status,
  metrics: ProgressData["metrics"],
  updatedAt: string,
): string {
  const updatedLabel = formatDateTime(updatedAt);
  const resourcePart = `资源 ${metrics.translateDone}/${metrics.translateTotal}`;
  const nodePart =
    metrics.translateUnitTotal > 0
      ? `节点 ${metrics.translateUnitDone}/${metrics.translateUnitTotal}`
      : null;
  const failedPart =
    metrics.translateFailed + metrics.writebackFailed + metrics.verifyFailed > 0
      ? `失败 ${metrics.translateFailed + metrics.writebackFailed + metrics.verifyFailed}`
      : null;
  const tokenPart = metrics.usedTokens > 0 ? `${metrics.usedTokens.toLocaleString()} tokens` : null;

  if (status === "COMPLETED") {
    return [
      `已完成 ${metrics.translateDone} 个资源`,
      metrics.verifyTotal > 0 ? `验证 ${metrics.verifyDone}/${metrics.verifyTotal}` : null,
      tokenPart,
      updatedLabel ? `更新于 ${updatedLabel}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (status === "FAILED" || status === "PAUSED") {
    return [
      `阶段 ${stageLabel(job.errorStage)}`,
      failedPart ?? "暂无失败统计",
      updatedLabel ? `更新于 ${updatedLabel}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (status === "CANCELLED") {
    return [resourcePart, tokenPart, updatedLabel ? `更新于 ${updatedLabel}` : null]
      .filter(Boolean)
      .join(" · ");
  }

  return [resourcePart, nodePart, failedPart, tokenPart, updatedLabel ? `更新于 ${updatedLabel}` : null]
    .filter(Boolean)
    .join(" · ");
}

function JobMetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={jobMetaItemStyle}>
      <div style={jobMetaLabelStyle}>{label}</div>
      <div style={jobMetaValueStyle}>{value}</div>
    </div>
  );
}

function JobCard({ job, status, progress, locationSearch, onAction }: JobCardProps) {
  const metrics = progress?.metrics ?? job.metrics;
  const taskStatus = mapV4StatusToTaskStatus(status);
  const progressTone = getProgressTone(status);
  const progressPercent = getJobProgressPercent(status, metrics);
  const translationTask: AITaskItem = {
    id: job.id,
    batchId: job.id,
    shop: job.shopName,
    taskType: "product_improve",
    status: taskStatus,
    config: {},
    result: null,
    estimatedCredits: null,
    actualCredits: metrics.usedTokens ?? null,
    startedAt: job.claimedAt ?? job.createdAt,
    completedAt:
      status === "COMPLETED" || status === "FAILED" || status === "CANCELLED"
        ? job.updatedAt
        : null,
    errorMsg: progress?.errorMessage ?? job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
  const actions = buildJobActions(job, status, onAction);
  const testMode = progress?.testMode ?? job.testMode;
  const showVerify = metrics.verifyTotal > 0 || ["VERIFY_QUEUED", "VERIFYING"].includes(status);
  const primaryCopy = getPrimaryCopy(status, metrics, progress?.errorStage ?? job.errorStage);
  const secondaryCopy = getSecondaryCopy(job, status, metrics, progress?.updatedAt ?? job.updatedAt);

  return (
    <AITaskCardShell
      task={translationTask}
      locationSearch={locationSearch}
      status={taskStatus}
      statusBadge={<StatusBadge status={status} />}
      title={`任务目标：${job.source} -> ${job.target}`}
      metaLine={
        <>
          <span>{job.modules.length} 个模块</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>每模块最多 {job.limitPerType} 条</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{job.isCover ? "覆盖已有翻译" : "保留已有翻译"}</span>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>{job.isHandle ? "翻译 Handle/Slug" : "不翻译 Handle/Slug"}</span>
        </>
      }
      extraBadges={
        testMode ? <span style={testModePillStyle}>测试模式</span> : null
      }
      primaryCopy={primaryCopy}
      primaryCopyColor={progressTone.text}
      secondaryCopy={secondaryCopy}
      progressPercent={progressPercent}
      progressBackground={progressTone.background}
      bodyContent={
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={jobMetaGridStyle}>
            <JobMetaItem label="模块范围" value={job.modules.join("、")} />
            <JobMetaItem label="资源进度" value={`${metrics.translateDone}/${metrics.translateTotal}`} />
            {metrics.translateUnitTotal > 0 ? (
              <JobMetaItem
                label="节点进度"
                value={
                  <>
                    <AnimatedNumber value={metrics.translateUnitDone} />/{metrics.translateUnitTotal}
                  </>
                }
              />
            ) : null}
            <JobMetaItem
              label="模型"
              value={job.aiModelUsed ?? job.aiModel}
            />
            <JobMetaItem
              label="用量"
              value={metrics.usedTokens > 0 ? `${metrics.usedTokens.toLocaleString()} tokens` : "暂未产生"}
            />
            <JobMetaItem
              label="失败统计"
              value={`${metrics.translateFailed + metrics.writebackFailed + metrics.verifyFailed} 条`}
            />
          </div>

          <div style={jobStageGroupStyle}>
            <StageBar
              label="初始化"
              done={metrics.initDone}
              total={metrics.initTotal}
              active={status === "INITIALIZING"}
              complete={["INIT_DONE", "TRANSLATE_QUEUED", "TRANSLATING", "TRANSLATE_DONE", "WRITEBACK_QUEUED", "WRITING_BACK", "VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status)}
            />
            <StageBar
              label="翻译"
              done={metrics.translateUnitTotal > 0 ? metrics.translateUnitDone : metrics.translateDone}
              total={metrics.translateUnitTotal > 0 ? metrics.translateUnitTotal : metrics.translateTotal}
              active={status === "TRANSLATING"}
              complete={["TRANSLATE_DONE", "WRITEBACK_QUEUED", "WRITING_BACK", "VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status)}
              failed={metrics.translateFailed}
              detailLabel={
                metrics.translateUnitTotal > 0 ? (
                  <>
                    资源 {metrics.translateDone}/{metrics.translateTotal} · 节点{" "}
                    <AnimatedNumber value={metrics.translateUnitDone} />/{metrics.translateUnitTotal}
                  </>
                ) : undefined
              }
            />
            <StageBar
              label="回写"
              done={metrics.writebackDone}
              total={metrics.writebackTotal}
              active={status === "WRITING_BACK"}
              complete={["VERIFY_QUEUED", "VERIFYING", "COMPLETED"].includes(status)}
              failed={metrics.writebackFailed}
            />
            {showVerify ? (
              <StageBar
                label="验证"
                done={metrics.verifyDone}
                total={metrics.verifyTotal}
                active={status === "VERIFYING"}
                complete={status === "COMPLETED" && metrics.verifyTotal > 0}
                failed={metrics.verifyFailed}
              />
            ) : null}
          </div>

          {metrics.currentModule && ACTIVE_STATUSES.includes(status) ? (
            <div style={jobInlineNoticeStyle}>
              当前模块：{metrics.currentModule}
            </div>
          ) : null}

          {status === "TRANSLATING" ? <TranslateStatsPanel metrics={metrics} /> : null}

          {(status === "FAILED" || status === "PAUSED") && (progress?.errorMessage ?? job.errorMessage) ? (
            <div style={failErrorStyle}>
              [{progress?.errorStage ?? job.errorStage}] {progress?.errorMessage ?? job.errorMessage}
            </div>
          ) : null}
        </div>
      }
      actions={actions}
    />
  );
}

function ConfirmSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={confirmRowStyle}>
      <div style={confirmLabelStyle}>{label}</div>
      <div style={confirmValueStyle}>{value}</div>
    </div>
  );
}

function TaskSummaryItem(props: {
  label: string;
  value: number;
  tone?: "default" | "progress" | "success" | "warning";
}) {
  const tone = props.tone ?? "default";
  const color =
    tone === "progress"
      ? "#c05717"
      : tone === "success"
        ? pageColorTokens.brandGreenDark
        : tone === "warning"
          ? "#8a6200"
          : pageColorTokens.textPrimary;

  return (
    <div style={taskSummaryItemStyle}>
      <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary }}>{props.label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color, marginTop: 6 }}>{props.value}</div>
    </div>
  );
}

// ─── Translate Stats Panel ────────────────────────────────────────────────────

type TranslateMetricsSnap = {
  translateUnitDone: number;
  translateUnitTotal: number;
  usedTokens?: number;
  translateStartedAt?: string | null;
};

function fmtDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "7rem" }}>
      <span style={{ fontSize: "0.68rem", color: pageColorTokens.textSecondary, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: pageColorTokens.textPrimary, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function TranslateStatsPanel({ metrics }: { metrics: TranslateMetricsSnap }) {
  const [now, setNow] = useState(() => Date.now());

  // Tick every second while panel is mounted.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { translateUnitDone: done, translateUnitTotal: total, usedTokens = 0, translateStartedAt } = metrics;
  const startMs = translateStartedAt ? Number(translateStartedAt) : null;
  const elapsedMs = startMs && startMs > 0 ? Math.max(0, now - startMs) : null;

  // Linear extrapolation from current progress ratio.
  const ratio = total > 0 && done > 0 ? done / total : 0;
  const estRemainingMs = elapsedMs !== null && ratio > 0 ? (elapsedMs / ratio) * (1 - ratio) : null;
  const estRemainingTokens = ratio > 0 && usedTokens > 0 ? Math.round((usedTokens / ratio) * (1 - ratio)) : null;

  if (elapsedMs === null && usedTokens === 0) return null;

  return (
    <div
      style={{
        padding: "0.75rem 0.85rem",
        borderRadius: "10px",
        background: pageColorTokens.surfaceSubtle,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem 1.25rem",
      }}
    >
      {usedTokens > 0 && (
        <StatItem label="已用 tokens" value={usedTokens.toLocaleString()} />
      )}
      {elapsedMs !== null && (
        <StatItem label="已用时间" value={fmtDuration(elapsedMs)} />
      )}
      {estRemainingTokens !== null && (
        <StatItem label="预估剩余 tokens" value={`~${estRemainingTokens.toLocaleString()}`} />
      )}
      {estRemainingMs !== null && (
        <StatItem label="预估剩余时间" value={`~${fmtDuration(estRemainingMs)}`} />
      )}
    </div>
  );
}

/**
 * Animates a number toward `value` over ~1s (easeOutCubic) so polled jumps tick
 * up smoothly instead of snapping. Pure client-side tween between poll values.
 */
function AnimatedNumber({ value, duration = 1100 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}</>;
}

type StageBarProps = {
  label: string;
  done: number;
  total: number;
  active: boolean;
  complete: boolean;
  failed?: number;
  /** Overrides the "done/total" number text (e.g. to show both resources and nodes). */
  detailLabel?: ReactNode;
};

function StageBar({ label, done, total, active, complete, failed = 0, detailLabel }: StageBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (complete ? 100 : 0);

  const fillBg = complete
    ? pageColorTokens.brandGreen
    : active
      ? "#c05717"
      : pageColorTokens.borderInput;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
      <span
        style={{
          fontSize: "0.75rem",
          color: pageColorTokens.textSecondary,
          width: 46,
          flexShrink: 0,
          fontWeight: active || complete ? 600 : 500,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 999,
          background: pageColorTokens.divider,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: fillBg,
            borderRadius: 999,
            transition: "width 0.35s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: "0.75rem",
          color: pageColorTokens.textSecondary,
          minWidth: detailLabel ? 196 : 84,
          flexShrink: 0,
          textAlign: "right",
        }}
      >
        {detailLabel ?? (total > 0 ? `${done}/${total}` : "等待")}
        {" "}
        {complete ? <span style={{ color: pageColorTokens.brandGreenDark, fontWeight: 700 }}>✓</span> : null}
        {active ? <span style={{ color: "#8a420f", fontWeight: 600 }}> 进行中</span> : null}
        {failed > 0 ? <span style={{ color: "#b98900", fontWeight: 600 }}> · 失败 {failed}</span> : null}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: TranslationV4Status }) {
  const config = STATUS_DISPLAY[status] ?? { label: status, color: "#4b5563", bg: "#f3f4f6", border: "#dde1e6" };
  return (
    <span
      style={{
        padding: "0.18rem 0.65rem",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 700,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        letterSpacing: "0.01em",
      }}
    >
      {config.label}
    </span>
  );
}

const STATUS_DISPLAY: Partial<Record<TranslationV4Status, { label: string; color: string; bg: string; border: string }>> = {
  CREATED: { label: "已创建", color: pageColorTokens.textSecondary, bg: pageColorTokens.surfaceMuted, border: pageColorTokens.borderSubtle },
  INIT_QUEUED: { label: "等待初始化", color: "#8a420f", bg: "#fff1e8", border: "#f3d1b8" },
  INITIALIZING: { label: "初始化中", color: "#8a420f", bg: "#fff1e8", border: "#f3d1b8" },
  INIT_DONE: { label: "初始化完成", color: pageColorTokens.brandGreenDark, bg: pageColorTokens.brandGreenLight, border: "#ccefe4" },
  TRANSLATE_QUEUED: { label: "等待翻译", color: "#8a420f", bg: "#fff1e8", border: "#f3d1b8" },
  TRANSLATING: { label: "翻译中", color: "#8a420f", bg: "#fff1e8", border: "#f3d1b8" },
  TRANSLATE_DONE: { label: "翻译完成", color: pageColorTokens.brandGreenDark, bg: pageColorTokens.brandGreenLight, border: "#ccefe4" },
  WRITEBACK_QUEUED: { label: "等待回写", color: "#8a420f", bg: "#fff1e8", border: "#f3d1b8" },
  WRITING_BACK: { label: "回写中", color: "#8a420f", bg: "#fff1e8", border: "#f3d1b8" },
  VERIFY_QUEUED: { label: "等待验证", color: "#7c5e10", bg: "#fff7e0", border: "#efdca4" },
  VERIFYING: { label: "验证中", color: "#7c5e10", bg: "#fff7e0", border: "#efdca4" },
  COMPLETED: { label: "已完成", color: pageColorTokens.brandGreenDark, bg: pageColorTokens.brandGreenLight, border: "#ccefe4" },
  FAILED: { label: "失败", color: pageColorTokens.criticalText, bg: "#fff0ee", border: "#f3cbc5" },
  PAUSED: { label: "已暂停", color: "#7c5e10", bg: "#fff7e0", border: "#efdca4" },
  CANCELLED: { label: "已取消", color: pageColorTokens.textSecondary, bg: pageColorTokens.surfaceMuted, border: pageColorTokens.borderSubtle },
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "0.875rem",
  color: pageColorTokens.textBody,
  cursor: "pointer",
  userSelect: "none",
};

function testEnvPanelStyle(active: boolean): React.CSSProperties {
  return {
    padding: "0.8rem 1rem",
    borderRadius: "10px",
    border: `2px solid ${active ? "#f59e0b" : pageColorTokens.border}`,
    background: active
      ? "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)"
      : "linear-gradient(135deg, #f5f6f8 0%, #eef0f6 100%)",
    boxShadow: active ? "0 2px 10px rgba(245, 158, 11, 0.2)" : "none",
    transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
  };
}

const testModePillStyle: React.CSSProperties = {
  padding: "0.18rem 0.56rem",
  borderRadius: 999,
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "#7c5e10",
  background: "#fff7e0",
  border: "1px solid #efdca4",
};

const failErrorStyle: React.CSSProperties = {
  padding: "0.65rem 0.8rem",
  borderRadius: "10px",
  background: "#fff0ee",
  border: "1px solid #f3cbc5",
  color: pageColorTokens.criticalText,
  fontSize: "0.75rem",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const jobMetaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))",
  gap: 10,
};

const jobMetaItemStyle: React.CSSProperties = {
  padding: "0.75rem 0.8rem",
  borderRadius: "10px",
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const jobMetaLabelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: pageColorTokens.textSecondary,
  fontWeight: 600,
};

const jobMetaValueStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: pageColorTokens.textPrimary,
  lineHeight: 1.45,
  wordBreak: "break-word",
};

const jobStageGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "0.85rem 0.9rem",
  borderRadius: "10px",
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
};

const jobInlineNoticeStyle: React.CSSProperties = {
  padding: "0.65rem 0.8rem",
  borderRadius: "10px",
  background: "#fff1e8",
  border: "1px solid #f3d1b8",
  color: "#8a420f",
  fontSize: "0.75rem",
  fontWeight: 600,
};

const taskSummaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const taskSummaryItemStyle: React.CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: "12px",
  background: pageColorTokens.surfaceSubtle,
  padding: "0.85rem 0.95rem",
};

const taskHintBarStyle: React.CSSProperties = {
  padding: "0.8rem 0.95rem",
  borderRadius: "12px",
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.8125rem",
  lineHeight: 1.6,
  color: pageColorTokens.textSecondary,
};

const confirmRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "92px 1fr",
  gap: 12,
  padding: "0.75rem 0.85rem",
  borderRadius: "10px",
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  alignItems: "start",
};

const confirmLabelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  color: pageColorTokens.textSecondary,
  paddingTop: 2,
};

const confirmValueStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  color: pageColorTokens.textPrimary,
  lineHeight: 1.6,
};

const confirmFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

function dialogButtonStyle(
  tone: "primary" | "secondary",
  disabled: boolean,
): React.CSSProperties {
  return {
    padding: "0.55rem 1rem",
    borderRadius: "10px",
    border:
      tone === "primary"
        ? `1px solid ${disabled ? pageColorTokens.border : pageColorTokens.brandGreen}`
        : `1px solid ${pageColorTokens.border}`,
    background:
      tone === "primary"
        ? disabled
          ? "#d9dde3"
          : pageColorTokens.brandGreen
        : "#ffffff",
    color: tone === "primary" ? "#ffffff" : pageColorTokens.textPrimary,
    fontSize: "0.8125rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
