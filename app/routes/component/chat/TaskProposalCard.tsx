/**
 * TaskProposalCard — 通用任务确认卡片（TaskProposal 协议，阶段 1）。
 *
 * 任意 Skill 发出 task_proposal 后由本卡片统一渲染：
 *   目标对象勾选 + schema 驱动的参数表单 + 执行估算（分桶 EWMA） + 确认执行。
 * 执行走 POST /api/task-proposal，按 skillId 路由到服务端注册表。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  TaskProposalExecuteResponse,
  TaskProposalEstimateResponse,
  TaskProposalPayload,
  TaskProposalTarget,
} from "../../../lib/taskProposalPayload";
import {
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  IMAGE_GENERATION_SKILL_ID,
  mergeTaskProposalTargets,
} from "../../../lib/taskProposalPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import { describeObjectQueryI18n } from "../../../lib/objectQuerySpec";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import { buildTaskRunPayload, type TaskRunPayload } from "../../../lib/taskRunPayload";
import {
  buildTaskRunParamsSummary,
  resolveTaskProposalDisabledReason,
  resolveTaskProposalFieldLabel,
  resolveTaskProposalParamValueLabel,
  resolveTaskProposalSummary,
  resolveTaskProposalTargetKind,
  resolveTaskProposalTitle,
} from "../../../lib/taskProposalDisplay";
import { formatThinkingDuration } from "../../../lib/thinkingDuration";
import { pageColorTokens } from "../../page/pageUiStyles";
import {
  TaskProposalProductImageGrid,
  type ProductImagesCacheEntry,
} from "./TaskProposalProductImageGrid";

function buildPictureTranslateTargetId(productId: string, imageUrl: string): string {
  return `${productId}::${imageUrl}`;
}

// ─── Styles（与 BatchTasksChatCard 视觉对齐） ────────────────────────────────

const cardStyle = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 14,
  background: pageColorTokens.surface,
  overflow: "hidden",
  fontSize: 13,
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.04)",
} as const;

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
} as const;

const titleBadgeStyle = {
  fontSize: 12,
  fontWeight: 700,
  padding: "3px 10px",
  borderRadius: 999,
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  border: `1px solid rgba(0, 128, 96, 0.18)`,
  flexShrink: 0,
} as const;

const bodyStyle = {
  padding: "14px 14px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
} as const;

const targetListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 220,
  overflowY: "auto",
} as const;

const targetListStyleWithImages = {
  ...targetListStyle,
  maxHeight: 360,
  gap: 10,
} as const;

const targetRowStyle = (checked: boolean, disabled: boolean) =>
  ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 10,
    border: `1px solid ${checked ? "rgba(0, 128, 96, 0.35)" : pageColorTokens.borderSubtle}`,
    background: checked ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceSubtle,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }) as const;

const thumbStyle = {
  width: 36,
  height: 36,
  borderRadius: 8,
  objectFit: "cover" as const,
  background: pageColorTokens.surfaceMuted,
  flexShrink: 0,
} as const;

const thumbPlaceholderStyle = {
  width: 36,
  height: 36,
  borderRadius: 8,
  background: pageColorTokens.surfaceMuted,
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  color: pageColorTokens.textFootnote,
  flexShrink: 0,
} as const;

const fieldLabelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  marginBottom: 6,
} as const;

const inputStyle = {
  width: "100%",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
  color: pageColorTokens.textPrimary,
} as const;

const textareaStyle = {
  ...inputStyle,
  minHeight: 96,
  resize: "vertical" as const,
  fontFamily: "inherit",
  lineHeight: 1.45,
} as const;

const estimateBoxStyle = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 10,
  padding: "8px 10px",
  display: "flex",
  alignItems: "center",
  gap: 6,
} as const;

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
} as const;

const confirmBtnStyle = (disabled: boolean) =>
  ({
    padding: "8px 16px",
    borderRadius: 10,
    border: "none",
    background: disabled ? pageColorTokens.borderSubtle : pageColorTokens.brandGreen,
    color: disabled ? pageColorTokens.textSecondary : "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  }) as const;

/** 关键字段（对象 + 目标语言）统一放进一张设置面板，逐行同级展示 */
const setupPanelStyle = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 12,
  background: pageColorTokens.surface,
  overflow: "hidden",
} as const;

const setupBlockStyle = (first: boolean) =>
  ({
    padding: "11px 12px",
    ...(first ? null : { borderTop: `1px solid ${pageColorTokens.borderSubtle}` }),
  }) as const;

const setupRowStyle = (first: boolean) =>
  ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "11px 12px",
    ...(first ? null : { borderTop: `1px solid ${pageColorTokens.borderSubtle}` }),
  }) as const;

const setupLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  minWidth: 0,
} as const;

const setupStepStyle = {
  width: 18,
  height: 18,
  borderRadius: 999,
  background: pageColorTokens.brandGreenLight,
  border: `1px solid rgba(0, 128, 96, 0.2)`,
  color: pageColorTokens.brandGreenDeep,
  fontSize: 11,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
} as const;

const setupTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
} as const;

const setupHintStyle = {
  fontSize: 12,
  color: pageColorTokens.textFootnote,
  marginTop: 3,
  marginLeft: 25,
} as const;

const pickProductButtonStyle = (disabled: boolean) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 13px",
    borderRadius: 999,
    border: `1px solid rgba(0, 128, 96, ${disabled ? 0.16 : 0.32})`,
    background: pageColorTokens.brandGreenLight,
    color: pageColorTokens.brandGreenDeep,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    flexShrink: 0,
  }) as const;

const setupSelectStyle = {
  maxWidth: 210,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 13,
  fontWeight: 600,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  cursor: "pointer",
  flexShrink: 0,
} as const;

const changeProductLinkStyle = {
  border: "none",
  background: "transparent",
  color: pageColorTokens.brandGreenDeep,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
} as const;

// ─── Done state ───────────────────────────────────────────────────────────────

function DoneState({
  created,
  total,
  errors,
}: {
  created: number;
  total: number;
  errors: Array<{ index: number; targetId: string; error: string }>;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: created > 0 ? "rgba(0,166,124,0.06)" : pageColorTokens.surfaceMuted,
          border: `1px solid ${created > 0 ? "#00a67c40" : pageColorTokens.borderSubtle}`,
          color: created > 0 ? "#00a67c" : pageColorTokens.textPrimary,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {created > 0
          ? t("workspace.taskProposal.card.doneSuccess", { created, total })
          : t("workspace.taskProposal.card.doneFailed")}
      </div>
      {created > 0 ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("workspace.taskProposal.card.doneHint")}
        </div>
      ) : null}
      {errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {errors.slice(0, 3).map((e, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: pageColorTokens.criticalText,
                padding: "4px 8px",
                borderRadius: 6,
                background: "#fff5f5",
                border: "1px solid #fcd5d5",
              }}
            >
              {e.error}
            </div>
          ))}
          {errors.length > 3 && (
            <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
              {t("workspace.taskProposal.card.doneMoreErrors", { count: errors.length - 3 })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estimate line ────────────────────────────────────────────────────────────

function EstimateLine({
  loading,
  perItemCredits,
  perItemSeconds,
  count,
}: {
  loading: boolean;
  perItemCredits: number | null;
  perItemSeconds: number | null;
  count: number;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div style={estimateBoxStyle}>⏱ {t("workspace.taskProposal.card.estimateLoading")}</div>
    );
  }
  // 无历史校准数据时不占版面（有真实预估后再展示）
  if (perItemCredits == null && perItemSeconds == null) {
    return null;
  }
  const parts: string[] = [];
  if (perItemCredits != null && count > 0) {
    parts.push(
      t("workspace.taskProposal.card.estimateCredits", { credits: perItemCredits * count }),
    );
  }
  if (perItemSeconds != null && count > 0) {
    parts.push(
      t("workspace.taskProposal.card.estimateDuration", {
        duration: formatThinkingDuration(perItemSeconds * 1000, t),
      }),
    );
  }
  return (
    <div style={estimateBoxStyle}>
      <span>⏱ {parts.join(" · ")}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>
        {t("workspace.taskProposal.card.estimateCalibrated")}
      </span>
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

type Props = {
  embedded?: boolean;
  proposal: TaskProposalPayload;
  /** 工作台已选商品；proposal.targets 为空时兜底补全 */
  contextProducts?: BatchTaskProduct[];
  /** 工作台按条件圈定的商品 query；items 与手动选择都为空时兜底 */
  contextProductQuery?: ObjectQuerySelection | null;
  /**
   * 打开与底部「添加上下文 → 商品」相同的选择弹窗。
   * 选中结果写入工作台上下文后，本卡跟随 contextProducts 更新（点「更换」后）。
   */
  onOpenProductPicker?: () => void;
  onTasksCreated?: (taskIds: string[]) => void;
  /** 执行成功后回调（工作台用于向对话追加「任务已开始」新一轮） */
  onExecuted?: (run: TaskRunPayload) => void;
};

export function TaskProposalCard({
  embedded = false,
  proposal,
  contextProducts = [],
  contextProductQuery = null,
  onOpenProductPicker,
  onTasksCreated,
  onExecuted,
}: Props) {
  const { t } = useTranslation();
  /**
   * 用户在本卡点了「更换/选择商品」后，跟随工作台当前选品；
   * 未点过则仍以消息里固化的 proposal.targets 为准（避免历史卡被全局上下文带跑）。
   */
  const [followContextTargets, setFollowContextTargets] = useState(false);
  const resolved = useMemo(
    () =>
      mergeTaskProposalTargets(proposal, contextProducts, contextProductQuery, {
        preferContext: followContextTargets,
      }),
    [proposal, contextProducts, contextProductQuery, followContextTargets],
  );

  const openProductPicker = useCallback(() => {
    setFollowContextTargets(true);
    onOpenProductPicker?.();
  }, [onOpenProductPicker]);

  const targets = resolved.targets.items;
  /** 按条件圈定模式：无具体 items 时按 query 执行（服务端重新求值） */
  const targetsQuery = targets.length === 0 ? (resolved.targets.query ?? null) : null;
  const queryCount = targetsQuery?.matchCount ?? null;
  /** 无目标对象技能（如无参考商品的文生图）：确认参数后直接执行一次 */
  const targetless = resolved.targets.kind === "none";
  /** 文生图参考商品可选：未勾选时仍可执行 */
  const targetsOptional = resolved.skillId === IMAGE_GENERATION_SKILL_ID;
  const showProductPicker =
    !targetless &&
    resolved.targets.kind === "products" &&
    targets.length === 0 &&
    !targetsQuery;
  const isPictureTranslate = resolved.skillId === BATCH_PICTURE_TRANSLATE_SKILL_ID;

  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(targets.filter((t) => !t.disabledReason).map((t) => t.id)),
  );
  /** 图片翻译：每个商品下勾选的图片 URL */
  const [selectedImageUrlsByProduct, setSelectedImageUrlsByProduct] = useState<
    Record<string, string[]>
  >(() => {
    const initial: Record<string, string[]> = {};
    for (const target of targets) {
      if (target.disabledReason || !target.imageUrl) continue;
      initial[target.id] = [target.imageUrl];
    }
    return initial;
  });
  const [productImagesCache, setProductImagesCache] = useState<
    Record<string, ProductImagesCacheEntry>
  >({});

  useEffect(() => {
    if (targets.length === 0) return;
    const nextChecked = new Set(targets.filter((t) => !t.disabledReason).map((t) => t.id));
    setCheckedIds(nextChecked);
    setSelectedImageUrlsByProduct((prev) => {
      const next: Record<string, string[]> = {};
      for (const target of targets) {
        if (!nextChecked.has(target.id) || target.disabledReason) continue;
        if (prev[target.id]?.length) {
          next[target.id] = prev[target.id]!;
        } else if (target.imageUrl) {
          next[target.id] = [target.imageUrl];
        }
      }
      return next;
    });
  }, [targets]);

  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(resolved.params.map((f) => [f.key, f.value])),
  );

  // 估算（per-item，由前端乘以勾选数量）
  const [estimateLoading, setEstimateLoading] = useState(true);
  const [perItemCredits, setPerItemCredits] = useState<number | null>(null);
  const [perItemSeconds, setPerItemSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEstimateLoading(true);
    fetch("/api/task-proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "estimate",
        skillId: resolved.skillId,
        params: paramValues,
      }),
    })
      .then((res) => res.json() as Promise<TaskProposalEstimateResponse>)
      .then((json) => {
        if (cancelled) return;
        if (json.ok) {
          setPerItemCredits(json.perItemCredits);
          setPerItemSeconds(json.perItemSeconds);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setEstimateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resolved.skillId, paramValues]);

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [doneCreated, setDoneCreated] = useState(0);
  const [doneErrors, setDoneErrors] = useState<
    Array<{ index: number; targetId: string; error: string }>
  >([]);

  const selectedTargets = targets.filter(
    (t) => checkedIds.has(t.id) && !t.disabledReason,
  );
  /** 图片翻译：按勾选图片展开为执行目标；其它技能仍按商品 */
  const executeTargets = useMemo((): TaskProposalTarget[] => {
    if (!isPictureTranslate) return selectedTargets;
    const out: TaskProposalTarget[] = [];
    for (const product of selectedTargets) {
      const urls = selectedImageUrlsByProduct[product.id] ?? [];
      for (const imageUrl of urls) {
        out.push({
          id: buildPictureTranslateTargetId(product.id, imageUrl),
          productId: product.id,
          title: product.title,
          imageUrl,
        });
      }
    }
    return out;
  }, [isPictureTranslate, selectedTargets, selectedImageUrlsByProduct]);

  const descriptionReady =
    resolved.skillId !== IMAGE_GENERATION_SKILL_ID ||
    (paramValues.description ?? "").trim().length >= 4;
  const canSubmit =
    descriptionReady &&
    (targetless ||
      targetsOptional ||
      (isPictureTranslate ? executeTargets.length > 0 : selectedTargets.length > 0) ||
      targetsQuery !== null) &&
    !submitting &&
    !done;
  /** 估算/文案用的目标数量：query 模式用圈定时的匹配数快照；无目标 / 可选目标技能恒为 1 */
  const effectiveCount =
    targetless || targetsOptional
      ? 1
      : targetsQuery
        ? (queryCount ?? 0)
        : isPictureTranslate
          ? executeTargets.length
          : selectedTargets.length;
  const selectedImageCount = executeTargets.length;
  const displayTitle = resolveTaskProposalTitle(resolved, t);
  const displaySummary = resolveTaskProposalSummary(resolved, t);
  const targetKindLabel = resolveTaskProposalTargetKind(resolved.targets.kind, t);

  const toggleTarget = (target: TaskProposalTarget) => {
    if (target.disabledReason) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
    if (!isPictureTranslate) return;
    setSelectedImageUrlsByProduct((prev) => {
      if (checkedIds.has(target.id)) {
        const next = { ...prev };
        delete next[target.id];
        return next;
      }
      if (target.imageUrl) {
        return { ...prev, [target.id]: [target.imageUrl] };
      }
      return prev;
    });
  };

  const handleImageSelectionChange = useCallback((productId: string, urls: string[]) => {
    setSelectedImageUrlsByProduct((prev) => {
      if (urls.length === 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: urls };
    });
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (urls.length === 0) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const handleProductImagesCacheUpdate = useCallback(
    (productId: string, entry: ProductImagesCacheEntry) => {
      setProductImagesCache((prev) => ({ ...prev, [productId]: entry }));
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const resp = await fetch("/api/task-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "execute",
          skillId: resolved.skillId,
          params: paramValues,
          ...(targetsQuery
            ? {
                targetsQuery: {
                  kind: targetsQuery.kind,
                  ...(targetsQuery.keyword ? { keyword: targetsQuery.keyword } : {}),
                  ...(targetsQuery.status ? { status: targetsQuery.status } : {}),
                  ...(targetsQuery.tag ? { tag: targetsQuery.tag } : {}),
                  ...(targetsQuery.maxInventory != null
                    ? { maxInventory: targetsQuery.maxInventory }
                    : {}),
                },
              }
            : {
                targets: executeTargets.map((t) => ({
                  id: t.id,
                  title: t.title,
                  imageUrl: t.imageUrl ?? null,
                  ...(t.productId ? { productId: t.productId } : {}),
                })),
              }),
        }),
      });
      const json = (await resp.json()) as TaskProposalExecuteResponse;
      if (json.ok) {
        setDoneCreated(json.created);
        setDoneErrors(json.errors);
        if (json.taskIds.length > 0) {
          onTasksCreated?.(json.taskIds);
          onExecuted?.(
            buildTaskRunPayload({
              skillId: resolved.skillId,
              title: displayTitle,
              taskIds: json.taskIds,
              errors: json.errors.map((e) => ({ targetId: e.targetId, error: e.error })),
              params: Object.fromEntries(
                resolved.params.map((field) => [
                  field.key,
                  paramValues[field.key] ?? field.value,
                ]),
              ),
              paramsSummary: buildTaskRunParamsSummary({
                skillId: resolved.skillId,
                params: resolved.params,
                paramValues,
                t,
              }),
              targets: executeTargets.map((target) => ({
                id: target.productId ?? target.id,
                title: target.title,
                imageUrl: target.imageUrl ?? null,
              })),
            }),
          );
        }
      } else {
        setDoneCreated(0);
        setDoneErrors([{ index: 0, targetId: "", error: json.error }]);
      }
    } catch (e) {
      setDoneCreated(0);
      setDoneErrors([
        { index: 0, targetId: "", error: e instanceof Error ? e.message : t("workspace.shell.contextPicker.networkError") },
      ]);
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  }, [canSubmit, resolved, paramValues, executeTargets, targetsQuery, onTasksCreated, onExecuted, displayTitle, t]);

  const headerSubtitle = done
    ? t("workspace.taskProposal.card.submitted")
    : targetless || targetsOptional
      ? t("workspace.taskProposal.card.confirmParamsToRun")
      : targets.length > 0
        ? isPictureTranslate && selectedImageCount > 0
          ? t("workspace.taskProposal.card.targetsSelectedWithImages", {
              products: checkedIds.size,
              images: selectedImageCount,
              kind: targetKindLabel,
            })
          : t("workspace.taskProposal.card.targetsSelected", {
              count: targets.length,
              kind: targetKindLabel,
            })
        : targetsQuery
          ? t("workspace.taskProposal.card.queryTargets", {
              approx:
                queryCount != null
                  ? t("workspace.taskProposal.card.queryApprox", {
                      count: queryCount,
                      kind: targetKindLabel,
                    })
                  : "",
            })
          : t("workspace.taskProposal.card.waitingForTargets");

  /** 目标语言 / 源语言与对象选择同级，放进设置面板；其余参数保持普通表单 */
  const prominentFieldKeys = new Set(["targetLanguage", "sourceLanguage"]);
  const prominentFields = resolved.params.filter(
    (field) => field.type === "select" && prominentFieldKeys.has(field.key),
  );
  const plainFields = resolved.params.filter((field) => !prominentFields.includes(field));
  const hasTargetBlock = !targetless;

  return (
    <div style={{ ...cardStyle, maxWidth: embedded ? 480 : 560 }}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={titleBadgeStyle}>{displayTitle}</span>
        <span style={{ fontSize: 12, color: pageColorTokens.textSecondary, flex: 1, minWidth: 0 }}>
          {headerSubtitle}
        </span>
      </div>

      {done ? (
        <DoneState
          created={doneCreated}
          total={
            targetsQuery || targetless || targetsOptional
              ? doneCreated + doneErrors.length
              : selectedTargets.length
          }
          errors={doneErrors}
        />
      ) : (
        <>
          <div style={bodyStyle as React.CSSProperties}>
            {displaySummary ? (
              <div
                style={{
                  fontSize: 12,
                  lineHeight: 1.5,
                  color: pageColorTokens.textSecondary,
                }}
              >
                {displaySummary}
              </div>
            ) : null}

            {/* 关键字段面板：对象 + 目标语言同级 */}
            {hasTargetBlock || prominentFields.length > 0 ? (
            <div style={setupPanelStyle}>
            {targets.length > 0 ? (
              <div style={setupBlockStyle(true) as React.CSSProperties}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <div style={setupLabelStyle}>
                    <span style={setupStepStyle} aria-hidden="true">
                      1
                    </span>
                    <span style={setupTitleStyle}>
                      {isPictureTranslate
                        ? t("workspace.taskProposal.card.selectedTargetsWithImages", {
                            kind: targetKindLabel,
                            checked: checkedIds.size,
                            total: targets.length,
                            images: selectedImageCount,
                          })
                        : t("workspace.taskProposal.card.selectedTargets", {
                            kind: targetKindLabel,
                            checked: checkedIds.size,
                            total: targets.length,
                          })}
                    </span>
                  </div>
                  {onOpenProductPicker && resolved.targets.kind === "products" ? (
                    <button
                      type="button"
                      style={changeProductLinkStyle}
                      onClick={openProductPicker}
                    >
                      {t("workspace.taskProposal.card.changeProduct")}
                    </button>
                  ) : null}
                </div>
                <div
                  style={
                    (isPictureTranslate ? targetListStyleWithImages : targetListStyle) as React.CSSProperties
                  }
                >
                  {targets.map((target) => {
                    const checked = checkedIds.has(target.id) && !target.disabledReason;
                    const selectedUrls = selectedImageUrlsByProduct[target.id] ?? [];
                    return (
                      <div key={target.id}>
                        <label
                          style={targetRowStyle(checked, Boolean(target.disabledReason))}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={Boolean(target.disabledReason)}
                            onChange={() => toggleTarget(target)}
                            style={{ flexShrink: 0 }}
                          />
                          {target.imageUrl ? (
                            <img src={target.imageUrl} alt="" style={thumbStyle} />
                          ) : (
                            <div style={thumbPlaceholderStyle}>{targetKindLabel}</div>
                          )}
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontSize: 13,
                              fontWeight: 600,
                              color: pageColorTokens.textPrimary,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {target.title}
                          </span>
                          {isPictureTranslate && checked && selectedUrls.length > 0 ? (
                            <span
                              style={{
                                fontSize: 11,
                                color: pageColorTokens.textFootnote,
                                flexShrink: 0,
                              }}
                            >
                              {t("workspace.taskProposal.card.imageSelectedCount", {
                                count: selectedUrls.length,
                              })}
                            </span>
                          ) : null}
                          {target.disabledReason ? (
                            <span
                              style={{
                                fontSize: 10,
                                color: "#92400e",
                                background: "#fffbeb",
                                border: "1px solid #fde68a",
                                borderRadius: 4,
                                padding: "1px 5px",
                                flexShrink: 0,
                              }}
                            >
                              {resolveTaskProposalDisabledReason(target.disabledReason, t)}
                            </span>
                          ) : null}
                        </label>
                        {isPictureTranslate && checked && !target.disabledReason ? (
                          <TaskProposalProductImageGrid
                            productId={target.id}
                            fallbackImageUrl={target.imageUrl}
                            selectedUrls={selectedUrls}
                            cache={productImagesCache[target.id]}
                            onCacheUpdate={handleProductImagesCacheUpdate}
                            onChangeSelected={handleImageSelectionChange}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : targetless || targetsOptional ? null : targetsQuery ? (
              <div style={setupBlockStyle(true) as React.CSSProperties}>
                <div style={setupLabelStyle}>
                  <span style={setupStepStyle} aria-hidden="true">
                    1
                  </span>
                  <span style={setupTitleStyle}>
                    {t("workspace.taskProposal.card.queryByCriteria", {
                      description: describeObjectQueryI18n(targetsQuery, t),
                    })}
                  </span>
                </div>
                <div style={setupHintStyle}>
                  {t("workspace.taskProposal.card.queryHint", {
                    approx:
                      queryCount != null
                        ? t("workspace.taskProposal.card.queryApproxCount", { count: queryCount })
                        : "",
                  })}
                </div>
              </div>
            ) : showProductPicker ? (
              <div style={setupRowStyle(true) as React.CSSProperties}>
                <div style={{ minWidth: 0 }}>
                  <div style={setupLabelStyle}>
                    <span style={setupStepStyle} aria-hidden="true">
                      1
                    </span>
                    <span style={setupTitleStyle}>
                      {t("workspace.taskProposal.card.pickProduct")}
                    </span>
                  </div>
                  <div style={setupHintStyle}>
                    {t("workspace.taskProposal.card.pickProductHint")}
                  </div>
                </div>
                <button
                  type="button"
                  style={pickProductButtonStyle(!onOpenProductPicker)}
                  onClick={openProductPicker}
                  disabled={!onOpenProductPicker}
                >
                  <span aria-hidden="true">◫</span>
                  {t("workspace.taskProposal.card.pickProductButton")}
                </button>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "#92400e",
                  background: "#fffbeb",
                  padding: "10px 12px",
                }}
              >
                {t("workspace.taskProposal.card.missingTargets", { kind: targetKindLabel })}
              </div>
            )}

            {prominentFields.map((field, index) => {
              const label = resolveTaskProposalFieldLabel(field, t);
              return (
                <div
                  key={field.key}
                  style={setupRowStyle(!hasTargetBlock && index === 0) as React.CSSProperties}
                >
                  <div style={setupLabelStyle}>
                    <span style={setupStepStyle} aria-hidden="true">
                      {(hasTargetBlock ? 2 : 1) + index}
                    </span>
                    <span style={setupTitleStyle}>{label}</span>
                  </div>
                  <select
                    style={setupSelectStyle}
                    value={paramValues[field.key] ?? field.value}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    aria-label={label}
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {resolveTaskProposalParamValueLabel(field.key, opt.value, t)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
            </div>
            ) : null}

            {/* 其余参数（schema 驱动） */}
            {plainFields.map((field) => (
              <div key={field.key}>
                <div style={fieldLabelStyle}>{resolveTaskProposalFieldLabel(field, t)}</div>
                {field.type === "select" ? (
                  <select
                    style={inputStyle}
                    value={paramValues[field.key] ?? field.value}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  >
                    {(field.options ?? []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {resolveTaskProposalParamValueLabel(field.key, opt.value, t)}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    style={textareaStyle}
                    rows={4}
                    value={paramValues[field.key] ?? field.value}
                    placeholder={
                      field.key === "description"
                        ? t("workspace.taskProposal.skills.imageGeneration.placeholder", {
                            defaultValue: field.placeholder ?? "",
                          })
                        : field.placeholder
                    }
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    style={inputStyle}
                    value={paramValues[field.key] ?? field.value}
                    placeholder={
                      field.key === "description"
                        ? t("workspace.taskProposal.skills.imageGeneration.placeholder", {
                            defaultValue: field.placeholder ?? "",
                          })
                        : field.placeholder
                    }
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            {/* Estimation：未选对象时不占版面 */}
            {effectiveCount > 0 || targetless ? (
              <EstimateLine
                loading={estimateLoading}
                perItemCredits={perItemCredits}
                perItemSeconds={perItemSeconds}
                count={effectiveCount}
              />
            ) : null}
          </div>

          {/* Footer */}
          <div style={footerStyle}>
            <span
              style={{
                fontSize: 12,
                color: pageColorTokens.textFootnote,
                alignSelf: "center",
                flex: 1,
              }}
            >
              {targetless
                ? t("workspace.taskProposal.card.footerCreateOne")
                : targetsQuery
                  ? t("workspace.taskProposal.card.footerCreateQuery", {
                      approx:
                        queryCount != null
                          ? t("workspace.taskProposal.card.footerCreateQueryApprox", {
                              count: queryCount,
                            })
                          : "",
                    })
                  : selectedTargets.length === 0
                    ? t("workspace.taskProposal.card.footerSelectOne")
                    : t("workspace.taskProposal.card.footerCreateCount", {
                        count: selectedTargets.length,
                      })}
            </span>
            <button
              type="button"
              disabled={!canSubmit}
              style={confirmBtnStyle(!canSubmit)}
              onClick={() => void handleConfirm()}
            >
              {submitting
                ? t("workspace.taskProposal.card.confirmSubmitting")
                : targetless
                  ? t("workspace.taskProposal.card.confirmStart")
                  : targetsQuery
                    ? t("workspace.taskProposal.card.confirmQuery")
                    : selectedTargets.length === 0
                      ? t("workspace.taskProposal.card.confirmNeedProduct")
                      : t("workspace.taskProposal.card.confirmCreateCount", {
                          count: selectedTargets.length,
                        })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
