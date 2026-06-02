import { useEffect, useState } from "react";
import { pageColorTokens } from "../../page/pageUiStyles";
import { elapsedSecondsSince } from "../aiTask/LogViewer";
import {
  AITaskCardShell,
  formatActualElapsed,
  actionButtonStyle,
  type CardAction,
} from "../aiTask/AITaskCardShell";
import type {
  AITaskItem,
  AITaskStatus,
  ProductImproveTaskConfig,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onDelete: (taskId: string) => void;
  onOpenDetail: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  deleting: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRunningElapsed(startedAt: string | null): string | null {
  const seconds = elapsedSecondsSince(startedAt);
  if (seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatVariableToken(name: string): string {
  return `{{${name}}}`;
}

function readStringField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDisplayValue(
  value: string | number | null | undefined,
  variableName: string,
): string {
  if (value == null || value === "") return formatVariableToken(variableName);
  return String(value);
}

function inferCreditInsufficient(task: AITaskItem): boolean {
  const haystack = `${task.errorMsg ?? ""} ${JSON.stringify(task.result ?? {})}`.toLowerCase();
  return haystack.includes("credit") || haystack.includes("积分") || haystack.includes("额度");
}

function getProgressPercent(
  task: AITaskItem,
  status: AITaskStatus,
  runningElapsed: string | null,
): number {
  const config = task.config as Record<string, unknown>;
  const result = task.result as Record<string, unknown> | null;
  const explicit =
    readNumberField(result, "progressPercent") ??
    readNumberField(config, "progressPercent");

  if (explicit != null) return Math.max(0, Math.min(100, explicit));

  switch (status) {
    case "running":
      return runningElapsed ? 62 : 18;
    case "pending_review":
    case "succeeded":
    case "scored":
    case "applied":
      return 100;
    case "failed":
      return 56;
    case "cancelled":
      return 24;
    default:
      return 0;
  }
}

function getProgressTone(status: AITaskStatus) {
  switch (status) {
    case "running":
      return {
        background: "linear-gradient(90deg, #00a67c 0%, #35b486 55%, #7ad9a8 100%)",
        text: pageColorTokens.textPrimary,
      };
    case "pending_review":
    case "succeeded":
    case "scored":
    case "applied":
      return {
        background: "linear-gradient(90deg, #00a67c 0%, #00a67c 100%)",
        text: pageColorTokens.textPrimary,
      };
    case "failed":
      return {
        background: "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)",
        text: pageColorTokens.criticalText,
      };
    default:
      return {
        background: "linear-gradient(90deg, #9ca3af 0%, #cbd5e1 100%)",
        text: pageColorTokens.textPrimary,
      };
  }
}

function resolveCardActions(params: {
  status: AITaskStatus;
  creditInsufficient: boolean;
  onOpenDetail: () => void;
  onDelete: () => void;
  deleting: boolean;
}): CardAction[] {
  const { status, creditInsufficient, onOpenDetail, onDelete, deleting } = params;

  if (creditInsufficient) {
    return [
      { label: "充值积分", tone: "primary", disabled: true },
      { label: "继续任务", tone: "secondary", disabled: true },
      { label: deleting ? "删除中" : "查看详情", tone: "subtle", onClick: onOpenDetail, disabled: deleting },
    ];
  }

  switch (status) {
    case "running":
      return [
        { label: "停止任务", tone: "primary", disabled: true },
        { label: "查看任务详情", tone: "secondary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
    case "pending_review":
    case "succeeded":
      return [
        { label: "审核结果", tone: "primary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
    case "scored":
      return [
        { label: "查看应用结果", tone: "primary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
    case "applied":
      return [
        { label: "查看应用结果", tone: "primary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
    case "failed":
      return [
        { label: "重新执行", tone: "primary", disabled: true },
        { label: "查看失败详情", tone: "secondary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
    case "cancelled":
      return [
        { label: "重新创建任务", tone: "primary", disabled: true },
        { label: "查看详情", tone: "secondary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
    default:
      return [
        { label: "查看详情", tone: "secondary", onClick: onOpenDetail },
        { label: deleting ? "删除中" : "删除", tone: "subtle", onClick: onDelete, disabled: deleting },
      ];
  }
}

function getPrimaryStatusCopy(params: {
  status: AITaskStatus;
  creditInsufficient: boolean;
  progressPercent: string;
  completedCount: string;
  itemCount: string;
  currentStepText: string;
  errorReason: string;
}): string {
  const { status, creditInsufficient, progressPercent, completedCount, itemCount, currentStepText, errorReason } =
    params;

  if (creditInsufficient) {
    return `当前进度 ${progressPercent}%，任务已暂停：当前积分不足，请充值后继续任务。`;
  }

  switch (status) {
    case "running":
      return `正在生成商品文案，请稍候...`;
    case "pending_review":
      return `当前进度 100%，任务已完成，等待人工审核生成结果。`;
    case "succeeded":
      return `当前进度 100%，已完成所有任务。`;
    case "scored":
      return `审核已完成，等待应用审核通过的结果。`;
    case "applied":
      return `当前进度 100%，审核通过的结果已成功应用。`;
    case "failed":
      return `任务执行失败：${errorReason}`;
    case "cancelled":
      return `任务已取消，未继续执行后续处理。`;
    default:
      return `当前进度 ${progressPercent}%，任务状态已更新。`;
  }
}

function getSecondaryStatusCopy(params: {
  status: AITaskStatus;
  creditInsufficient: boolean;
  elapsedLabel: string;
  usedCredits: string;
  estimatedCredits: string;
  completedCount: string;
  itemCount: string;
}): string {
  const { status, creditInsufficient, elapsedLabel, usedCredits, estimatedCredits, completedCount, itemCount } =
    params;

  if (creditInsufficient) {
    return `本次任务耗时：${elapsedLabel}，当前已消耗：${usedCredits} 积分，预计还需：${estimatedCredits} 积分。`;
  }

  switch (status) {
    case "running":
      return `任务执行中，已运行：${elapsedLabel}`;
    case "pending_review":
    case "succeeded":
    case "scored":
    case "applied":
      return `本次任务耗时：${elapsedLabel}，任务已消耗：${usedCredits} 积分。`;
    case "failed":
      return `任务在处理第 ${completedCount}/${itemCount} 项时中断，请查看详情后继续处理。`;
    case "cancelled":
      return `取消前已完成 ${completedCount}/${itemCount} 项处理。`;
    default:
      return `预估积分：${estimatedCredits}，实际消耗：${usedCredits}。`;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProductImproveTaskCard({
  task,
  locationSearch,
  onDelete,
  onOpenDetail,
  onTaskUpdated,
  deleting,
}: Props) {
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const cfg = task.config as Partial<ProductImproveTaskConfig>;
  const extendedConfig = task.config as Record<string, unknown>;
  const extendedResult = task.result as Record<string, unknown> | null;

  const [runningElapsed, setRunningElapsed] = useState<string | null>(() =>
    task.status === "running" ? formatRunningElapsed(task.startedAt) : null,
  );

  useEffect(() => {
    setLocalStatus(task.status);
  }, [task.status]);

  useEffect(() => {
    if (localStatus !== "running") {
      setRunningElapsed(null);
      return;
    }
    const tick = () => setRunningElapsed(formatRunningElapsed(task.startedAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [localStatus, task.startedAt]);

  const creditInsufficient = inferCreditInsufficient(task);

  // ── Computed display values ──
  const taskGoal = readStringField(extendedConfig, "taskGoal") ?? "生成产品描述";
  const itemCount = formatDisplayValue(readNumberField(extendedConfig, "itemCount"), "itemCount");
  const completedCount = formatDisplayValue(
    readNumberField(extendedResult, "completedCount") ??
      readNumberField(extendedConfig, "completedCount"),
    "completedCount",
  );
  const progressPercentValue =
    readNumberField(extendedResult, "progressPercent") ??
    readNumberField(extendedConfig, "progressPercent");
  const progressPercentText = formatDisplayValue(progressPercentValue, "progressPercent");
  const sourceLanguage = formatDisplayValue(
    readStringField(extendedConfig, "sourceLanguage"),
    "sourceLanguage",
  );
  const targetLanguage = formatDisplayValue(cfg.targetLanguage, "targetLanguage");
  const brandStyle = formatDisplayValue(
    readStringField(extendedConfig, "brandStyle"),
    "brandStyle",
  );
  const currentStepText = formatDisplayValue(
    readStringField(extendedResult, "currentStepText") ??
      readStringField(extendedConfig, "currentStepText"),
    "currentStepText",
  );
  const usedCredits = formatDisplayValue(task.actualCredits, "usedCredits");
  const estimatedCredits = formatDisplayValue(task.estimatedCredits, "estimatedCredits");
  const errorReason = task.errorMsg || formatVariableToken("errorReason");
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const elapsedLabel = runningElapsed ?? actualElapsed ?? formatVariableToken("elapsedMinutes");

  const progressPercent = getProgressPercent(task, localStatus, runningElapsed);
  const progressTone = getProgressTone(localStatus);
  const primaryCopy = getPrimaryStatusCopy({
    status: localStatus,
    creditInsufficient,
    progressPercent: progressPercentText,
    completedCount,
    itemCount,
    currentStepText,
    errorReason,
  });
  const secondaryCopy = getSecondaryStatusCopy({
    status: localStatus,
    creditInsufficient,
    elapsedLabel,
    usedCredits,
    estimatedCredits,
    completedCount,
    itemCount,
  });
  const actions = resolveCardActions({
    status: localStatus,
    creditInsufficient,
    onOpenDetail,
    onDelete: () => onDelete(task.id),
    deleting,
  });

  // ── Meta line ──
  const metaLine = (
    <>
      <span>任务详情：</span>
      <span>{itemCount} 个商品</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>输出 {targetLanguage}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>语言：{sourceLanguage}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>|</span>
      <span>品牌风格：{brandStyle}</span>
      {cfg.productId ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span>产品 ID：{cfg.productId}</span>
        </>
      ) : null}
      {cfg.originalTitle ? (
        <>
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span
            style={{
              maxWidth: 320,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              verticalAlign: "bottom",
            }}
            title={cfg.originalTitle}
          >
            商品：{cfg.originalTitle}
          </span>
        </>
      ) : null}
    </>
  );

  // ── "积分不足" extra badge ──
  const extraBadges = creditInsufficient ? (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: "#9a3412",
        padding: "0.22rem 0.48rem",
        borderRadius: 999,
        background: "#fff7ed",
        border: "1px solid rgba(234, 88, 12, 0.16)",
      }}
    >
      积分不足
    </span>
  ) : null;

  return (
    <AITaskCardShell
      task={task}
      locationSearch={locationSearch}
      status={localStatus}
      title={`任务目标：${taskGoal}`}
      metaLine={metaLine}
      extraBadges={extraBadges}
      primaryCopy={primaryCopy}
      primaryCopyColor={progressTone.text}
      secondaryCopy={secondaryCopy}
      progressPercent={progressPercent}
      progressBackground={progressTone.background}
      actions={actions}
      showLogViewer={localStatus === "running"}
      onStatusChange={(status, result) => {
        setLocalStatus(status);
        onTaskUpdated?.(task.id, status, result);
      }}
    />
  );
}
