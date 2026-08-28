/** 对话右侧"当前上下文 + 本会话任务"侧栏（从 WorkspaceAppShellPage 的 ChatPanel 拆出，仅桌面端展示）。 */
import { useTranslation } from "react-i18next";
import { describeObjectQueryI18n } from "../../../lib/objectQuerySpec";
import {
  resolveTaskRunParamsSummaryLines,
  resolveTaskRunTitle,
} from "../../../lib/taskProposalDisplay";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import type { OpenWorkspaceTasksOptions } from "../../../lib/productImproveDeepLink";
import {
  WORKSPACE_HISTORY_UPLOAD_NOTE,
  type ConversationTaskRunEntry,
  type QueryableObjectType,
} from "./types";
import { formatTimeLabel } from "./messageTransforms";
import type { WorkspaceContextController } from "./useWorkspaceContext";
import {
  ctxFileIconStyle,
  ctxGroupLabelStyle,
  ctxGroupStyle,
  ctxItemRowStyle,
  ctxItemTitleStyle,
  ctxThumbPlaceholderStyle,
  ctxThumbStyle,
  sectionTitleStyle,
  sidePanelStyle,
  surfaceCardStyle,
} from "./styles";

// ── 本会话任务：状态聚合与配色 ───────────────────────────────────────────────

type TaskStatusBucket = "running" | "pendingReview" | "applied" | "succeeded" | "failed";

const bucketColors: Record<TaskStatusBucket, string> = {
  applied: "#00a67c",
  succeeded: "#00a67c",
  pendingReview: "#f0a01d",
  running: "#4070f4",
  failed: "#d72c0d",
};

const bucketOrder: TaskStatusBucket[] = ["applied", "succeeded", "pendingReview", "running", "failed"];

function statusToBucket(status: AITaskStatus): TaskStatusBucket {
  if (status === "running") return "running";
  if (status === "pending_review" || status === "scored") return "pendingReview";
  if (status === "applied") return "applied";
  if (status === "failed" || status === "cancelled") return "failed";
  return "succeeded";
}

function countBuckets(tasks: AITaskItem[]): Record<TaskStatusBucket, number> {
  const counts: Record<TaskStatusBucket, number> = {
    running: 0,
    pendingReview: 0,
    applied: 0,
    succeeded: 0,
    failed: 0,
  };
  for (const task of tasks) counts[statusToBucket(task.status)] += 1;
  return counts;
}

const MAX_RUN_ROWS = 5;

function ConversationTasksCard({
  taskRuns,
  tasksById,
  onOpenTasks,
  onLocateRun,
}: {
  taskRuns: ConversationTaskRunEntry[];
  tasksById: Record<string, AITaskItem>;
  onOpenTasks: (opts?: OpenWorkspaceTasksOptions) => void;
  onLocateRun: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const bucketLabels: Record<TaskStatusBucket, string> = {
    succeeded: t("workspace.shell.contextSidebar.bucketSucceeded"),
    applied: t("workspace.shell.contextSidebar.bucketApplied"),
    pendingReview: t("workspace.shell.contextSidebar.bucketPendingReview"),
    running: t("workspace.shell.contextSidebar.bucketRunning"),
    failed: t("workspace.shell.contextSidebar.bucketFailed"),
  };
  const allTasks = taskRuns
    .flatMap((run) => run.taskIds)
    .map((id) => tasksById[id])
    .filter((task): task is AITaskItem => Boolean(task));
  const totalTaskCount = taskRuns.reduce((count, run) => count + run.taskIds.length, 0);
  const counts = countBuckets(allTasks);
  const knownTotal = allTasks.length;

  return (
    <div style={surfaceCardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={sectionTitleStyle}>{t("workspace.shell.contextSidebar.tasksTitle")}</div>
        {counts.running > 0 ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "1px 8px",
              borderRadius: 999,
              background: "rgba(64,112,244,0.1)",
              color: "#2c4fc4",
            }}
          >
            {t("workspace.shell.contextSidebar.tasksRunningBadge", { count: counts.running })}
          </span>
        ) : null}
      </div>

      {taskRuns.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8c9196", lineHeight: 1.6 }}>
          {t("workspace.shell.contextSidebar.tasksEmpty")}
        </div>
      ) : (
        <>
          {knownTotal > 0 ? (
            <>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                {bucketOrder
                  .filter((bucket) => counts[bucket] > 0)
                  .map((bucket) => (
                    <div
                      key={bucket}
                      style={{ flex: counts[bucket], background: bucketColors[bucket] }}
                    />
                  ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "#6d7175", marginBottom: 12 }}>
                {bucketOrder
                  .filter((bucket) => counts[bucket] > 0)
                  .map((bucket) => (
                    <span key={bucket}>
                      <span style={{ color: bucketColors[bucket] }}>●</span>{" "}
                      {bucketLabels[bucket]} {counts[bucket]}
                    </span>
                  ))}
              </div>
            </>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {taskRuns.slice(0, MAX_RUN_ROWS).map((run) => {
              const runTasks = run.taskIds
                .map((id) => tasksById[id])
                .filter((task): task is AITaskItem => Boolean(task));
              const runCounts = countBuckets(runTasks);
              const needsReview = runCounts.pendingReview > 0;
              const allDone =
                runTasks.length === run.taskIds.length &&
                runTasks.length > 0 &&
                runCounts.running === 0 &&
                runCounts.pendingReview === 0;
              const doneCount =
                runCounts.succeeded +
                runCounts.applied +
                runCounts.failed +
                runCounts.pendingReview;
              const timeLabel = formatTimeLabel(new Date(run.startedAt));
              const displayTitle =
                run.skillId != null
                  ? resolveTaskRunTitle({ skillId: run.skillId, title: run.title }, t)
                  : run.title;
              const paramsLines =
                run.skillId != null
                  ? resolveTaskRunParamsSummaryLines(
                      {
                        skillId: run.skillId,
                        title: run.title,
                        paramsSummary: run.paramsSummary,
                        params: run.params,
                      },
                      t,
                    )
                  : run.paramsSummary;
              const metaParts = [
                t("workspace.shell.contextSidebar.tasksSummary", {
                  runs: 1,
                  tasks: run.taskIds.length,
                }),
                ...(Number.isNaN(new Date(run.startedAt).getTime()) ? [] : [timeLabel]),
                ...(paramsLines.length > 0 ? [paramsLines[0]] : []),
              ];
              return (
                <button
                  key={run.runId}
                  type="button"
                  onClick={() => {
                    if (!needsReview) {
                      onLocateRun(run.runId);
                      return;
                    }
                    const firstPendingProduct = runTasks.find(
                      (task) =>
                        task.status === "pending_review" &&
                        task.taskType === "product_improve",
                    );
                    if (firstPendingProduct) {
                      onOpenTasks({
                        taskType: "product_improve",
                        taskId: firstPendingProduct.id,
                        intent: "review",
                      });
                      return;
                    }
                    onOpenTasks();
                  }}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${needsReview ? "#fde68a" : "#e1e3e5"}`,
                    background: needsReview ? "#fffbeb" : "#ffffff",
                    borderRadius: 10,
                    padding: "8px 10px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: needsReview ? "#92400e" : "#202223",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayTitle}
                    </span>
                    {needsReview ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#9a5b00", flexShrink: 0 }}>
                        {t("workspace.shell.contextSidebar.bucketPendingReview")} →
                      </span>
                    ) : allDone ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: runCounts.failed > 0 ? "#fff0ee" : "#e9f7ef",
                          color: runCounts.failed > 0 ? "#8f2f1f" : "#0f5132",
                          flexShrink: 0,
                        }}
                      >
                        {runCounts.failed > 0
                          ? `${bucketLabels.failed} ${runCounts.failed}`
                          : runCounts.applied > 0 && runCounts.succeeded === 0
                            ? bucketLabels.applied
                            : bucketLabels.succeeded}
                      </span>
                    ) : runTasks.length > 0 ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 7px",
                          borderRadius: 999,
                          background: "rgba(64,112,244,0.1)",
                          color: "#2c4fc4",
                          flexShrink: 0,
                        }}
                      >
                        {doneCount}/{run.taskIds.length}
                      </span>
                    ) : null}
                  </div>
                  <span style={{ fontSize: 11, color: needsReview ? "#b45309" : "#8c9196" }}>
                    {metaParts.join(" · ")}
                    {run.errorCount > 0 ? ` · ${run.errorCount}` : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid #e1e3e5",
              marginTop: 12,
              paddingTop: 10,
            }}
          >
            <span style={{ fontSize: 11, color: "#8c9196" }}>
              {t("workspace.shell.contextSidebar.tasksSummary", {
                runs: taskRuns.length,
                tasks: totalTaskCount,
              })}
            </span>
            <button
              type="button"
              onClick={() => onOpenTasks()}
              style={{
                fontSize: 12,
                color: "rgba(44,110,203,0.9)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontWeight: 600,
              }}
            >
              {t("workspace.shell.contextSidebar.viewAllTasks")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ChatContextSidebar({
  context,
  taskRuns,
  tasksById,
  onOpenTasks,
  onLocateRun,
}: {
  context: WorkspaceContextController;
  taskRuns: ConversationTaskRunEntry[];
  tasksById: Record<string, AITaskItem>;
  onOpenTasks: (opts?: OpenWorkspaceTasksOptions) => void;
  onLocateRun: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const {
    selectedObjectsByType,
    objectQuerySelectionByType,
    fileRolesById,
    selectedFileIds,
    localFiles,
    totalSelectedObjects,
    totalQuerySelections,
    filledContextCount,
    clearContext,
  } = context;

  return (
    <section style={{ ...sidePanelStyle, alignSelf: "start" }}>
      <div style={surfaceCardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={sectionTitleStyle}>{t("workspace.shell.contextSidebar.title")}</div>
          {filledContextCount > 0 ? (
            <button
              type="button"
              style={{ fontSize: 11, color: "#6d7175", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={clearContext}
            >
              {t("workspace.shell.contextSidebar.clear")}
            </button>
          ) : null}
        </div>

        {/* 按条件圈定（执行时重新求值） */}
        {(["product", "article"] as QueryableObjectType[]).map((type) => {
          const query = objectQuerySelectionByType[type];
          if (!query) return null;
          return (
            <div key={type} style={ctxGroupStyle}>
              <div style={ctxGroupLabelStyle}>
                {t("workspace.shell.contextSidebar.queryTagged", {
                  kind:
                    type === "product"
                      ? t("workspace.shell.chat.toolProduct")
                      : t("workspace.shell.chat.toolArticle"),
                })}
                {query.matchCount != null
                  ? t("workspace.shell.contextSidebar.queryApprox", { count: query.matchCount })
                  : ""}
              </div>
              <div style={{ fontSize: 12, color: "#202223", lineHeight: 1.5 }}>
                {describeObjectQueryI18n(query, t)}
              </div>
              <div style={{ fontSize: 11, color: "#8c9196", marginTop: 2 }}>
                {t("workspace.shell.contextSidebar.queryHint")}
              </div>
            </div>
          );
        })}

        {/* Products */}
        {selectedObjectsByType.product.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>
              {t("workspace.shell.contextSidebar.products", {
                count: selectedObjectsByType.product.length,
              })}
            </div>
            {selectedObjectsByType.product.map((item) => (
              <div key={item.id} style={ctxItemRowStyle}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" style={ctxThumbStyle} />
                ) : (
                  <div style={ctxThumbPlaceholderStyle}>{t("workspace.shell.contextPicker.thumbProduct")}</div>
                )}
                <span style={ctxItemTitleStyle}>{item.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Articles */}
        {selectedObjectsByType.article.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>
              {t("workspace.shell.contextSidebar.articles", {
                count: selectedObjectsByType.article.length,
              })}
            </div>
            {selectedObjectsByType.article.map((item) => (
              <div key={item.id} style={ctxItemRowStyle}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" style={ctxThumbStyle} />
                ) : (
                  <div style={ctxThumbPlaceholderStyle}>{t("workspace.shell.contextPicker.thumbArticle")}</div>
                )}
                <span style={ctxItemTitleStyle}>{item.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Files */}
        {selectedFileIds.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>
              {t("workspace.shell.contextSidebar.files", { count: selectedFileIds.length })}
            </div>
            {selectedFileIds.map((id) => {
              const file = localFiles.find((f) => f.id === id);
              if (!file) return null;
              return (
                <div key={id} style={ctxItemRowStyle}>
                  <div style={ctxFileIconStyle}>↑</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ctxItemTitleStyle}>{file.name}</div>
                    <div style={{ fontSize: 11, color: "#8c9196", marginTop: 1 }}>
                      {t(`workspace.shell.contextPicker.fileRole.${fileRolesById[id] ?? "reference"}`)}
                      {file.note
                        ? ` · ${
                            file.note === WORKSPACE_HISTORY_UPLOAD_NOTE
                              ? t("workspace.shell.contextPicker.historyUpload")
                              : file.note
                          }`
                        : ""}
                    </div>
                  </div>
                  {file.uploading ? (
                    <span style={{ fontSize: 10, color: "#6d7175", flexShrink: 0 }}>
                      {t("workspace.shell.contextSidebar.uploading")}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Empty state */}
        {totalSelectedObjects === 0 && totalQuerySelections === 0 && selectedFileIds.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8c9196", lineHeight: 1.6 }}>
            {t("workspace.shell.contextSidebar.empty")}
          </div>
        ) : null}
      </div>

      <ConversationTasksCard
        taskRuns={taskRuns}
        tasksById={tasksById}
        onOpenTasks={onOpenTasks}
        onLocateRun={onLocateRun}
      />
    </section>
  );
}
