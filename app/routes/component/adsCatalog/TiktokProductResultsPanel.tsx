import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageFieldLabelStyle } from "../../page/pageUiStyles";
import type { AITaskStatus, TiktokCatalogProductResult } from "../../../lib/aiTaskTypes";

type Props = {
  taskId: string;
  locationSearch: string;
  productResults: TiktokCatalogProductResult[];
  feedLogId?: string;
  feedLogStatus?: string;
  feedCsvSummary?: string;
  taskStatus?: AITaskStatus;
  onRefreshed?: (rows: TiktokCatalogProductResult[]) => void;
};

const statusColor: Record<string, string> = {
  success: "#0f7a52",
  failed: pageColorTokens.criticalText,
  warning: "#b98900",
  pending: pageColorTokens.textSecondary,
  unknown: pageColorTokens.textSecondary,
};

const AUTO_REFRESH_MS = 10_000;

function formatFeedLogStatusLabel(
  status: string | undefined,
  awaitingTiktok: boolean,
  t: (key: string, opts?: Record<string, string>) => string,
): string | null {
  if (awaitingTiktok) {
    return t("adsCatalog.tiktokFeedLogStatusAwaiting");
  }
  if (!status) return null;
  const key = `adsCatalog.tiktokFeedLogStatus_${status}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return t("adsCatalog.tiktokFeedLogStatus", { status });
}

export function TiktokProductResultsPanel({
  taskId,
  locationSearch,
  productResults,
  feedLogId,
  feedLogStatus,
  feedCsvSummary,
  taskStatus,
  onRefreshed,
}: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(productResults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(feedLogStatus);
  const [summary, setSummary] = useState(feedCsvSummary);
  const [awaitingTiktok, setAwaitingTiktok] = useState(false);
  const [hasLocalRefresh, setHasLocalRefresh] = useState(false);

  // 任务切换时重置，接受服务端初始数据。
  useEffect(() => {
    setHasLocalRefresh(false);
    setRows(productResults);
    setStatus(feedLogStatus);
    setSummary(feedCsvSummary);
    setAwaitingTiktok(false);
  }, [taskId]);

  // 父级轮询更新任务终态；运行中或有本地刷新时保留 Feed 明细，避免被旧结果覆盖闪烁。
  useEffect(() => {
    if (hasLocalRefresh) return;
    if (taskStatus === "running" && feedLogId) return;
    setRows(productResults);
    setStatus(feedLogStatus);
    setSummary(feedCsvSummary);
  }, [hasLocalRefresh, taskStatus, feedLogId, productResults, feedLogStatus, feedCsvSummary]);

  const refresh = useCallback(async () => {
    if (!feedLogId) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams(
        locationSearch.startsWith("?") ? locationSearch.slice(1) : locationSearch,
      );
      params.set("taskId", taskId);
      const resp = await fetch(`/api/ads-catalog/tiktok-feed-log?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        productResults?: TiktokCatalogProductResult[];
        feedLogStatus?: string;
        feedCsvSummary?: string;
        awaitingTiktok?: boolean;
      };
      if (!resp.ok || !data.ok || !data.productResults) {
        throw new Error(data.error ?? t("adsCatalog.authError"));
      }
      setHasLocalRefresh(true);
      setRows(data.productResults);
      setStatus(data.feedLogStatus);
      setSummary(data.feedCsvSummary);
      setAwaitingTiktok(Boolean(data.awaitingTiktok));
      onRefreshed?.(data.productResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }, [feedLogId, locationSearch, onRefreshed, t, taskId]);

  useEffect(() => {
    if (!feedLogId || taskStatus !== "running") return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [feedLogId, refresh, taskStatus]);

  if (rows.length === 0) return null;

  const statusLabel = formatFeedLogStatusLabel(status, awaitingTiktok, t);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={pageFieldLabelStyle}>{t("adsCatalog.tiktokProductResultsTitle")}</div>
        {feedLogId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1px solid ${pageColorTokens.borderSubtle}`,
              background: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {busy ? t("adsCatalog.tiktokProductResultsRefreshing") : t("adsCatalog.tiktokProductResultsRefresh")}
          </button>
        ) : null}
      </div>
      {(statusLabel || summary) && (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary, marginTop: 6 }}>
          {statusLabel}
          {summary ? (
            <>
              {statusLabel ? " · " : ""}
              {summary}
            </>
          ) : null}
        </div>
      )}
      {error ? <div style={{ color: pageColorTokens.criticalText, fontSize: 12, marginTop: 6 }}>{error}</div> : null}
      <div
        style={{
          marginTop: 8,
          border: `1px solid ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusControl,
          overflow: "auto",
          maxHeight: 360,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: pageColorTokens.surfaceMuted, textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>{t("adsCatalog.detailErrorProduct")}</th>
              <th style={{ padding: "8px 10px" }}>{t("adsCatalog.tiktokProductResultStatus")}</th>
              <th style={{ padding: "8px 10px" }}>{t("adsCatalog.detailErrorReason")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId}>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: `1px solid ${pageColorTokens.border}`,
                    fontFamily: "ui-monospace, monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {row.productId}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: `1px solid ${pageColorTokens.border}`,
                    color: statusColor[row.status] ?? pageColorTokens.textPrimary,
                    fontWeight: 600,
                  }}
                >
                  {t(`adsCatalog.tiktokProductResultStatus_${row.status}`)}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderTop: `1px solid ${pageColorTokens.border}`,
                  }}
                >
                  {row.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
