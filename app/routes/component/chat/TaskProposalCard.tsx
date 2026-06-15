/**
 * TaskProposalCard — 通用任务确认卡片（TaskProposal 协议，阶段 1）。
 *
 * 任意 Skill 发出 task_proposal 后由本卡片统一渲染：
 *   目标对象勾选 + schema 驱动的参数表单 + 执行估算（分桶 EWMA） + 确认执行。
 * 执行走 POST /api/task-proposal，按 skillId 路由到服务端注册表。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TaskProposalExecuteResponse,
  TaskProposalEstimateResponse,
  TaskProposalPayload,
  TaskProposalTarget,
} from "../../../lib/taskProposalPayload";
import { mergeTaskProposalTargets } from "../../../lib/taskProposalPayload";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import { describeObjectQuery } from "../../../lib/objectQuerySpec";
import type { BatchTaskProduct } from "../../../lib/batchTasksFormPayload";
import { buildTaskRunPayload, type TaskRunPayload } from "../../../lib/taskRunPayload";
import { pageColorTokens } from "../../page/pageUiStyles";

// ─── Styles（与 BatchTasksChatCard 视觉对齐） ────────────────────────────────

const cardStyle = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 12,
  background: pageColorTokens.surface,
  overflow: "hidden",
  fontSize: 13,
} as const;

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
} as const;

const bodyStyle = {
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
} as const;

const targetListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 220,
  overflowY: "auto",
} as const;

const targetRowStyle = (checked: boolean, disabled: boolean) =>
  ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${checked ? "#c9cccf" : pageColorTokens.borderSubtle}`,
    background: checked ? "#fff" : pageColorTokens.surfaceSubtle,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  }) as const;

const thumbStyle = {
  width: 36,
  height: 36,
  borderRadius: 6,
  objectFit: "cover" as const,
  background: pageColorTokens.surfaceMuted,
  flexShrink: 0,
} as const;

const thumbPlaceholderStyle = {
  width: 36,
  height: 36,
  borderRadius: 6,
  background: pageColorTokens.surfaceMuted,
  display: "grid",
  placeItems: "center",
  fontSize: 11,
  color: pageColorTokens.textFootnote,
  flexShrink: 0,
} as const;

const fieldLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
  marginBottom: 4,
} as const;

const inputStyle = {
  width: "100%",
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  background: "#fff",
  color: pageColorTokens.textPrimary,
} as const;

const estimateBoxStyle = {
  fontSize: 12,
  color: pageColorTokens.textSecondary,
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 8,
  padding: "7px 10px",
  display: "flex",
  alignItems: "center",
  gap: 6,
} as const;

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "10px 14px",
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surfaceMuted,
} as const;

const confirmBtnStyle = (disabled: boolean) =>
  ({
    padding: "7px 16px",
    borderRadius: 8,
    border: "none",
    background: disabled ? pageColorTokens.borderSubtle : pageColorTokens.brandGreenDark,
    color: disabled ? pageColorTokens.textSecondary : "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  }) as const;

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
        {created > 0 ? `✓ 已成功创建 ${created}/${total} 个任务` : "任务创建失败"}
      </div>
      {created > 0 ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          可在「任务列表」面板查看执行进度与结果。
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
              还有 {errors.length - 3} 个失败
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estimate line ────────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

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
  if (loading) {
    return <div style={estimateBoxStyle}>⏱ 正在估算执行成本…</div>;
  }
  if (perItemCredits == null && perItemSeconds == null) {
    return (
      <div style={estimateBoxStyle}>
        ⏱ 暂无历史执行数据；完成首批任务后预估会自动校准。
      </div>
    );
  }
  const parts: string[] = [];
  if (perItemCredits != null && count > 0) {
    parts.push(`预计消耗 ~${perItemCredits * count} 积分`);
  }
  if (perItemSeconds != null && count > 0) {
    parts.push(`单项约 ${formatDuration(perItemSeconds)}`);
  }
  return (
    <div style={estimateBoxStyle}>
      <span>⏱ {parts.join(" · ")}</span>
      <span style={{ color: pageColorTokens.textFootnote }}>（基于历史执行自动校准）</span>
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
  onTasksCreated?: (taskIds: string[]) => void;
  /** 执行成功后回调（工作台用于向对话追加「任务已开始」新一轮） */
  onExecuted?: (run: TaskRunPayload) => void;
};

export function TaskProposalCard({
  embedded = false,
  proposal,
  contextProducts = [],
  contextProductQuery = null,
  onTasksCreated,
  onExecuted,
}: Props) {
  const resolved = useMemo(
    () => mergeTaskProposalTargets(proposal, contextProducts, contextProductQuery),
    [proposal, contextProducts, contextProductQuery],
  );
  const targets = resolved.targets.items;
  /** 按条件圈定模式：无具体 items 时按 query 执行（服务端重新求值） */
  const targetsQuery = targets.length === 0 ? (resolved.targets.query ?? null) : null;
  const queryCount = targetsQuery?.matchCount ?? null;
  /** 无目标对象技能（如文生图）：确认参数后直接执行一次 */
  const targetless = resolved.targets.kind === "none";

  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(targets.filter((t) => !t.disabledReason).map((t) => t.id)),
  );
  useEffect(() => {
    if (targets.length === 0) return;
    setCheckedIds(new Set(targets.filter((t) => !t.disabledReason).map((t) => t.id)));
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
  const canSubmit =
    (targetless || selectedTargets.length > 0 || targetsQuery !== null) && !submitting && !done;
  /** 估算/文案用的目标数量：query 模式用圈定时的匹配数快照；无目标技能恒为 1 */
  const effectiveCount = targetless ? 1 : targetsQuery ? (queryCount ?? 0) : selectedTargets.length;

  const toggleTarget = (target: TaskProposalTarget) => {
    if (target.disabledReason) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  };

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
                targets: selectedTargets.map((t) => ({
                  id: t.id,
                  title: t.title,
                  imageUrl: t.imageUrl ?? null,
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
              title: resolved.title,
              taskIds: json.taskIds,
              errors: json.errors.map((e) => ({ targetId: e.targetId, error: e.error })),
              paramsSummary: resolved.params.map((field) => {
                const value = paramValues[field.key] ?? field.value;
                const optionLabel = field.options?.find((o) => o.value === value)?.label;
                return `${field.label}：${optionLabel ?? value}`;
              }),
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
        { index: 0, targetId: "", error: e instanceof Error ? e.message : "网络错误" },
      ]);
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  }, [canSubmit, resolved, paramValues, selectedTargets, targetsQuery, onTasksCreated, onExecuted]);

  const targetKindLabel =
    resolved.targets.kind === "products"
      ? "商品"
      : resolved.targets.kind === "articles"
        ? "文章"
        : resolved.targets.kind === "orders"
          ? "订单"
          : "对象";

  return (
    <div style={{ ...cardStyle, maxWidth: embedded ? 480 : 560 }}>
      {/* Header */}
      <div style={headerStyle}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: "#4070f4",
            color: "#fff",
          }}
        >
          {resolved.title}
        </span>
        <span style={{ fontSize: 12, color: pageColorTokens.textSecondary, flex: 1 }}>
          {done
            ? "已提交"
            : targetless
              ? "确认参数后开始执行"
              : targets.length > 0
                ? `${targets.length} 个${targetKindLabel} · 确认后批量创建`
                : targetsQuery
                  ? `按条件圈定${queryCount != null ? ` · 约 ${queryCount} 个${targetKindLabel}` : ""} · 执行时重新求值`
                  : "等待补充操作对象"}
        </span>
      </div>

      {done ? (
        <DoneState
          created={doneCreated}
          total={
            targetsQuery || targetless
              ? doneCreated + doneErrors.length
              : selectedTargets.length
          }
          errors={doneErrors}
        />
      ) : (
        <>
          <div style={bodyStyle as React.CSSProperties}>
            {resolved.summary ? (
              <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
                {resolved.summary}
              </div>
            ) : null}

            {/* Targets */}
            {targets.length > 0 ? (
              <div>
                <div style={fieldLabelStyle}>
                  已选{targetKindLabel}（{checkedIds.size} / {targets.length}）
                </div>
                <div style={targetListStyle as React.CSSProperties}>
                  {targets.map((target) => {
                    const checked = checkedIds.has(target.id) && !target.disabledReason;
                    return (
                      <label
                        key={target.id}
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
                            fontSize: 12,
                            fontWeight: 600,
                            color: pageColorTokens.textPrimary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {target.title}
                        </span>
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
                            {target.disabledReason}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : targetless ? null : targetsQuery ? (
              <div
                style={{
                  fontSize: 12,
                  color: pageColorTokens.textPrimary,
                  background: pageColorTokens.surfaceSubtle,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  按条件圈定：{describeObjectQuery(targetsQuery)}
                </span>
                <span style={{ color: pageColorTokens.textFootnote }}>
                  {queryCount != null ? `圈定时匹配约 ${queryCount} 个；` : ""}
                  执行时将按条件重新求值（适合保存为自动化后定期执行）
                </span>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12,
                  color: "#92400e",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  padding: "7px 10px",
                }}
              >
                ⚠️ 未找到操作对象，请先在工作台下方工具栏选择{targetKindLabel}后重新发送。
              </div>
            )}

            {/* Params（schema 驱动） */}
            {resolved.params.map((field) => (
              <div key={field.key}>
                <div style={fieldLabelStyle}>{field.label}</div>
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
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    value={paramValues[field.key] ?? field.value}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            {/* Estimation */}
            <EstimateLine
              loading={estimateLoading}
              perItemCredits={perItemCredits}
              perItemSeconds={perItemSeconds}
              count={effectiveCount}
            />
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
                ? "将创建 1 个任务"
                : targetsQuery
                  ? `将按条件创建任务${queryCount != null ? `（约 ${queryCount} 个）` : ""}`
                  : selectedTargets.length === 0
                    ? "请至少勾选 1 个对象"
                    : `将创建 ${selectedTargets.length} 个任务`}
            </span>
            <button
              type="button"
              disabled={!canSubmit}
              style={confirmBtnStyle(!canSubmit)}
              onClick={() => void handleConfirm()}
            >
              {submitting
                ? "创建中…"
                : targetless
                  ? "确认开始执行"
                  : targetsQuery
                    ? "按条件确认创建"
                    : `确认创建 ${selectedTargets.length} 个任务`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
