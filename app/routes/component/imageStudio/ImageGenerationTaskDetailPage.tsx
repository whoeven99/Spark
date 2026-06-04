import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { DialogShell } from "../shared/DialogShell";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { LogViewer } from "../aiTask/LogViewer";
import type { AITaskCreateResponse, AITaskItem, AITaskStatus, AITaskType } from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
  onTaskCreated?: (
    taskId: string,
    batchId: string,
    taskType: AITaskType,
    optimisticConfig?: Record<string, unknown>,
  ) => void;
};

type TaskRecord = {
  id: string;
  version: number;
  createdAt: string;
  sourceLabel: string;
  statusNote: string;
  previewUrl: string | null;
  taskId: string;
  optimizationComment: string;
};

function readStringField(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatTaskDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatActualElapsed(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const seconds = Math.max(
    0,
    Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        borderRadius: pageColorTokens.radiusCard,
        background: pageColorTokens.surface,
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: pageColorTokens.textPrimary }}>{title}</div>
      {children}
    </section>
  );
}

export function ImageGenerationTaskDetailPage({
  task,
  locationSearch,
  onBack,
  onTaskUpdated,
  onTaskCreated,
}: Props) {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(task.result);
  const [taskRecords, setTaskRecords] = useState<TaskRecord[]>([]);
  const [optimizeDialogOpen, setOptimizeDialogOpen] = useState(false);
  const [optimizationComment, setOptimizationComment] = useState("");
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  useEffect(() => {
    setLocalStatus(task.status);
    setLocalResult(task.result);
  }, [task.result, task.status]);

  const config = task.config as Record<string, unknown>;
  const description = readStringField(config, "description");
  const prompt = readStringField(config, "prompt");
  const provider = readStringField(localResult, "provider") ?? readStringField(config, "imageProvider");
  const imageUrl = readStringField(localResult, "imageUrl");
  const actualElapsed = formatActualElapsed(task.startedAt, task.completedAt);
  const shortId = task.id.slice(0, 8).toUpperCase();
  const summary = description ?? prompt ?? t("common.unknown");

  useEffect(() => {
    setTaskRecords((prev) => {
      const current: TaskRecord = {
        id: `${task.id}-current`,
        version: 1,
        createdAt: task.createdAt,
        sourceLabel: t("imageStudio.recordSourceInitial"),
        statusNote:
          localStatus === "running"
            ? t("imageStudio.recordStatusRunning")
            : localStatus === "failed"
              ? t("imageStudio.recordStatusFailed")
              : t("imageStudio.recordStatusReady"),
        previewUrl: imageUrl,
        taskId: task.id,
        optimizationComment: "",
      };
      const rest = prev.filter((item) => item.id !== current.id);
      return [current, ...rest];
    });
  }, [imageUrl, localStatus, t, task.createdAt, task.id]);

  const sortedTaskRecords = useMemo(
    () => [...taskRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [taskRecords],
  );

  async function handleOptimize() {
    const trimmedComment = optimizationComment.trim();
    if (!trimmedComment) {
      setOptimizeError(t("imageStudio.optimizeCommentRequired"));
      return;
    }
    const baseDescription = description ?? prompt ?? "";
    if (!baseDescription.trim()) {
      setOptimizeError(t("imageStudio.optimizeBaseDescriptionMissing"));
      return;
    }

    setOptimizing(true);
    setOptimizeError(null);
    try {
      const mergedDescription = `${baseDescription.trim()}\n\n${t("imageStudio.optimizeInstructionPrefix")}${trimmedComment}`;
      const res = await fetch(`/api/generate-image${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: mergedDescription }),
      });
      const body = (await res.json()) as AITaskCreateResponse;
      if (!body.success) {
        setOptimizeError(body.errorMsg || t("imageStudio.optimizeCreateFailed"));
        return;
      }

      onTaskCreated?.(body.taskId, body.batchId, "image_generation", {
        description: mergedDescription,
        prompt,
        imageProvider: provider,
        sourceTaskId: task.id,
        optimizationComment: trimmedComment,
      });
      setTaskRecords((prev) =>
        [
          {
            id: `${body.taskId}-derived`,
            version: prev.length + 1,
            createdAt: new Date().toISOString(),
            sourceLabel: t("imageStudio.recordSourceOptimized"),
            statusNote: t("imageStudio.recordStatusNewTaskCreated", {
              taskId: body.taskId.slice(0, 8).toUpperCase(),
            }),
            previewUrl: null,
            taskId: body.taskId,
            optimizationComment: trimmedComment,
          },
          ...prev,
        ],
      );
      shopify.toast.show(t("imageStudio.optimizeTaskCreated"));
      setOptimizeDialogOpen(false);
      setOptimizationComment("");
    } catch {
      setOptimizeError(t("imageStudio.optimizeNetworkError"));
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          border: `1px solid ${pageColorTokens.borderSubtle}`,
          borderRadius: pageColorTokens.radiusCard,
          background: "linear-gradient(160deg, #ffffff 0%, #fafbfc 100%)",
          boxShadow: pageColorTokens.shadowCard,
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 28rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <button
                type="button"
                onClick={onBack}
                style={{
                  padding: "0.35rem 0.7rem",
                  borderRadius: pageColorTokens.radiusControl,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                  background: "#ffffff",
                  color: pageColorTokens.textBody,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {t("imageStudio.backToTaskList")}
              </button>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: pageColorTokens.textSecondary,
                  padding: "0.22rem 0.48rem",
                  borderRadius: 999,
                  background: pageColorTokens.surfaceMuted,
                  border: `1px solid ${pageColorTokens.borderSubtle}`,
                }}
              >
                #{shortId}
              </span>
              <TaskStatusBadge status={localStatus} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: pageColorTokens.textPrimary }}>
              {t("imageStudio.taskSummaryTitle")}
            </div>
            <div style={{ fontSize: 13, color: pageColorTokens.textSecondary, marginTop: 6, lineHeight: 1.55 }}>
              {t("imageStudio.imageGenerationDetailSummary")}
            </div>
          </div>
          <div style={{ fontSize: 12, color: pageColorTokens.textFootnote, fontWeight: 600 }}>
            {t("aiTask.createdAtLabel", { value: formatTaskDate(task.createdAt, i18n.language) })}
          </div>
        </div>

        <div
          style={{
            padding: "0.95rem 1rem",
            borderRadius: pageColorTokens.radiusControl,
            background: "#ffffff",
            border: `1px solid ${pageColorTokens.borderSubtle}`,
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 13,
            lineHeight: 1.6,
            color: pageColorTokens.textSecondary,
          }}
        >
          <span>{t("imageStudio.taskDetailLabel")}</span>
          {provider ? <span>{t("imageStudio.detailProvider", { value: provider })}</span> : null}
          {actualElapsed ? (
            <>
              <span style={{ color: pageColorTokens.textFootnote }}>|</span>
              <span>{t("imageStudio.detailElapsed", { value: actualElapsed })}</span>
            </>
          ) : null}
          <span style={{ color: pageColorTokens.textFootnote }}>|</span>
          <span
            style={{
              minWidth: 0,
              maxWidth: "min(100%, 420px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "inline-block",
              verticalAlign: "bottom",
              color: pageColorTokens.textPrimary,
            }}
            title={summary}
          >
            {t("imageStudio.taskInputValue", { value: summary })}
          </span>
        </div>
      </div>

      <Section title={t("imageStudio.reviewSectionTitle")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
              {t("imageStudio.originalContentLabel")}
            </div>
            <div
              style={{
                padding: "0.9rem",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: pageColorTokens.surfaceSubtle,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {description ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
                    {t("imageStudio.detailDescription")}
                  </div>
                  <div style={{ fontSize: 13, color: pageColorTokens.textBody, lineHeight: 1.6, marginTop: 6 }}>
                    {description}
                  </div>
                </div>
              ) : null}
              {prompt ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
                    {t("imageStudio.detailPrompt")}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: pageColorTokens.textBody,
                      lineHeight: 1.6,
                      marginTop: 6,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {prompt}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
              {t("imageStudio.generatedContentLabel")}
            </div>
            <div
              style={{
                padding: "0.9rem",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid rgba(0, 166, 124, 0.18)`,
                background: "#f8fffc",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={t("imageGeneration.generatedImageAlt")}
                  style={{
                    width: "100%",
                    maxHeight: 560,
                    objectFit: "contain",
                    borderRadius: pageColorTokens.radiusControl,
                    border: `1px solid ${pageColorTokens.borderSubtle}`,
                    background: "#ffffff",
                  }}
                />
              ) : (
                <div
                  style={{
                    padding: "1rem",
                    borderRadius: pageColorTokens.radiusControl,
                    background: "#ffffff",
                    border: `1px dashed ${pageColorTokens.borderSubtle}`,
                    fontSize: 13,
                    color: pageColorTokens.textSecondary,
                    textAlign: "center",
                    minHeight: 220,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {localStatus === "failed"
                    ? task.errorMsg ?? t("imageGeneration.submitFailed")
                    : t("imageStudio.detailNoImage")}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setOptimizeDialogOpen(true)}
                  disabled={optimizing}
                  style={{
                    padding: "8px 14px",
                    borderRadius: pageColorTokens.radiusControl,
                    background: pageColorTokens.brandGreen,
                    color: "#ffffff",
                    border: "none",
                    cursor: optimizing ? "default" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t("imageStudio.actionOptimizeAgain")}
                </button>
                {imageUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}
                    style={{
                      padding: "8px 14px",
                      borderRadius: pageColorTokens.radiusControl,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                      background: "#ffffff",
                      color: pageColorTokens.textPrimary,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {t("imageGeneration.openImage")}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title={t("imageStudio.resultRecordsTitle")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sortedTaskRecords.map((record) => (
            <div
              key={record.id}
              style={{
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                background: "#ffffff",
                padding: "0.8rem 0.85rem",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "0.2rem 0.5rem",
                      borderRadius: 999,
                      background: pageColorTokens.surfaceMuted,
                      color: pageColorTokens.textSecondary,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    V{record.version}
                  </span>
                  <span style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>{record.sourceLabel}</span>
                </div>
                <span style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
                  {formatTaskDate(record.createdAt, i18n.language)}
                </span>
              </div>
              <div style={{ fontSize: 13, color: pageColorTokens.textBody, lineHeight: 1.6 }}>
                {record.statusNote}
              </div>
              {record.optimizationComment ? (
                <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, lineHeight: 1.5 }}>
                  {t("imageStudio.recordOptimizationValue", { value: record.optimizationComment })}
                </div>
              ) : null}
              {record.previewUrl ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => window.open(record.previewUrl!, "_blank", "noopener,noreferrer")}
                    style={{
                      padding: "7px 12px",
                      borderRadius: pageColorTokens.radiusControl,
                      background: "#ffffff",
                      color: pageColorTokens.textBody,
                      border: `1px solid ${pageColorTokens.borderSubtle}`,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {t("imageStudio.actionViewRecordImage")}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      {optimizeError ? (
        <div
          style={{
            fontSize: 12,
            color: pageColorTokens.criticalText,
            background: pageColorTokens.criticalBg,
            padding: "8px 10px",
            borderRadius: pageColorTokens.radiusControl,
            border: "1px solid rgba(220, 38, 38, 0.15)",
          }}
        >
          {optimizeError}
        </div>
      ) : null}

      {localStatus === "running" ? (
        <LogViewer
          taskId={task.id}
          taskType={task.taskType}
          status={localStatus}
          locationSearch={locationSearch}
          startedAt={task.startedAt}
          completedAt={task.completedAt}
          initialLogs={[]}
          defaultLogsOpen
          onStatusChange={(status, nextResult) => {
            setLocalStatus(status);
            if (nextResult) setLocalResult(nextResult);
            onTaskUpdated?.(task.id, status, nextResult);
          }}
        />
      ) : null}

      <DialogShell
        open={optimizeDialogOpen}
        width={520}
        closeDisabled={optimizing}
        onClose={() => setOptimizeDialogOpen(false)}
        title={t("imageStudio.optimizeDialogTitle")}
        description={t("imageStudio.optimizeDialogDescription")}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setOptimizeDialogOpen(false)}
              disabled={optimizing}
              style={{
                padding: "8px 14px",
                borderRadius: pageColorTokens.radiusControl,
                background: "#ffffff",
                color: pageColorTokens.textBody,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                cursor: optimizing ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleOptimize()}
              disabled={optimizing}
              style={{
                padding: "8px 16px",
                borderRadius: pageColorTokens.radiusControl,
                background: optimizing ? pageColorTokens.surfaceMuted : pageColorTokens.brandGreen,
                color: optimizing ? pageColorTokens.textSecondary : "#ffffff",
                border: "none",
                cursor: optimizing ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {optimizing ? t("imageStudio.optimizing") : t("imageStudio.createOptimizeTask")}
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              padding: "0.8rem",
              borderRadius: pageColorTokens.radiusControl,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              background: pageColorTokens.surfaceSubtle,
              fontSize: 12,
              color: pageColorTokens.textSecondary,
              lineHeight: 1.6,
            }}
          >
            {t("imageStudio.optimizeBaseInputSummary", { value: summary })}
          </div>
          <textarea
            value={optimizationComment}
            onChange={(event) => setOptimizationComment(event.currentTarget.value)}
            disabled={optimizing}
            rows={5}
            placeholder={t("imageStudio.optimizeCommentPlaceholder")}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.65rem 0.75rem",
              borderRadius: pageColorTokens.radiusControl,
              border: `1px solid ${pageColorTokens.borderInput}`,
              fontSize: 13,
              fontFamily: "inherit",
              lineHeight: 1.55,
              resize: "vertical",
              background: "#fff",
            }}
          />
        </div>
      </DialogShell>
    </div>
  );
}
