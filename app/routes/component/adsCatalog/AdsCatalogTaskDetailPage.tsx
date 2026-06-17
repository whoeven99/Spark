import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "../../page/pageUiStyles";
import { LogViewer } from "../aiTask/LogViewer";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import type {
  AdsCatalogSyncTaskResult,
  AITaskItem,
  AITaskStatus,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
};

function readResult(task: AITaskItem): AdsCatalogSyncTaskResult | null {
  if (!task.result) return null;
  const r = task.result as Record<string, unknown>;
  if (typeof r.platform !== "string") return null;
  return r as unknown as AdsCatalogSyncTaskResult;
}

const sectionStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  boxShadow: pageColorTokens.shadowCard,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

export function AdsCatalogTaskDetailPage({ task, locationSearch, onBack }: Props) {
  const { t, i18n } = useTranslation();
  const result = readResult(task);
  const platform =
    (task.config as Record<string, unknown>)?.platform === "google" ? "google" : "facebook";
  const platformLabel = t(
    platform === "facebook" ? "adsCatalog.platformFacebook" : "adsCatalog.platformGoogle",
  );

  const displayStatus = useMemo((): AITaskStatus => {
    if (task.status === "succeeded" && result && result.succeeded === 0 && result.failed > 0) {
      return "failed";
    }
    return task.status;
  }, [result, task.status]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: "flex-start",
          padding: "8px 14px",
          borderRadius: pageColorTokens.radiusControl,
          border: `1px solid ${pageColorTokens.borderSubtle}`,
          background: pageColorTokens.surface,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {t("adsCatalog.backToTaskList")}
      </button>

      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {t("adsCatalog.detailTitle", { platform: platformLabel })}
          </h2>
          <TaskStatusBadge status={displayStatus} size="medium" />
        </div>

        <div style={pageHintTextStyle}>
          {t("adsCatalog.detailTaskId", { id: task.id.slice(0, 8).toUpperCase() })}
          {" · "}
          {new Intl.DateTimeFormat(i18n.language).format(new Date(task.createdAt))}
        </div>

        {result ? (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <Metric label={t("adsCatalog.detailTotal")} value={String(result.totalProcessed)} />
            <Metric label={t("adsCatalog.detailSucceeded")} value={String(result.succeeded)} />
            <Metric label={t("adsCatalog.detailFailed")} value={String(result.failed)} />
          </div>
        ) : null}

        {task.errorMsg ? (
          <div
            style={{
              background: pageColorTokens.criticalBg,
              color: pageColorTokens.criticalText,
              padding: "10px 12px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
            }}
          >
            {task.errorMsg}
          </div>
        ) : null}

        {result && result.errors.length > 0 ? (
          <div>
            <div style={pageFieldLabelStyle}>{t("adsCatalog.detailErrorsTitle")}</div>
            <div
              style={{
                marginTop: 8,
                border: `1px solid ${pageColorTokens.border}`,
                borderRadius: pageColorTokens.radiusControl,
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: pageColorTokens.surfaceMuted, textAlign: "left" }}>
                    <th style={{ padding: "8px 10px" }}>{t("adsCatalog.detailErrorProduct")}</th>
                    <th style={{ padding: "8px 10px" }}>{t("adsCatalog.detailErrorReason")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((entry) => (
                    <tr key={`${entry.productId}-${entry.reason}`}>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderTop: `1px solid ${pageColorTokens.border}`,
                          fontFamily: "ui-monospace, monospace",
                          wordBreak: "break-all",
                        }}
                      >
                        {entry.productId}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          borderTop: `1px solid ${pageColorTokens.border}`,
                          color: pageColorTokens.criticalText,
                        }}
                      >
                        {entry.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div>
          <div style={pageFieldLabelStyle}>{t("adsCatalog.detailLogsTitle")}</div>
          <LogViewer
            taskId={task.id}
            taskType="ads_catalog_sync"
            status={displayStatus}
            locationSearch={locationSearch}
            startedAt={task.startedAt}
            completedAt={task.completedAt}
            defaultLogsOpen
          />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: pageColorTokens.radiusControl,
        background: pageColorTokens.surfaceMuted,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
      }}
    >
      <div style={{ fontSize: 11, color: pageColorTokens.textSecondary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: pageColorTokens.textPrimary }}>{value}</div>
    </div>
  );
}
