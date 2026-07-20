import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import { TiktokCatalogPicker } from "./TiktokCatalogPicker";
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
        body: JSON.stringify({ appId }),
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
            {tiktok.pixelCode && (
              <div style={{ marginTop: 4, color: "#0f7a52" }}>
                {t("adsCatalog.tiktokPixelCode", { code: tiktok.pixelCode })}
              </div>
            )}
            {tiktok.appId && (
              <div style={{ marginTop: 2 }}>
                {t("adsCatalog.tiktokAppEventSource", { id: tiktok.appId })}
              </div>
            )}
            {modeHint && <p style={pageHintTextStyle}>{modeHint}</p>}
            {tiktok.pixelCode && (
              <p style={pageHintTextStyle}>{t("adsCatalog.tiktokPixelHint")}</p>
            )}
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
