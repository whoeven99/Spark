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
  const metaBusinessOAuth = useOAuthPopup("meta_business_oauth");
  const metaOAuth = useOAuthPopup("meta_catalog_oauth");

  const meta = credentials.meta;
  const unifiedBusinessLogin = meta.metaBusinessLoginConfigured;

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

  function openMetaOAuth() {
    void (async () => {
      setBusy(true);
      try {
        const popup = unifiedBusinessLogin ? metaBusinessOAuth : metaOAuth;
        const endpoint = unifiedBusinessLogin
          ? `/api/ads-catalog/meta-business-auth-url${locationSearch}`
          : `/api/ads-catalog/meta-auth-url${locationSearch}`;
        await popup.startOAuth(endpoint, () => notifyChanged());
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
            {meta.metaAdsConnected ? (
              <div>{t("adsCatalog.metaBusinessAdAccount", { id: meta.metaAdsAdAccountId })}</div>
            ) : null}
            <div style={pageHintTextStyle}>
              {t("adsCatalog.metaUpdatedAt", { time: fmtDate(meta.updatedAt) })}
            </div>
          </div>
          <MetaPixelSetupWizard
            metaConnected={meta.connected}
            metaAdsConnected={meta.metaAdsConnected}
            metaBusinessUnified={unifiedBusinessLogin}
            pixelId={meta.pixelId}
            hasCapiAccessToken={meta.hasCapiAccessToken}
            hasStoredCapiAccessToken={meta.hasStoredCapiAccessToken}
            capiEnabled={meta.capiEnabled}
            locationSearch={locationSearch}
            themeEditorUrl={themeEditorUrl}
            onConnectMeta={openMetaOAuth}
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
            metaBusinessUnified={unifiedBusinessLogin}
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
            onConnectMeta={openMetaOAuth}
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
            <button type="button" style={secondaryBtn} onClick={openMetaOAuth}>
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
      ) : meta.pendingBusiness ? (
        <MetaBusinessAssetSelect
          pending={meta.pendingBusiness}
          busy={busy}
          onConfirm={(body) => void post("/api/ads-catalog/meta-business-confirm", body)}
        />
      ) : meta.pendingCatalogs.length > 0 && !unifiedBusinessLogin ? (
        <CatalogSelect
          label={t("adsCatalog.metaSelectCatalog")}
          catalogs={meta.pendingCatalogs.map((c) => ({ id: c.id, label: c.name || c.id }))}
          busy={busy}
          onSelect={(id) => void post("/api/ads-catalog/meta-catalogs", { catalogId: id })}
        />
      ) : (
        <>
          <p style={pageHintTextStyle}>
            {unifiedBusinessLogin
              ? t("adsCatalog.metaBusinessConnectHint")
              : t("adsCatalog.metaConnectHint")}
          </p>
          <div>
            <button type="button" style={primaryBtn} onClick={openMetaOAuth}>
              {unifiedBusinessLogin
                ? t("adsCatalog.metaBusinessConnect")
                : t("adsCatalog.metaConnect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetaBusinessAssetSelect({
  pending,
  busy,
  onConfirm,
}: {
  pending: NonNullable<CredentialsView["meta"]["pendingBusiness"]>;
  busy: boolean;
  onConfirm: (body: { catalogId: string; adAccountId: string; pixelId?: string }) => void;
}) {
  const { t } = useTranslation();
  const [catalogId, setCatalogId] = useState(pending.catalogs[0]?.id ?? "");
  const [adAccountId, setAdAccountId] = useState(pending.adAccounts[0]?.id ?? "");
  const [pixelId, setPixelId] = useState(pending.pixels[0]?.pixelId ?? "");

  const selectStyle = {
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${pageColorTokens.borderInput}`,
    fontSize: 13,
    width: "100%",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{t("adsCatalog.metaBusinessSelectAssets")}</div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        <span>{t("adsCatalog.metaSelectCatalog")}</span>
        <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)} style={selectStyle}>
          {pending.catalogs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.id}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        <span>{t("adsCatalog.metaPixelAdAccountLabel")}</span>
        <select
          value={adAccountId}
          onChange={(e) => setAdAccountId(e.target.value)}
          style={selectStyle}
        >
          {pending.adAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.id}
              {a.formatted ? ` (${a.formatted})` : ""}
            </option>
          ))}
        </select>
      </label>
      {pending.pixels.length > 0 ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          <span>{t("adsCatalog.metaPixelSelectLabel")}</span>
          <select value={pixelId} onChange={(e) => setPixelId(e.target.value)} style={selectStyle}>
            {pending.pixels.map((p) => (
              <option key={p.pixelId} value={p.pixelId}>
                {p.pixelName || p.pixelId}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div>
        <button
          type="button"
          style={primaryBtn}
          disabled={busy || !catalogId || !adAccountId}
          onClick={() =>
            onConfirm({
              catalogId,
              adAccountId,
              ...(pixelId ? { pixelId } : {}),
            })
          }
        >
          {t("adsCatalog.confirmSelection")}
        </button>
      </div>
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
