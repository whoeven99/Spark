import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";
import { MetaPixelConfigPanel } from "./MetaPixelConfigPanel";
import { MetaPixelSetupWizard } from "./MetaPixelSetupWizard";
import { buildMetaPixelThemeEditorUrl } from "../../../lib/metaPixelEvents";

type Props = {
  credentials: CredentialsView;
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
  background: pageColorTokens.brandGreen,
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

export function MetaConnectPanels({
  credentials,
  locationSearch,
  languageCode,
  shopDomain,
  shopifyApiKey,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [setupRevision, setSetupRevision] = useState(0);
  const metaOAuth = useOAuthPopup("meta_catalog_oauth");
  const metaAdsOAuth = useOAuthPopup("meta_ads_oauth");

  const meta = credentials.meta;

  const themeEditorUrl = useMemo(
    () =>
      buildMetaPixelThemeEditorUrl({
        shopDomain,
        apiKey: shopifyApiKey,
      }),
    [shopDomain, shopifyApiKey],
  );

  function notifyChanged() {
    setSetupRevision((n) => n + 1);
    onChanged();
  }

  function connectMetaAds() {
    void (async () => {
      setBusy(true);
      try {
        await metaAdsOAuth.startOAuth(
          `/api/ads-insights/meta-auth-url${locationSearch}`,
          () => notifyChanged(),
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : t("adsCatalog.authError"));
      } finally {
        setBusy(false);
      }
    })();
  }

  function openOAuth() {
    void (async () => {
      setBusy(true);
      try {
        await metaOAuth.startOAuth(`/api/ads-catalog/meta-auth-url${locationSearch}`, () => notifyChanged());
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
      if (resp.ok && data.ok) notifyChanged();
      else if (data.error) alert(data.error);
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

  return (
    <div style={panelStyle}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.metaPanelTitle")}
      </h3>

      {meta.connected ? (
        <>
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "#0f7a52", fontWeight: 600 }}>
              {t("adsCatalog.metaConnected")}
            </div>
            <div>{t("adsCatalog.metaCatalogId", { id: meta.catalogId })}</div>
            <div style={pageHintTextStyle}>
              {t("adsCatalog.metaUpdatedAt", { time: fmtDate(meta.updatedAt) })}
            </div>
          </div>
          <MetaPixelSetupWizard
            metaConnected={meta.connected}
            metaAdsConnected={meta.metaAdsConnected}
            pixelId={meta.pixelId}
            hasCapiAccessToken={meta.hasCapiAccessToken}
            hasStoredCapiAccessToken={meta.hasStoredCapiAccessToken}
            capiEnabled={meta.capiEnabled}
            locationSearch={locationSearch}
            themeEditorUrl={themeEditorUrl}
            onConnectMetaAds={connectMetaAds}
            busy={busy}
            setupRevision={setupRevision}
          />
          <MetaPixelConfigPanel
            locationSearch={locationSearch}
            shopDomain={shopDomain}
            shopifyApiKey={shopifyApiKey}
            pixelId={meta.pixelId}
            hasCapiAccessToken={meta.hasCapiAccessToken}
            hasStoredCapiAccessToken={meta.hasStoredCapiAccessToken}
            capiAccessToken={meta.capiAccessToken}
            metaOAuthCapiAvailable={meta.metaOAuthCapiAvailable}
            metaCapiBisuConfigured={meta.metaCapiBisuConfigured}
            capiTokenType={meta.capiTokenType}
            pendingCapiPixels={meta.pendingCapiPixels}
            testEventCode={meta.testEventCode}
            capiEnabled={meta.capiEnabled}
            enabledEvents={meta.enabledEvents}
            metaAdsConnected={meta.metaAdsConnected}
            metaAdsAdAccountId={meta.metaAdsAdAccountId}
            busy={busy}
            setBusy={setBusy}
            onChanged={notifyChanged}
          />
          {meta.pixelId ? (
            <Link
              to={`/app/ads/meta-pixel/data${locationSearch}`}
              style={{ ...primaryBtn, display: "inline-block", textDecoration: "none" }}
            >
              {t("adsCatalog.metaPixelViewData")}
            </Link>
          ) : null}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" style={secondaryBtn} onClick={openOAuth}>
              {t("adsCatalog.metaReauth")}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              disabled={busy}
              onClick={() => void post("/api/ads-catalog/meta-disconnect", {})}
            >
              {t("adsCatalog.metaDisconnect")}
            </button>
          </div>
        </>
      ) : meta.pendingCatalogs.length > 0 ? (
        <CatalogSelect
          label={t("adsCatalog.metaSelectCatalog")}
          catalogs={meta.pendingCatalogs.map((c) => ({ id: c.id, label: c.name || c.id }))}
          busy={busy}
          onSelect={(id) => void post("/api/ads-catalog/meta-catalogs", { catalogId: id })}
        />
      ) : (
        <>
          <p style={pageHintTextStyle}>{t("adsCatalog.metaConnectHint")}</p>
          <div>
            <button type="button" style={primaryBtn} onClick={openOAuth}>
              {t("adsCatalog.metaConnect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CatalogSelect({
  label,
  catalogs,
  busy,
  onSelect,
}: {
  label: string;
  catalogs: Array<{ id: string; label: string }>;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(catalogs[0]?.id ?? "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: `1px solid ${pageColorTokens.borderInput}`,
          fontSize: 13,
        }}
      >
        {catalogs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <div>
        <button
          type="button"
          style={primaryBtn}
          disabled={busy || !selected}
          onClick={() => onSelect(selected)}
        >
          {t("adsCatalog.confirmSelection")}
        </button>
      </div>
    </div>
  );
}
