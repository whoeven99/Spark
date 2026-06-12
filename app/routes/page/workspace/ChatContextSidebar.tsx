/** 对话右侧"当前上下文 + 本会话任务"侧栏（从 WorkspaceAppShellPage 的 ChatPanel 拆出，仅桌面端展示）。 */
import { describeObjectQuery, objectQueryKindLabel } from "../../../lib/objectQuerySpec";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";
import {
  fileRoleLabels,
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
  sectionTextStyle,
  sectionTitleStyle,
  sidePanelStyle,
  surfaceCardStyle,
} from "./styles";

// ── 本会话任务：状态聚合与配色 ───────────────────────────────────────────────

type TaskStatusBucket = "running" | "pendingReview" | "succeeded" | "failed";

const bucketMeta: Record<TaskStatusBucket, { label: string; color: string }> = {
  succeeded: { label: "完成", color: "#00a67c" },
  pendingReview: { label: "待审核", color: "#f0a01d" },
  running: { label: "进行中", color: "#4070f4" },
  failed: { label: "失败", color: "#d72c0d" },
};

const bucketOrder: TaskStatusBucket[] = ["succeeded", "pendingReview", "running", "failed"];

function statusToBucket(status: AITaskStatus): TaskStatusBucket {
  if (status === "running") return "running";
  if (status === "pending_review") return "pendingReview";
  if (status === "failed" || status === "cancelled") return "failed";
  return "succeeded";
}

function countBuckets(tasks: AITaskItem[]): Record<TaskStatusBucket, number> {
  const counts: Record<TaskStatusBucket, number> = {
    running: 0,
    pendingReview: 0,
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
  onOpenTasks: () => void;
  onLocateRun: (runId: string) => void;
}) {
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
        <div style={sectionTitleStyle}>本会话任务</div>
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
            进行中 {counts.running}
          </span>
        ) : null}
      </div>

      {taskRuns.length === 0 ? (
        <div style={{ fontSize: 13, color: "#8c9196", lineHeight: 1.6 }}>
          通过任务确认卡片执行后，任务会出现在这里。
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
                      style={{ flex: counts[bucket], background: bucketMeta[bucket].color }}
                    />
                  ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "#6d7175", marginBottom: 12 }}>
                {bucketOrder
                  .filter((bucket) => counts[bucket] > 0)
                  .map((bucket) => (
                    <span key={bucket}>
                      <span style={{ color: bucketMeta[bucket].color }}>●</span>{" "}
                      {bucketMeta[bucket].label} {counts[bucket]}
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
              const doneCount = runCounts.succeeded + runCounts.failed + runCounts.pendingReview;
              const timeLabel = formatTimeLabel(new Date(run.startedAt));
              const metaParts = [
                `${run.taskIds.length} 个任务`,
                ...(Number.isNaN(new Date(run.startedAt).getTime()) ? [] : [timeLabel]),
                ...(run.paramsSummary.length > 0 ? [run.paramsSummary[0]] : []),
              ];
              return (
                <button
                  key={run.runId}
                  type="button"
                  onClick={() => (needsReview ? onOpenTasks() : onLocateRun(run.runId))}
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
                      {run.title}
                    </span>
                    {needsReview ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#9a5b00", flexShrink: 0 }}>
                        去审核 →
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
                        {runCounts.failed > 0 ? `失败 ${runCounts.failed}` : "完成"}
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
                    {run.errorCount > 0 ? ` · ${run.errorCount} 个创建失败` : ""}
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
              共 {taskRuns.length} 次执行 · {totalTaskCount} 个任务
            </span>
            <button
              type="button"
              onClick={onOpenTasks}
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
              查看全部任务 →
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
  onOpenTasks: () => void;
  onLocateRun: (runId: string) => void;
}) {
  const {
    selectedObjectsByType,
    objectQuerySelectionByType,
    constraints,
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
          <div style={sectionTitleStyle}>当前上下文</div>
          {filledContextCount > 0 ? (
            <button
              type="button"
              style={{ fontSize: 11, color: "#6d7175", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={clearContext}
            >
              清空
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
                {objectQueryKindLabel(type)} · 按条件圈定
                {query.matchCount != null ? ` · 约 ${query.matchCount} 个` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#202223", lineHeight: 1.5 }}>
                {describeObjectQuery(query)}
              </div>
              <div style={{ fontSize: 11, color: "#8c9196", marginTop: 2 }}>
                执行时按条件重新求值，不固化 ID
              </div>
            </div>
          );
        })}

        {/* Products */}
        {selectedObjectsByType.product.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>商品 · {selectedObjectsByType.product.length} 个</div>
            {selectedObjectsByType.product.map((item) => (
              <div key={item.id} style={ctxItemRowStyle}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" style={ctxThumbStyle} />
                ) : (
                  <div style={ctxThumbPlaceholderStyle}>品</div>
                )}
                <span style={ctxItemTitleStyle}>{item.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Articles */}
        {selectedObjectsByType.article.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>文章 · {selectedObjectsByType.article.length} 篇</div>
            {selectedObjectsByType.article.map((item) => (
              <div key={item.id} style={ctxItemRowStyle}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" style={ctxThumbStyle} />
                ) : (
                  <div style={ctxThumbPlaceholderStyle}>文</div>
                )}
                <span style={ctxItemTitleStyle}>{item.title}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Files */}
        {selectedFileIds.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>文件 · {selectedFileIds.length} 个</div>
            {selectedFileIds.map((id) => {
              const file = localFiles.find((f) => f.id === id);
              if (!file) return null;
              return (
                <div key={id} style={ctxItemRowStyle}>
                  <div style={ctxFileIconStyle}>↑</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={ctxItemTitleStyle}>{file.name}</div>
                    <div style={{ fontSize: 11, color: "#8c9196", marginTop: 1 }}>
                      {fileRoleLabels[fileRolesById[id] ?? "reference"]}
                      {file.note ? ` · ${file.note}` : ""}
                    </div>
                  </div>
                  {file.uploading ? (
                    <span style={{ fontSize: 10, color: "#6d7175", flexShrink: 0 }}>上传中…</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Constraints */}
        {constraints.length > 0 ? (
          <div style={ctxGroupStyle}>
            <div style={ctxGroupLabelStyle}>约束 · {constraints.length} 条</div>
            {constraints.map((constraint) => (
              <div key={constraint} style={{ fontSize: 12, color: "#202223", lineHeight: 1.6 }}>
                ⚐ {constraint}
              </div>
            ))}
          </div>
        ) : null}

        {/* Empty state */}
        {totalSelectedObjects === 0 && totalQuerySelections === 0 && selectedFileIds.length === 0 && constraints.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8c9196", lineHeight: 1.6 }}>
            在下方选择商品、文章或上传文件，它们会出现在这里并随消息一起发给 AI。
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
