import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

type DiagnosisStatus = "ok" | "warn" | "error";

type DiagnosisCheck = {
  id: string;
  status: DiagnosisStatus;
  vars?: Record<string, string>;
};

type DiagnosisResult = {
  ready: boolean;
  summaryStatus: DiagnosisStatus;
  checks: DiagnosisCheck[];
  catalogDiagnostics?: string;
};

type Props = {
  locationSearch: string;
  connected: boolean;
  bindingMode: "" | "shopify_official" | "api_managed";
  hasPixel: boolean;
  onRebindPixel: () => void;
  onEnsurePixel: () => void;
  rebindBusy: boolean;
  refreshKey?: number;
};

const secondaryBtn = {
  padding: "6px 12px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function statusColor(status: DiagnosisStatus): string {
  if (status === "ok") return "#0f7a52";
  if (status === "warn") return "#b98900";
  return "#d72c0d";
}

function statusIcon(status: DiagnosisStatus): string {
  if (status === "ok") return "●";
  if (status === "warn") return "◐";
  return "○";
}

export function TiktokBindDiagnosisPanel({
  locationSearch,
  connected,
  bindingMode,
  hasPixel,
  onRebindPixel,
  onEnsurePixel,
  rebindBusy,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnosis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-bind-diagnosis${locationSearch}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        ready?: boolean;
        summaryStatus?: DiagnosisStatus;
        checks?: DiagnosisCheck[];
        catalogDiagnostics?: string;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? t("adsCatalog.authError"));
      }
      setResult({
        ready: data.ready === true,
        summaryStatus: data.summaryStatus ?? "error",
        checks: data.checks ?? [],
        catalogDiagnostics: data.catalogDiagnostics,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adsCatalog.authError"));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [locationSearch, t]);

  useEffect(() => {
    if (connected && bindingMode === "api_managed") {
      void runDiagnosis();
    }
  }, [connected, bindingMode, runDiagnosis, refreshKey]);

  if (!connected || bindingMode !== "api_managed") return null;

  const needsPixelAction = result?.checks.some(
    (c) =>
      (c.id === "pixel_present" ||
        c.id === "catalog_eventsource" ||
        c.id === "pixel_adv_link" ||
        c.id === "pixel_adv_link_permission") &&
      c.status !== "ok",
  );

  return (
    <div
      style={{
        marginTop: 4,
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{t("adsCatalog.tiktokBindDiagTitle")}</div>
        <button
          type="button"
          style={secondaryBtn}
          disabled={loading || rebindBusy}
          onClick={() => void runDiagnosis()}
        >
          {loading ? t("adsCatalog.tiktokBindDiagBusy") : t("adsCatalog.tiktokBindDiagRefresh")}
        </button>
      </div>

      <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("adsCatalog.tiktokBindDiagHint")}</p>

      {error && <div style={{ color: "#d72c0d", fontSize: 12 }}>{error}</div>}

      {result && (
        <>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: statusColor(result.summaryStatus),
            }}
          >
            {result.ready
              ? t("adsCatalog.tiktokBindDiagSummaryReady")
              : t("adsCatalog.tiktokBindDiagSummaryNotReady")}
          </div>

          {result.catalogDiagnostics && (
            <div style={{ fontSize: 11, color: pageColorTokens.textSecondary, fontFamily: "monospace" }}>
              {result.catalogDiagnostics}
            </div>
          )}

          <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {result.checks.map((check) => (
              <li key={check.id} style={{ fontSize: 12, lineHeight: 1.45 }}>
                <span style={{ color: statusColor(check.status), marginRight: 6 }}>
                  {statusIcon(check.status)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  {t(`adsCatalog.tiktokBindDiag.check.${check.id}.label`, check.vars ?? {})}
                </span>
                {check.status !== "ok" && (
                  <div style={{ marginLeft: 16, color: pageColorTokens.textSecondary }}>
                    {t(`adsCatalog.tiktokBindDiag.check.${check.id}.action`, check.vars ?? {})}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {needsPixelAction && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {hasPixel ? (
                <button
                  type="button"
                  style={secondaryBtn}
                  disabled={rebindBusy || loading}
                  onClick={onRebindPixel}
                >
                  {rebindBusy ? t("adsCatalog.tiktokRebindPixelBusy") : t("adsCatalog.tiktokBindDiagFixPixel")}
                </button>
              ) : (
                <button
                  type="button"
                  style={secondaryBtn}
                  disabled={rebindBusy || loading}
                  onClick={onEnsurePixel}
                >
                  {rebindBusy ? t("adsCatalog.tiktokEnsurePixelBusy") : t("adsCatalog.tiktokBindDiagFixPixel")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
