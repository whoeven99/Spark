import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import { TiktokCatalogPicker } from "./TiktokCatalogPicker";
import { TiktokCatalogRegionSelect } from "./TiktokCatalogRegionSelect";
import { TiktokCreateCatalogForm } from "./TiktokCreateCatalogForm";
import { PixelCollectionDisabledNote } from "./PixelCollectionDisabledNote";
import { isTiktokCatalogAutoCreateRegion } from "../../../lib/tiktokCatalogRegions";
import type { CredentialsView } from "./types";

type Props = {
  credentials: CredentialsView;
  inferredTiktokRegion: string;
  locationSearch: string;
  languageCode: string;
  shopDomain: string;
  shopifyApiKey: string;
  onChanged: () => void;
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
  inferredTiktokRegion,
  locationSearch,
  languageCode,
  shopDomain,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const tiktokOAuth = useOAuthPopup("tiktok_catalog_oauth");

  const tiktok = credentials.tiktok;

  function openOAuth() {
    void (async () => {
      setBusy(true);
      try {
        await tiktokOAuth.startOAuth(`/api/ads-catalog/tiktok-auth-url${locationSearch}`, () => onChanged());
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
      const regionCode =
        tiktok.catalogRegionCode ||
        (isTiktokCatalogAutoCreateRegion(inferredTiktokRegion) ? inferredTiktokRegion : "DE");
      const resp = await fetch(`/api/ads-catalog/tiktok-create-catalog${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionCode }),
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
            {modeHint && <p style={pageHintTextStyle}>{modeHint}</p>}
            <div style={pageHintTextStyle}>
              {t("adsCatalog.tiktokUpdatedAt", { time: fmtDate(tiktok.updatedAt) })}
            </div>
          </div>
          <PixelCollectionDisabledNote />
          <TiktokCatalogPicker
            variant="credentials"
            locationSearch={locationSearch}
            boundCatalogId={tiktok.catalogId}
            boundBindingMode={tiktok.bindingMode}
            onChanged={onChanged}
          />
          {tiktok.bindingMode === "shopify_official" && (
            <>
              <TiktokCatalogRegionSelect
                locationSearch={locationSearch}
                value={tiktok.catalogRegionCode}
                inferredRegion={inferredTiktokRegion}
                disabled={busy}
                onChanged={onChanged}
              />
              <TiktokCreateCatalogForm
                locationSearch={locationSearch}
                inferredTiktokRegion={inferredTiktokRegion}
                catalogRegionCode={tiktok.catalogRegionCode}
                defaultCatalogName={`Spark Catalog — ${shopDomain.split(".")[0].slice(0, 40)}`}
                onCreated={onChanged}
              />
            </>
          )}
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
          <TiktokCatalogRegionSelect
            locationSearch={locationSearch}
            value={tiktok.catalogRegionCode}
            inferredRegion={inferredTiktokRegion}
            disabled={busy}
            onChanged={onChanged}
          />
          <TiktokCatalogPicker
            variant="credentials"
            locationSearch={locationSearch}
            boundCatalogId={tiktok.catalogId}
            boundBindingMode={tiktok.bindingMode}
            onChanged={onChanged}
          />
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
