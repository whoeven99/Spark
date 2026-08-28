/**
 * 今日健康诊断与待办聊天卡：展示规则引擎快照摘要，支持「刷新诊断」（不调 LLM）。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import type {
  HealthDiagnosisApiResponse,
  HealthDiagnosisCardView,
  HealthDiagnosisFormPayload,
} from "../../../lib/healthDiagnosisCardPayload";
import { pageColorTokens } from "../../page/pageUiStyles";

type Props = {
  embedded?: boolean;
  initialPayload?: HealthDiagnosisFormPayload;
};

const panelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  borderRadius: 10,
  background: pageColorTokens.surfaceSubtle,
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "grid",
  gap: 4,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  fontWeight: 650,
  color: pageColorTokens.textPrimary,
};

const metaStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
};

const bodyStyle: CSSProperties = {
  padding: "12px 14px",
  display: "grid",
  gap: 12,
};

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
  borderRadius: 8,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: "0.8rem",
  color: pageColorTokens.textSecondary,
};

const metricValueStyle: CSSProperties = {
  fontWeight: 650,
  color: pageColorTokens.textPrimary,
  fontSize: "0.95rem",
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: pageColorTokens.textSecondary,
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 8,
};

const listItemStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: pageColorTokens.surface,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "grid",
  gap: 4,
};

const itemTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  fontWeight: 600,
  color: pageColorTokens.textPrimary,
};

const itemMetaStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: pageColorTokens.textFootnote,
  lineHeight: 1.4,
};

const footerStyle: CSSProperties = {
  padding: "10px 14px 12px",
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
  display: "flex",
  justifyContent: "flex-end",
};

const emptyStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  color: pageColorTokens.textSecondary,
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.85rem",
  color: "#b42318",
};

function buildApiUrl(path: string, search: string): string {
  const qs = search.startsWith("?") ? search : search ? `?${search}` : "";
  return `${path}${qs}`;
}

export function HealthDiagnosisChatCard({ embedded = false }: Props) {
  const shopify = useAppBridge();
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<HealthDiagnosisCardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = typeof window !== "undefined" ? window.location.search : "";

  const applyResponse = useCallback((body: HealthDiagnosisApiResponse) => {
    if (!body.success || !body.response) {
      setError(body.success === false ? body.errorMsg : t("workspace.shell.chat.healthDiagnosis.loadFailed"));
      setView(null);
      return;
    }
    setError(null);
    setView(body.response);
  }, [t]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl("/api/health-diagnosis", search), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const body = (await res.json()) as HealthDiagnosisApiResponse;
      applyResponse(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.shell.chat.healthDiagnosis.loadFailed"));
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [applyResponse, search, t]);

  const refreshDiagnosis = useCallback(async () => {
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
      const body = (await res.json()) as HealthDiagnosisApiResponse;
      applyResponse(body);
      if (body.success) {
        shopify.toast.show(t("workspace.shell.chat.healthDiagnosis.refreshDone"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("workspace.shell.chat.healthDiagnosis.refreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [applyResponse, search, shopify, t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const generatedLabel = view?.generatedAt
    ? new Date(view.generatedAt).toLocaleString(i18n.language || undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div style={panelStyle} data-embedded={embedded ? "true" : undefined}>
      <div style={headerStyle}>
        <p style={titleStyle}>{t("workspace.shell.chat.healthDiagnosis.title")}</p>
        <p style={metaStyle}>
          {view
            ? t("workspace.shell.chat.healthDiagnosis.snapshotMeta", {
                date: view.snapshotDate,
                generated: generatedLabel ?? "—",
              })
            : t("workspace.shell.chat.healthDiagnosis.subtitle")}
        </p>
      </div>

      <div style={bodyStyle}>
        {loading ? (
          <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.loading")}</p>
        ) : null}

        {!loading && error ? <p style={errorStyle}>{error}</p> : null}

        {!loading && view && !view.hasData ? (
          <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.noData")}</p>
        ) : null}

        {!loading && view?.hasData ? (
          <>
            <div style={metricsRowStyle}>
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

            {view.priorityTasks.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={sectionTitleStyle}>
                  {t("workspace.shell.chat.healthDiagnosis.priorityTasks")}
                </p>
                <ul style={listStyle}>
                  {view.priorityTasks.map((task) => (
                    <li key={task.id} style={listItemStyle}>
                      <p style={itemTitleStyle}>{task.title}</p>
                      {task.triggerReason ? (
                        <p style={itemMetaStyle}>{task.triggerReason}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p style={emptyStyle}>{t("workspace.shell.chat.healthDiagnosis.noPriorityTasks")}</p>
            )}

            {view.riskItems.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={sectionTitleStyle}>
                  {t("workspace.shell.chat.healthDiagnosis.riskItems")}
                </p>
                <ul style={listStyle}>
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
          </>
        ) : null}
      </div>

      <div style={footerStyle}>
        <s-button
          variant="primary"
          onClick={() => {
            void refreshDiagnosis();
          }}
          {...(refreshing || loading ? { disabled: true } : {})}
        >
          {refreshing
            ? t("workspace.shell.chat.healthDiagnosis.refreshing")
            : t("workspace.shell.chat.healthDiagnosis.refresh")}
        </s-button>
      </div>
    </div>
  );
}
