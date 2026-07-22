import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import { TiktokCatalogPicker } from "./TiktokCatalogPicker";
import { TiktokBindDiagnosisPanel } from "./TiktokBindDiagnosisPanel";
import { TiktokPixelConfigPanel } from "./TiktokPixelConfigPanel";
import type { CredentialsView } from "./types";

type Props = {
  credentials: CredentialsView;
  locationSearch: string;
  languageCode: string;
  onChanged: () => void;
};

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
  boxSizing: "border-box" as const,
};

const panelStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column" as const,
  gap: 14,
};

const primaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "#010101",
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function resolveTiktokPixelBindError(
  data: { error?: string; errorCode?: string },
  t: (key: string) => string,
): string {
  if (data.errorCode === "PIXEL_ASSET_PERMISSION_DENIED") {
    return t("adsCatalog.tiktokPixelBindErrorAssetPermission");
  }
  if (data.errorCode === "EVENT_SOURCE_NOT_AVAILABLE_FOR_ADV") {
    return t("adsCatalog.tiktokPixelBindErrorNotAvailableForAdv");
  }
  return data.error ?? t("adsCatalog.authError");
}

export function TiktokConnectPanels({
  credentials,
  locationSearch,
  languageCode,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [appIdInput, setAppIdInput] = useState(credentials.tiktok.appId ?? "");
  const [appIdSuccess, setAppIdSuccess] = useState(false);
  const [pixelBindSuccess, setPixelBindSuccess] = useState(false);
  const [pixelBindError, setPixelBindError] = useState<string | null>(null);
  const [pixelEnsureSuccess, setPixelEnsureSuccess] = useState(false);
  const [diagnosisRefreshKey, setDiagnosisRefreshKey] = useState(0);

  const tiktok = credentials.tiktok;

  function openOAuth() {
    void (async () => {
      setBusy(true);
      try {
        const resp = await fetch(`/api/ads-catalog/tiktok-auth-url${locationSearch}`, {
          headers: { Accept: "application/json" },
        });
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          authUrl?: string;
          error?: string;
        };
        if (!resp.ok || !data.authUrl) {
          alert(data.error ?? t("adsCatalog.authError"));
          return;
        }
        window.open(data.authUrl, "_top");
      } catch (e) {
        alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const resp = await fetch(`${path}${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (resp.ok && data.ok) onChanged();
      else if (data.error) alert(data.error);
    } finally {
      setBusy(false);
    }
  }

  async function createAndBindCatalog() {
    setBusy(true);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-create-catalog${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: appIdInput.trim() || undefined }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        alert(data.error ?? t("adsCatalog.authError"));
        return;
      }
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function bindAppEventSource() {
    const appId = appIdInput.trim();
    if (!appId) return;
    setBusy(true);
    setAppIdSuccess(false);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-bind-eventsource${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "app", appId }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        alert(data.error ?? t("adsCatalog.authError"));
        return;
      }
      setAppIdSuccess(true);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function rebindPixelEventSource() {
    setBusy(true);
    setPixelBindSuccess(false);
    setPixelBindError(null);
    setPixelEnsureSuccess(false);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-bind-eventsource${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pixel" }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errorCode?: string;
      };
      if (!resp.ok || !data.ok) {
        setPixelBindError(resolveTiktokPixelBindError(data, t));
        return;
      }
      setPixelBindSuccess(true);
      setDiagnosisRefreshKey((k) => k + 1);
    } catch (e) {
      setPixelBindError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function ensurePixelEventSource() {
    setBusy(true);
    setPixelBindSuccess(false);
    setPixelBindError(null);
    setPixelEnsureSuccess(false);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-ensure-pixel${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errorCode?: string;
      };
      if (!resp.ok || !data.ok) {
        setPixelBindError(resolveTiktokPixelBindError(data, t));
        return;
      }
      setPixelEnsureSuccess(true);
      onChanged();
      setDiagnosisRefreshKey((k) => k + 1);
    } catch (e) {
      setPixelBindError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(languageCode, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : "—";

  const modeHint =
    tiktok.bindingMode === "shopify_official"
      ? t("adsCatalog.tiktokModeOfficialHint")
      : tiktok.bindingMode === "api_managed"
        ? t("adsCatalog.tiktokModeApiHint")
        : null;

  return (
    <div style={panelStyle}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.tiktokPanelTitle")}
      </h3>

      {tiktok.connected ? (
        <>
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "#0f7a52", fontWeight: 600 }}>
              {t("adsCatalog.tiktokConnected")}
            </div>
            <div>{t("adsCatalog.tiktokCatalogId", { id: tiktok.catalogId })}</div>
            {tiktok.advertiserId && (
              <div>
                {t("adsCatalog.tiktokAdvertiserId", { id: tiktok.advertiserId })}
              </div>
            )}
            {tiktok.bindingMode === "shopify_official" && (
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {t("adsCatalog.tiktokModeOfficial")}
              </div>
            )}
            {tiktok.bindingMode === "api_managed" && (
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                {t("adsCatalog.tiktokModeApi")}
              </div>
            )}
            {tiktok.bindingMode === "api_managed" && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                <TiktokPixelConfigPanel
                  locationSearch={locationSearch}
                  pixelCode={tiktok.pixelCode}
                  advertiserId={tiktok.advertiserId}
                  hasEventsApiAccessToken={tiktok.hasEventsApiAccessToken}
                  eventsApiEnabled={tiktok.eventsApiEnabled}
                  enabledEvents={tiktok.enabledEvents}
                  busy={busy}
                  setBusy={setBusy}
                  onChanged={onChanged}
                  onDiagnosisRefresh={() => setDiagnosisRefreshKey((k) => k + 1)}
                  onBindError={setPixelBindError}
                />
                {pixelBindError && (
                  <span style={{ color: "#d72c0d", fontSize: 12 }}>{pixelBindError}</span>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {tiktok.pixelCode ? (
                    <button
                      type="button"
                      style={{ ...secondaryBtn, padding: "4px 10px", fontSize: 12 }}
                      disabled={busy}
                      onClick={() => void rebindPixelEventSource()}
                    >
                      {busy ? t("adsCatalog.tiktokRebindPixelBusy") : t("adsCatalog.tiktokRebindPixel")}
                    </button>
                  ) : null}
                  {pixelBindSuccess && (
                    <span style={{ color: "#0f7a52", fontSize: 12 }}>
                      {t("adsCatalog.tiktokRebindPixelSuccess")}
                    </span>
                  )}
                </div>
                <TiktokBindDiagnosisPanel
                  locationSearch={locationSearch}
                  connected={tiktok.connected}
                  bindingMode={tiktok.bindingMode}
                  hasPixel={Boolean(tiktok.pixelCode)}
                  rebindBusy={busy}
                  refreshKey={diagnosisRefreshKey}
                  onRebindPixel={() => void rebindPixelEventSource()}
                  onEnsurePixel={() => void ensurePixelEventSource()}
                />
              </div>
            )}
            {tiktok.appId && (
              <div style={{ marginTop: 2 }}>
                {t("adsCatalog.tiktokAppEventSource", { id: tiktok.appId })}
              </div>
            )}
            {modeHint && <p style={pageHintTextStyle}>{modeHint}</p>}
            <div style={pageHintTextStyle}>
              {t("adsCatalog.tiktokUpdatedAt", { time: fmtDate(tiktok.updatedAt) })}
            </div>
          </div>
          <TiktokCatalogPicker
            variant="credentials"
            locationSearch={locationSearch}
            boundCatalogId={tiktok.catalogId}
            boundBindingMode={tiktok.bindingMode}
            onChanged={onChanged}
          />
          {/* 应用事件源绑定（App ID） */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              {t("adsCatalog.tiktokAppIdLabel")}
            </label>
            <p style={pageHintTextStyle}>{t("adsCatalog.tiktokAppIdHint")}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                style={inputStyle}
                placeholder={t("adsCatalog.tiktokAppIdPlaceholder")}
                value={appIdInput}
                onChange={(e) => {
                  setAppIdInput(e.target.value);
                  setAppIdSuccess(false);
                }}
                disabled={busy}
              />
              <button
                type="button"
                style={{ ...secondaryBtn, whiteSpace: "nowrap" }}
                disabled={busy || !appIdInput.trim()}
                onClick={() => void bindAppEventSource()}
              >
                {busy ? t("adsCatalog.tiktokBindAppIdBusy") : t("adsCatalog.tiktokBindAppId")}
              </button>
            </div>
            {appIdSuccess && (
              <div style={{ color: "#0f7a52", fontSize: 13 }}>
                {t("adsCatalog.tiktokBindAppIdSuccess")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={secondaryBtn} disabled={busy} onClick={openOAuth}>
              {t("adsCatalog.tiktokReauth")}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              disabled={busy}
              onClick={() => void post("/api/ads-catalog/tiktok-disconnect", {})}
            >
              {t("adsCatalog.tiktokDisconnect")}
            </button>
          </div>
        </>
      ) : tiktok.authorized ? (
        <>
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "#0f7a52", fontWeight: 600 }}>
              {tiktok.pendingCatalogs.length > 0
                ? t("adsCatalog.tiktokSelectCatalog")
                : t("adsCatalog.tiktokAuthorizedNoCatalog")}
            </div>
            {tiktok.advertiserId && (
              <div>
                {t("adsCatalog.tiktokAdvertiserId", { id: tiktok.advertiserId })}
              </div>
            )}
            {tiktok.awaitingCatalog && (
              <p style={pageHintTextStyle}>{t("adsCatalog.tiktokNoCatalogHint")}</p>
            )}
          </div>
          <TiktokCatalogPicker
            variant="credentials"
            locationSearch={locationSearch}
            boundCatalogId={tiktok.catalogId}
            boundBindingMode={tiktok.bindingMode}
            onChanged={onChanged}
          />
          {/* 创建 Catalog 前可选填 App ID，在创建时一并绑定 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              {t("adsCatalog.tiktokAppIdLabel")}
            </label>
            <input
              type="text"
              style={inputStyle}
              placeholder={t("adsCatalog.tiktokAppIdPlaceholder")}
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value)}
              disabled={busy}
            />
            <p style={pageHintTextStyle}>{t("adsCatalog.tiktokAppIdHint")}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryBtn}
              disabled={busy}
              onClick={() => void createAndBindCatalog()}
            >
              {t("adsCatalog.tiktokCreateCatalog")}
            </button>
            <button type="button" style={secondaryBtn} disabled={busy} onClick={openOAuth}>
              {t("adsCatalog.tiktokReauth")}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              disabled={busy}
              onClick={() => void post("/api/ads-catalog/tiktok-disconnect", {})}
            >
              {t("adsCatalog.tiktokDisconnect")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={pageHintTextStyle}>{t("adsCatalog.tiktokConnectHint")}</p>
          <div>
            <button type="button" style={primaryBtn} onClick={openOAuth}>
              {t("adsCatalog.tiktokConnect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
