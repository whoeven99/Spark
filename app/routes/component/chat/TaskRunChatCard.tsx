/**
 * TaskRunChatCard — 「任务已开始」对话卡片。
 *
 * TaskProposal 确认执行后追加到对话流：展示已创建任务数、参数摘要与创建失败项，
 * 并轮询任务列表聚合执行进度（进行中 / 待审核 / 完成 / 失败），全部终态后停止轮询。
 */
import { useEffect, useMemo, useState } from "react";
import type { AITaskItem, AITaskStatus, ProductImproveTaskConfig } from "../../../lib/aiTaskTypes";
import type { TaskRunPayload } from "../../../lib/taskRunPayload";
import { ChatEmbeddedAiTaskCard } from "./ChatEmbeddedAiTaskCard";
import { pageColorTokens } from "../../page/pageUiStyles";
import { BATCH_PRODUCT_IMPROVE_SKILL_ID } from "../../../lib/taskProposalPayload";
import {
  resolveTaskProposalParamValueLabel,
  resolveTaskRunParamsSummaryLines,
  resolveTaskRunTitle,
} from "../../../lib/taskProposalDisplay";
import type { OpenWorkspaceTasksOptions } from "../../../lib/productImproveDeepLink";
import { useTranslation } from "react-i18next";

const POLL_INTERVAL_MS = 5000;
/** 卡片挂载后最长轮询时长，避免长期占用请求 */
const MAX_POLL_MS = 10 * 60 * 1000;
/** 任务数不超过该值时内嵌逐任务详情卡（图片预览等），否则保持聚合视角 */
const EMBED_DETAIL_MAX_TASKS = 2;

type StatusAggregate = {
  running: number;
  pendingReview: number;
  succeeded: number;
  failed: number;
  known: number;
};

function aggregate(statuses: AITaskStatus[]): StatusAggregate {
  const agg: StatusAggregate = { running: 0, pendingReview: 0, succeeded: 0, failed: 0, known: statuses.length };
  for (const status of statuses) {
    if (status === "running") agg.running += 1;
    else if (status === "pending_review") agg.pendingReview += 1;
    else if (status === "failed" || status === "cancelled") agg.failed += 1;
    else agg.succeeded += 1;
  }
  return agg;
}

function resolveProductImproveReviewOptions(
  run: TaskRunPayload,
  matchedTasks: AITaskItem[],
): OpenWorkspaceTasksOptions | undefined {
  const isProductImprove =
    run.skillId === BATCH_PRODUCT_IMPROVE_SKILL_ID ||
    matchedTasks.some((task) => task.taskType === "product_improve");
  if (!isProductImprove) return undefined;
  const firstPending = matchedTasks.find((task) => task.status === "pending_review");
  if (!firstPending && matchedTasks.length !== 1) return undefined;
  return {
    skillId: run.skillId,
    taskType: "product_improve",
    taskId: firstPending?.id ?? matchedTasks[0]?.id,
    intent: "review",
  };
}

const metaChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  maxWidth: "100%",
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 10px",
  borderRadius: 999,
  background: "rgba(233, 247, 239, 0.9)",
  border: "1px solid rgba(0, 128, 96, 0.22)",
  color: pageColorTokens.brandGreenDeep,
} as const;

export function TaskRunChatCard({
  run,
  locationSearch,
  onOpenTasks,
  tasksById,
}: {
  run: TaskRunPayload;
  locationSearch: string;
  onOpenTasks?: (opts?: OpenWorkspaceTasksOptions) => void;
  /** 由外部（ChatPanel 统一轮询）提供任务状态时，卡片不再自行轮询 */
  tasksById?: Record<string, AITaskItem>;
}) {
  const { t } = useTranslation();
  const [selfPolledTasks, setSelfPolledTasks] = useState<AITaskItem[]>([]);
  const taskIdSet = useMemo(() => new Set(run.taskIds), [run.taskIds]);
  const externallyManaged = tasksById !== undefined;
  const matchedTasks = useMemo(
    () =>
      externallyManaged
        ? run.taskIds
            .map((id) => tasksById?.[id])
            .filter((task): task is AITaskItem => Boolean(task))
        : selfPolledTasks,
    [externallyManaged, run.taskIds, tasksById, selfPolledTasks],
  );

  useEffect(() => {
    if (externallyManaged || run.taskIds.length === 0) return;
    let cancelled = false;
    let timer: number | undefined;
    const startedPollingAt = Date.now();

    const poll = async () => {
      try {
        const params = new URLSearchParams(
          locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
        );
        params.set("view", "current");
        params.set("pageSize", "50");
        const res = await fetch(`/api/ai-task?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { tasks?: AITaskItem[] };
        if (cancelled) return;
        const matched = (data.tasks ?? []).filter((task) => taskIdSet.has(task.id));
        setSelfPolledTasks(matched);
        const allTerminal =
          matched.length > 0 && matched.every((task) => task.status !== "running");
        if (allTerminal || Date.now() - startedPollingAt > MAX_POLL_MS) return;
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        // 轮询失败不致命，稍后重试
        if (Date.now() - startedPollingAt <= MAX_POLL_MS) {
          timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS * 2);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [run.taskIds, taskIdSet, locationSearch, externallyManaged]);

  const agg = aggregate(matchedTasks.map((task) => task.status));
  const inProgress = agg.known === 0 || agg.running > 0;
  const isProductImprove =
    run.skillId === BATCH_PRODUCT_IMPROVE_SKILL_ID ||
    matchedTasks.some((task) => task.taskType === "product_improve");
  const showReviewButton = !inProgress && isProductImprove && agg.pendingReview > 0;
  /** 少量图片类任务时内嵌逐任务详情卡（含图片预览/操作），其余保持聚合视角 */
  const embedTaskDetails =
    run.taskIds.length > 0 &&
    run.taskIds.length <= EMBED_DETAIL_MAX_TASKS &&
    matchedTasks.length > 0 &&
    matchedTasks.every(
      (task) => task.taskType === "picture_translate" || task.taskType === "image_generation",
    );
  const displayTitle = resolveTaskRunTitle(run, t);
  const paramsLines = resolveTaskRunParamsSummaryLines(run, t);

  const productTitles = useMemo(() => {
    const titles: string[] = [];
    for (const task of matchedTasks) {
      const cfg = task.config as Partial<ProductImproveTaskConfig>;
      const title = cfg.originalTitle?.trim() || cfg.productId?.trim();
      if (title && !titles.includes(title)) titles.push(title);
    }
    return titles;
  }, [matchedTasks]);

  const languageLabel = useMemo(() => {
    const fromParams = run.params?.targetLanguage;
    if (fromParams) {
      return resolveTaskProposalParamValueLabel("targetLanguage", fromParams, t);
    }
    const fromTask = matchedTasks.find((task) => {
      const cfg = task.config as Partial<ProductImproveTaskConfig>;
      return Boolean(cfg.targetLanguage);
    });
    if (fromTask) {
      const cfg = fromTask.config as Partial<ProductImproveTaskConfig>;
      return resolveTaskProposalParamValueLabel("targetLanguage", String(cfg.targetLanguage), t);
    }
    const langLine = paramsLines.find((line) => /目标语言|Target language/i.test(line));
    return langLine?.replace(/^(?:目标语言|Target language)\s*[：:]\s*/i, "").trim() || null;
  }, [matchedTasks, paramsLines, run.params, t]);

  const tokenSummary = useMemo(() => {
    let actual = 0;
    let estimated = 0;
    let hasActual = false;
    let hasEstimated = false;
    for (const task of matchedTasks) {
      if (typeof task.actualCredits === "number" && task.actualCredits > 0) {
        actual += task.actualCredits;
        hasActual = true;
      }
      if (typeof task.estimatedCredits === "number" && task.estimatedCredits > 0) {
        estimated += task.estimatedCredits;
        hasEstimated = true;
      }
    }
    if (hasActual) return { kind: "actual" as const, value: actual };
    if (hasEstimated) return { kind: "estimated" as const, value: estimated };
    return null;
  }, [matchedTasks]);

  const progressParts: string[] = [];
  if (agg.known > 0) {
    if (agg.running > 0) {
      progressParts.push(`${t("workspace.shell.contextSidebar.bucketRunning")} ${agg.running}`);
    }
    if (agg.pendingReview > 0) {
      progressParts.push(`${t("workspace.shell.contextSidebar.bucketPendingReview")} ${agg.pendingReview}`);
    }
    if (agg.succeeded > 0) {
      progressParts.push(`${t("workspace.shell.contextSidebar.bucketSucceeded")} ${agg.succeeded}`);
    }
    if (agg.failed > 0) {
      progressParts.push(`${t("workspace.shell.contextSidebar.bucketFailed")} ${agg.failed}`);
    }
  }

  const joinSep = t("workspace.taskProposal.batchPanel.listJoin");

  return (
    <div
      style={{
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: 12,
        background: pageColorTokens.surface,
        overflow: "hidden",
        fontSize: 13,
        maxWidth: 480,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
          background: pageColorTokens.surfaceMuted,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#00a67c",
            color: "#fff",
          }}
        >
          {t("workspace.taskProposal.taskRunCard.startedBadge")}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: pageColorTokens.textPrimary, flex: 1 }}>
          {displayTitle}
        </span>
        {inProgress ? (
          <span style={{ fontSize: 11, color: pageColorTokens.textFootnote }}>
            {t("workspace.taskProposal.taskRunCard.running")}
          </span>
        ) : null}
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: pageColorTokens.textPrimary, fontWeight: 600 }}>
          {run.errors.length > 0
            ? t("workspace.taskProposal.taskRunCard.createdPartial", {
                count: run.taskIds.length,
                failed: run.errors.length,
              })
            : t("workspace.taskProposal.taskRunCard.createdCount", { count: run.taskIds.length })}
        </div>

        {(productTitles.length > 0 || languageLabel || tokenSummary) ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {productTitles.length > 0 ? (
              <span style={metaChipStyle} title={productTitles.join(joinSep)}>
                <span style={{ opacity: 0.75 }}>
                  {t("workspace.taskProposal.taskRunCard.metaProduct")}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 180,
                  }}
                >
                  {productTitles.length === 1
                    ? productTitles[0]
                    : t("workspace.taskProposal.taskRunCard.metaProductCount", {
                        count: productTitles.length,
                      })}
                </span>
              </span>
            ) : null}
            {languageLabel ? (
              <span style={metaChipStyle}>
                <span style={{ opacity: 0.75 }}>
                  {t("workspace.taskProposal.taskRunCard.metaLanguage")}
                </span>
                <span>{languageLabel}</span>
              </span>
            ) : null}
            {tokenSummary ? (
              <span style={metaChipStyle}>
                <span style={{ opacity: 0.75 }}>
                  {t("workspace.taskProposal.taskRunCard.metaTokens")}
                </span>
                <span>
                  {tokenSummary.kind === "actual"
                    ? t("workspace.taskProposal.taskRunCard.tokensUsed", {
                        count: tokenSummary.value,
                      })
                    : t("workspace.taskProposal.taskRunCard.tokensEstimated", {
                        count: tokenSummary.value,
                      })}
                </span>
              </span>
            ) : null}
          </div>
        ) : paramsLines.length > 0 ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
            {paramsLines.join(" · ")}
          </div>
        ) : null}

        {!embedTaskDetails && progressParts.length > 0 ? (
          <div
            style={{
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              background: pageColorTokens.surfaceSubtle,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              borderRadius: 8,
              padding: "7px 10px",
            }}
          >
            {t("workspace.taskProposal.taskRunCard.progress", { parts: progressParts.join(" · ") })}
          </div>
        ) : null}

        {inProgress && !embedTaskDetails ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: pageColorTokens.brandGreenDeep,
              background: "rgba(233, 247, 239, 0.55)",
              border: "1px solid rgba(0, 128, 96, 0.18)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {t("workspace.taskProposal.taskRunCard.runningHint")}
          </div>
        ) : null}

        {embedTaskDetails
          ? matchedTasks.map((task) => (
              <ChatEmbeddedAiTaskCard
                key={task.id}
                task={task}
                locationSearch={locationSearch}
                onOpenTasks={onOpenTasks}
              />
            ))
          : null}

        {run.errors.slice(0, 3).map((error, index) => (
          <div
            key={`${error.targetId}-${index}`}
            style={{
              fontSize: 12,
              color: pageColorTokens.criticalText,
              padding: "4px 8px",
              borderRadius: 6,
              background: "#fff5f5",
              border: "1px solid #fcd5d5",
            }}
          >
            {error.error}
          </div>
        ))}
        {run.errors.length > 3 ? (
          <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
            {t("workspace.taskProposal.card.doneMoreErrors", { count: run.errors.length - 3 })}
          </div>
        ) : null}

        {showReviewButton ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: 8,
                background: "#fff",
                color: pageColorTokens.textPrimary,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => {
                const opts = resolveProductImproveReviewOptions(run, matchedTasks);
                if (opts) onOpenTasks?.(opts);
              }}
            >
              {t("productImproveStage1.chatGoReview")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
