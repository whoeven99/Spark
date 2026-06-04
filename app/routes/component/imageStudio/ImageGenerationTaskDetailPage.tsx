import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { LogViewer } from "../aiTask/LogViewer";
import type { AITaskItem, AITaskStatus } from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
  onTaskUpdated?: (taskId: string, status: AITaskStatus, result?: Record<string, unknown>) => void;
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
}: Props) {
  const { t, i18n } = useTranslation();
  const [localStatus, setLocalStatus] = useState<AITaskStatus>(task.status);
  const [localResult, setLocalResult] = useState<Record<string, unknown> | null>(task.result);

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
                #{task.id.slice(0, 8).toUpperCase()}
              </span>
              <TaskStatusBadge status={localStatus} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: pageColorTokens.textPrimary }}>
              {t("imageStudio.taskGoalGenerate")}
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
          {provider ? <span>{t("imageStudio.detailProvider", { value: provider })}</span> : null}
          {actualElapsed ? (
            <>
              {provider ? <span style={{ color: pageColorTokens.textFootnote }}>|</span> : null}
              <span>{t("imageStudio.detailElapsed", { value: actualElapsed })}</span>
            </>
          ) : null}
        </div>
      </div>

      <Section title={t("imageStudio.taskInputSummary")}>
        {description ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
              {t("imageStudio.detailDescription")}
            </div>
            <div style={{ fontSize: 13, color: pageColorTokens.textBody, lineHeight: 1.6 }}>{description}</div>
          </div>
        ) : null}
        {prompt ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: pageColorTokens.textSecondary }}>
              {t("imageStudio.detailPrompt")}
            </div>
            <div
              style={{
                fontSize: 13,
                color: pageColorTokens.textBody,
                lineHeight: 1.6,
                background: pageColorTokens.surfaceSubtle,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                borderRadius: pageColorTokens.radiusControl,
                padding: "0.8rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {prompt}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title={t("imageStudio.detailResultImage")}>
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={t("imageGeneration.generatedImageAlt")}
              style={{
                width: "100%",
                maxHeight: 560,
                objectFit: "contain",
                borderRadius: pageColorTokens.radiusControl,
                border: `1px solid ${pageColorTokens.borderSubtle}`,
                background: pageColorTokens.surfaceSubtle,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
            </div>
          </>
        ) : (
          <div
            style={{
              padding: "1rem",
              borderRadius: pageColorTokens.radiusControl,
              background: pageColorTokens.surfaceSubtle,
              border: `1px dashed ${pageColorTokens.borderSubtle}`,
              fontSize: 13,
              color: pageColorTokens.textSecondary,
              textAlign: "center",
            }}
          >
            {localStatus === "failed" ? task.errorMsg ?? t("imageGeneration.submitFailed") : t("imageStudio.detailNoImage")}
          </div>
        )}
      </Section>

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
    </div>
  );
}
