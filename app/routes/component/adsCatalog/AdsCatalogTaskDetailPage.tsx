import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "../../page/pageUiStyles";
import { LogViewer } from "../aiTask/LogViewer";
import { TaskStatusBadge } from "../aiTask/TaskStatusBadge";
import { TiktokProductResultsPanel } from "./TiktokProductResultsPanel";
import type {
  AdsCatalogPlatform,
  AdsCatalogSyncTaskResult,
  AITaskItem,
  AITaskStatus,
  TiktokCatalogProductResult,
} from "../../../lib/aiTaskTypes";

type Props = {
  task: AITaskItem;
  locationSearch: string;
  onBack: () => void;
  onTaskUpdated?: (
    taskId: string,
    status: AITaskStatus,
    result?: Record<string, unknown>,
  ) => void;
};

function readResult(task: AITaskItem): AdsCatalogSyncTaskResult | null {
  if (!task.result) return null;
  const r = task.result as Record<string, unknown>;
  if (typeof r.platform !== "string") return null;
  return r as unknown as AdsCatalogSyncTaskResult;
}

function platformLabelKey(platform: AdsCatalogPlatform): string {
  if (platform === "google") return "adsCatalog.platformGoogle";
  if (platform === "tiktok") return "adsCatalog.platformTiktok";
  return "adsCatalog.platformFacebook";
}

function readPlatform(task: AITaskItem, result: AdsCatalogSyncTaskResult | null): AdsCatalogPlatform {
  const fromConfig = (task.config as Record<string, unknown>)?.platform;
  if (fromConfig === "google" || fromConfig === "tiktok" || fromConfig === "facebook") {
    return fromConfig;
  }
  if (result?.platform === "google" || result?.platform === "tiktok" || result?.platform === "facebook") {
    return result.platform;
  }
  return "facebook";
}

function readTiktokSyncMode(
  task: AITaskItem,
  result: AdsCatalogSyncTaskResult | null,
): "shopify_official" | "api_managed" | null {
  if (result?.syncMode === "shopify_official" || result?.syncMode === "api_managed") {
    return result.syncMode;
  }
  const fromConfig = (task.config as Record<string, unknown>)?.bindingMode;
  if (fromConfig === "shopify_official" || fromConfig === "api_managed") {
    return fromConfig;
  }
  return null;
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

export function AdsCatalogTaskDetailPage({ task, locationSearch, onBack, onTaskUpdated }: Props) {
  const { t, i18n } = useTranslation();
  const [liveTask, setLiveTask] = useState(task);
  const [productResults, setProductResults] = useState<TiktokCatalogProductResult[]>(
    () => readResult(task)?.productResults ?? [],
  );

  useEffect(() => {
    setLiveTask(task);
    const nextResults = readResult(task)?.productResults;
    if (nextResults?.length) {
      setProductResults(nextResults);
    }
  }, [task]);

  const result = readResult(liveTask);
  const platform = readPlatform(liveTask, result);
  const platformLabel = t(platformLabelKey(platform));
  const tiktokSyncMode = platform === "tiktok" ? readTiktokSyncMode(liveTask, result) : null;

  const displayStatus = useMemo((): AITaskStatus => {
    if (liveTask.status === "succeeded" && result && result.succeeded === 0 && result.failed > 0) {
      return "failed";
    }
    return liveTask.status;
  }, [liveTask.status, result]);

  useEffect(() => {
    if (displayStatus !== "running") return;

    let cancelled = false;

    async function pollTask() {
      try {
        const params = new URLSearchParams(
          locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
        );
        const resp = await fetch(`/api/ai-task/${encodeURIComponent(liveTask.id)}?${params.toString()}`);
        if (!resp.ok || cancelled) return;
        const body = (await resp.json()) as { task?: AITaskItem };
        if (!body.task || cancelled) return;

        setLiveTask(body.task);
        const nextResults = readResult(body.task)?.productResults;
        if (nextResults?.length) {
          setProductResults(nextResults);
        }
        onTaskUpdated?.(body.task.id, body.task.status, body.task.result ?? undefined);
      } catch {
        // ignore polling errors
      }
    }

    void pollTask();
    const timer = window.setInterval(() => {
      void pollTask();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [displayStatus, liveTask.id, locationSearch, onTaskUpdated]);

  const showTiktokProductResults =
    platform === "tiktok" && productResults.length > 0;

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
          {t("adsCatalog.detailTaskId", { id: liveTask.id.slice(0, 8).toUpperCase() })}
          {" · "}
          {new Intl.DateTimeFormat(i18n.language).format(new Date(liveTask.createdAt))}
        </div>

        {tiktokSyncMode === "shopify_official" && (
          <div
            style={{
              background: pageColorTokens.surfaceMuted,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              padding: "10px 12px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {t("adsCatalog.detailSyncModeOfficial")}
          </div>
        )}
        {tiktokSyncMode === "api_managed" && (
          <div style={{ ...pageHintTextStyle, margin: 0 }}>
            {result?.uploadMethod === "product_file"
              ? t("adsCatalog.detailSyncModeFeed")
              : t("adsCatalog.detailSyncModeApi")}
            {result?.catalogId ? (
              <>
                <br />
                {t("adsCatalog.detailCatalogId", { id: result.catalogId })}
              </>
            ) : null}
            {result?.feedLogId ? (
              <>
                <br />
                {t("adsCatalog.detailFeedLogId", { id: result.feedLogId })}
              </>
            ) : null}
          </div>
        )}

        {result ? (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <Metric label={t("adsCatalog.detailTotal")} value={String(result.totalProcessed)} />
            <Metric label={t("adsCatalog.detailSucceeded")} value={String(result.succeeded)} />
            <Metric label={t("adsCatalog.detailFailed")} value={String(result.failed)} />
          </div>
        ) : null}

        {liveTask.errorMsg ? (
          <div
            style={{
              background: pageColorTokens.criticalBg,
              color: pageColorTokens.criticalText,
              padding: "10px 12px",
              borderRadius: pageColorTokens.radiusControl,
              fontSize: 13,
            }}
          >
            {liveTask.errorMsg}
          </div>
        ) : null}

        {result && result.errors.length > 0 && !showTiktokProductResults ? (
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

        {showTiktokProductResults ? (
          <TiktokProductResultsPanel
            taskId={liveTask.id}
            locationSearch={locationSearch}
            productResults={productResults}
            feedLogId={result?.feedLogId}
            feedLogStatus={result?.feedLogStatus}
            feedCsvSummary={result?.feedCsvSummary}
            taskStatus={displayStatus}
            onRefreshed={setProductResults}
          />
        ) : null}

        <div>
          <div style={pageFieldLabelStyle}>{t("adsCatalog.detailLogsTitle")}</div>
          <LogViewer
            taskId={liveTask.id}
            taskType="ads_catalog_sync"
            status={displayStatus}
            locationSearch={locationSearch}
            startedAt={liveTask.startedAt}
            completedAt={liveTask.completedAt}
            defaultLogsOpen
            onStatusChange={(status, nextResult) => {
              if (nextResult) {
                const parsed = nextResult as unknown as AdsCatalogSyncTaskResult;
                if (parsed.productResults?.length) {
                  setProductResults(parsed.productResults);
                }
              }
              onTaskUpdated?.(liveTask.id, status, nextResult);
            }}
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
