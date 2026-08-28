/**
 * 今日健康诊断与待办聊天卡。
 * 视觉对齐 TaskProposalCard：绿徽章头、白底、原生绿按钮。
 * live：拉取/刷新快照；无订单时可回补；刷新/回补成功后通过 onDiagnosisRefreshed 追加结果卡。
 * result：只读展示已落盘的 view 快照。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  HealthDiagnosisApiResponse,
  HealthDiagnosisCardView,
  HealthDiagnosisFormPayload,
} from "../../../lib/healthDiagnosisCardPayload";
import { healthDiagnosisResultPayload } from "../../../lib/healthDiagnosisCardPayload";
import type { OrderBackfillApiResponse } from "../../../lib/orderBackfillTypes";
import { useEmbeddedNavigate } from "../../../hooks/useEmbeddedNavigate";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  embedded?: boolean;
  initialPayload?: HealthDiagnosisFormPayload;
  /** 刷新/回补成功：工作台追加「诊断结果」对话轮 */
  onDiagnosisRefreshed?: (payload: HealthDiagnosisFormPayload) => void;
};

const DEFAULT_BACKFILL_DAYS = 30;

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

const bodyStyle: CSSProperties = {
  padding: "14px 14px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const setupPanelStyle = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 12,
  background: pageColorTokens.surface,
  overflow: "hidden",
} as const;

const setupBlockStyle = (first: boolean): CSSProperties => ({
  padding: "11px 12px",
  ...(first ? null : { borderTop: `1px solid ${pageColorTokens.borderSubtle}` }),
});

const metricsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const metricChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 10,
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  color: pageColorTokens.textSecondary,
};

const metricValueStyle: CSSProperties = {
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
  fontSize: 14,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 700,
  color: pageColorTokens.textPrimary,
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 6,
};

const listItemStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  background: pageColorTokens.surfaceSubtle,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "grid",
  gap: 4,
};

const itemTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: pageColorTokens.textPrimary,
};

const itemMetaStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: pageColorTokens.textFootnote,
  lineHeight: 1.45,
};

const footerStyle = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  padding: "12px 14px",
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
  background: pageColorTokens.surface,
} as const;

const confirmBtnStyle = (disabled: boolean): CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 10,
  border: "none",
  background: disabled ? pageColorTokens.borderSubtle : pageColorTokens.brandGreen,
  color: disabled ? pageColorTokens.textSecondary : "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
});

const secondaryBtnStyle = (disabled: boolean): CSSProperties => ({
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid ${pageColorTokens.border}`,
  background: pageColorTokens.surface,
  color: disabled ? pageColorTokens.textFootnote : pageColorTokens.textSecondary,
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
});

const emptyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: pageColorTokens.textSecondary,
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
  color: pageColorTokens.criticalText,
};

function buildApiUrl(path: string, search: string): string {
  const qs = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `${path}${qs}`;
}

function DiagnosisBody({
  view,
  loading,
  refreshing,
  backfilling,
  error,
}: {
  view: HealthDiagnosisCardView | null;
  loading: boolean;
  refreshing: boolean;
  backfilling: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();

  if (loading) {
    return <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.loading")}</p>;
  }
  if (error) {
    return <p style={errorStyle}>{error}</p>;
  }
  if (backfilling) {
    return <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.backfillingHint")}</p>;
  }
  if (refreshing) {
    return <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.refreshingHint")}</p>;
  }
  if (!view) {
    return <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.loadFailed")}</p>;
  }
  if (!view.hasData) {
    return <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.noData")}</p>;
  }

  return (
    <div style={setupPanelStyle}>
      <div style={setupBlockStyle(true)}>
        <p style={sectionTitleStyle}>{t("workspace.shell.chat.healthDiagnosis.metricsTitle")}</p>
        <div style={{ ...metricsRowStyle, marginTop: 8 }}>
          <span style={metricChipStyle}>
            <span>{t("workspace.shell.chat.healthDiagnosis.metricRisk")}</span>
            <span style={metricValueStyle}>{view.overview.activeRiskCount}</span>
          </span>
          <span style={metricChipStyle}>
            <span>{t("workspace.shell.chat.healthDiagnosis.metricWatch")}</span>
            <span style={metricValueStyle}>{view.overview.watchRiskCount}</span>
          </span>
          <span style={metricChipStyle}>
            <span>{t("workspace.shell.chat.healthDiagnosis.metricOpenTasks")}</span>
            <span style={metricValueStyle}>{view.overview.openTaskCount}</span>
          </span>
        </div>
      </div>

      <div style={setupBlockStyle(false)}>
        <p style={sectionTitleStyle}>{t("workspace.shell.chat.healthDiagnosis.priorityTasks")}</p>
        {view.priorityTasks.length > 0 ? (
          <ul style={{ ...listStyle, marginTop: 8 }}>
            {view.priorityTasks.map((task) => (
              <li key={task.id} style={listItemStyle}>
                <p style={itemTitleStyle}>{task.title}</p>
                {task.triggerReason ? <p style={itemMetaStyle}>{task.triggerReason}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ ...emptyStyle, marginTop: 8 }}>
            {t("workspace.shell.chat.healthDiagnosis.noPriorityTasks")}
          </p>
        )}
      </div>

      {view.riskItems.length > 0 ? (
        <div style={setupBlockStyle(false)}>
          <p style={sectionTitleStyle}>{t("workspace.shell.chat.healthDiagnosis.riskItems")}</p>
          <ul style={{ ...listStyle, marginTop: 8 }}>
            {view.riskItems.slice(0, 4).map((item) => (
              <li key={`${item.status}-${item.name}`} style={listItemStyle}>
                <p style={itemTitleStyle}>
                  {t(`workspace.shell.chat.healthDiagnosis.status.${item.status}`)}
                  {" · "}
                  {item.name}
                </p>
                {item.summary ? <p style={itemMetaStyle}>{item.summary}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function HealthDiagnosisChatCard({
  embedded = false,
  initialPayload,
  onDiagnosisRefreshed,
}: Props) {
  const shopify = useAppBridge();
  const navigate = useEmbeddedNavigate();
  const { t, i18n } = useTranslation();
  const isResult = initialPayload?.mode === "result";
  const [view, setView] = useState<HealthDiagnosisCardView | null>(
    () => initialPayload?.view ?? null,
  );
  const [loading, setLoading] = useState(!isResult && !initialPayload?.view);
  const [refreshing, setRefreshing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultBackfillDays, setDefaultBackfillDays] = useState(DEFAULT_BACKFILL_DAYS);

  const search = typeof window !== "undefined" ? window.location.search : "";
  const busy = loading || refreshing || backfilling;

  const applyResponse = useCallback(
    (body: HealthDiagnosisApiResponse) => {
      if (typeof body.defaultBackfillDays === "number" && body.defaultBackfillDays > 0) {
        setDefaultBackfillDays(body.defaultBackfillDays);
      }
      if (!body.success || !body.response) {
        setError(
          body.success === false
            ? body.errorMsg
            : t("workspace.shell.chat.healthDiagnosis.loadFailed"),
        );
        return false;
      }
      setError(null);
      setView(body.response);
      return true;
    },
    [t],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("/api/health-diagnosis", search), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        setError(t("workspace.shell.chat.healthDiagnosis.loadFailed"));
        return;
      }
      const body = (await res.json()) as HealthDiagnosisApiResponse;
      applyResponse(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.shell.chat.healthDiagnosis.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [applyResponse, search, t]);

  const refreshDiagnosis = useCallback(async () => {
    if (busy) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("/api/health-diagnosis", search), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ intent: "refresh" }),
      });
      if (!res.ok) {
        const msg = t("workspace.shell.chat.healthDiagnosis.refreshFailed");
        setError(msg);
        shopify.toast.show(msg);
        return null;
      }
      const body = (await res.json()) as HealthDiagnosisApiResponse;
      const ok = applyResponse(body);
      if (!ok || !body.success || !body.response) {
        const msg =
          body.success === false
            ? body.errorMsg
            : t("workspace.shell.chat.healthDiagnosis.refreshFailed");
        shopify.toast.show(msg);
        return null;
      }
      setView(body.response);
      shopify.toast.show(t("workspace.shell.chat.healthDiagnosis.refreshDone"));
      onDiagnosisRefreshed?.(healthDiagnosisResultPayload(body.response));
      return body.response;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("workspace.shell.chat.healthDiagnosis.refreshFailed");
      setError(msg);
      shopify.toast.show(msg);
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [applyResponse, busy, onDiagnosisRefreshed, search, shopify, t]);

  const backfillOrders = useCallback(async () => {
    if (busy) return;
    setBackfilling(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("/api/order-backfill", search), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "backfill_orders",
          daysBack: defaultBackfillDays,
        }),
      });
      const body = (await res.json()) as OrderBackfillApiResponse;
      if (!res.ok || !body.success || !body.response) {
        const msg =
          body.success === false
            ? body.errorMsg
            : t("workspace.shell.chat.healthDiagnosis.backfillFailed");
        setError(msg);
        shopify.toast.show(msg);
        return;
      }
      shopify.toast.show(
        t("workspace.shell.chat.healthDiagnosis.backfillDone", {
          synced: body.response.synced,
          days: body.response.daysBack,
        }),
      );

      // 回补完成后强制刷新诊断并追加结果卡
      setBackfilling(false);
      setRefreshing(true);
      try {
        const refreshRes = await fetch(buildApiUrl("/api/health-diagnosis", search), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ intent: "refresh" }),
        });
        const refreshBody = (await refreshRes.json()) as HealthDiagnosisApiResponse;
        const ok = applyResponse(refreshBody);
        if (ok && refreshBody.success && refreshBody.response) {
          setView(refreshBody.response);
          onDiagnosisRefreshed?.(healthDiagnosisResultPayload(refreshBody.response));
        }
      } finally {
        setRefreshing(false);
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t("workspace.shell.chat.healthDiagnosis.backfillFailed");
      setError(msg);
      shopify.toast.show(msg);
    } finally {
      setBackfilling(false);
    }
  }, [
    applyResponse,
    busy,
    defaultBackfillDays,
    onDiagnosisRefreshed,
    search,
    shopify,
    t,
  ]);

  useEffect(() => {
    if (isResult) return;
    if (initialPayload?.view) {
      setView(initialPayload.view);
      setLoading(false);
      return;
    }
    void loadOverview();
  }, [initialPayload?.view, isResult, loadOverview]);

  const generatedLabel = view?.generatedAt
    ? new Date(view.generatedAt).toLocaleString(i18n.language || undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const headerSubtitle = view
    ? t("workspace.shell.chat.healthDiagnosis.snapshotMeta", {
        date: view.snapshotDate,
        generated: generatedLabel ?? "—",
      })
    : t("workspace.shell.chat.healthDiagnosis.subtitle");

  const badgeLabel = isResult
    ? t("workspace.shell.chat.healthDiagnosis.resultBadge")
    : t("workspace.shell.chat.healthDiagnosis.liveBadge");

  const showNoDataActions = !isResult && Boolean(view && !view.hasData);

  return (
    <div
      style={{ ...cardStyle, maxWidth: embedded ? 480 : 560 }}
      data-embedded={embedded ? "true" : undefined}
    >
      <div style={headerStyle}>
        <span style={titleBadgeStyle}>{badgeLabel}</span>
        <span style={{ fontSize: 12, color: pageColorTokens.textSecondary, flex: 1, minWidth: 0 }}>
          {headerSubtitle}
        </span>
      </div>

      <div style={bodyStyle}>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: pageColorTokens.textSecondary,
          }}
        >
          {isResult
            ? t("workspace.shell.chat.healthDiagnosis.resultSummary")
            : showNoDataActions
              ? t("workspace.shell.chat.healthDiagnosis.noDataSummary", {
                  days: defaultBackfillDays,
                })
              : t("workspace.shell.chat.healthDiagnosis.liveSummary")}
        </div>

        <DiagnosisBody
          view={view}
          loading={loading}
          refreshing={refreshing}
          backfilling={backfilling}
          error={error}
        />
      </div>

      {!isResult ? (
        <div style={footerStyle}>
          {showNoDataActions ? (
            <>
              <button
                type="button"
                style={secondaryBtnStyle(busy)}
                disabled={busy}
                onClick={() => navigate("/app/settings/data")}
              >
                {t("workspace.shell.chat.healthDiagnosis.openSettings")}
              </button>
              <button
                type="button"
                style={confirmBtnStyle(busy)}
                disabled={busy}
                onClick={() => {
                  void backfillOrders();
                }}
              >
                {backfilling
                  ? t("workspace.shell.chat.healthDiagnosis.backfilling")
                  : t("workspace.shell.chat.healthDiagnosis.backfill", {
                      days: defaultBackfillDays,
                    })}
              </button>
            </>
          ) : (
            <button
              type="button"
              style={confirmBtnStyle(busy)}
              disabled={busy}
              onClick={() => {
                void refreshDiagnosis();
              }}
            >
              {refreshing
                ? t("workspace.shell.chat.healthDiagnosis.refreshing")
                : t("workspace.shell.chat.healthDiagnosis.refresh")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
