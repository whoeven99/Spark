import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";

type Props = {
  credentials: CredentialsView;
  locationSearch: string;
  languageCode: string;
  shopDomain: string;
  shopifyApiKey: string;
  onChanged: () => void;
};

type AccountOption = { id: string; name?: string; formatted?: string };

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

const activeAccountBtn = {
  ...secondaryBtn,
  border: `1px solid #0f7a52`,
  background: "#f4fbf7",
  color: "#0f7a52",
  cursor: "default",
  textAlign: "left" as const,
};

export function MetaConnectPanels({
  credentials,
  locationSearch,
  languageCode,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const metaUnifiedOAuth = useOAuthPopup("meta_unified_oauth");
  const metaCatalogOAuth = useOAuthPopup("meta_catalog_oauth");
  const metaAdsOAuth = useOAuthPopup("meta_ads_oauth");
  const metaCapiOAuth = useOAuthPopup("meta_capi_oauth");

  const meta = credentials.meta;
  const capiConnected = meta.hasStoredCapiAccessToken || meta.hasCapiAccessToken;
  const adsAccountsInitial =
    meta.pendingAdsAccounts.length > 0 ? meta.pendingAdsAccounts : meta.availableAdsAccounts;
  const [adsAccounts, setAdsAccounts] = useState<AccountOption[]>(adsAccountsInitial);
  const anyPending =
    meta.pendingCatalogs.length > 0 ||
    meta.pendingAdsAccounts.length > 0 ||
    meta.pendingCapiPixels.length > 0;
  const showPrimaryConnect =
    !meta.connected && !meta.metaAdsConnected && !capiConnected && !anyPending;

  useEffect(() => {
    if (meta.pendingAdsAccounts.length > 0) {
      setAdsAccounts(meta.pendingAdsAccounts);
      return;
    }
    if (meta.availableAdsAccounts.length > 0) {
      setAdsAccounts(meta.availableAdsAccounts);
      return;
    }
    if (!meta.metaAdsConnected) {
      setAdsAccounts([]);
      return;
    }

    let cancelled = false;
    void fetch(`/api/ads-insights/meta-accounts${locationSearch}`)
      .then((resp) => resp.json())
      .then((data: { ok?: boolean; accounts?: AccountOption[] }) => {
        if (!cancelled && data.ok && Array.isArray(data.accounts)) {
          setAdsAccounts(data.accounts);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locationSearch, meta.availableAdsAccounts, meta.metaAdsConnected, meta.pendingAdsAccounts]);

  function notifyChanged() {
    onChanged();
  }

  function openOAuth(
    endpoint: string,
    oauth: ReturnType<typeof useOAuthPopup>,
  ) {
    void (async () => {
      setBusy(true);
      try {
        await oauth.startOAuth(`${endpoint}${locationSearch}`, () => notifyChanged());
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

  const selectingInitialAds = !meta.metaAdsConnected && meta.pendingAdsAccounts.length > 0;
  const showAdsAccountPicker =
    selectingInitialAds ||
    (meta.metaAdsConnected && adsAccounts.length > 0) ||
    meta.pendingAdsAccounts.length > 0;

  if (showPrimaryConnect) {
    return (
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.metaPanelTitle")}
        </h3>
        <p style={pageHintTextStyle}>{t("adsCatalog.metaConnectHint")}</p>
        <div>
          <button
            type="button"
            style={primaryBtn}
            disabled={busy}
            onClick={() => openOAuth("/api/ads-catalog/meta-unified-auth-url", metaUnifiedOAuth)}
          >
            {t("adsCatalog.metaUnifiedAuthButton")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.metaPanelTitle")}
        </h3>
        {meta.pendingCatalogs.length > 0 ? (
          <CatalogSelect
            label={t("adsCatalog.metaSelectCatalog")}
            catalogs={meta.pendingCatalogs.map((c) => ({ id: c.id, label: c.name || c.id }))}
            busy={busy}
            onSelect={(id) => void post("/api/ads-catalog/meta-catalogs", { catalogId: id })}
          />
        ) : meta.connected ? (
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
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() =>
                  openOAuth("/api/ads-catalog/meta-unified-auth-url", metaUnifiedOAuth)
                }
              >
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
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.metaCatalogConnectHint")}</p>
            <div>
              <button
                type="button"
                style={primaryBtn}
                disabled={busy}
                onClick={() => openOAuth("/api/ads-catalog/meta-auth-url", metaCatalogOAuth)}
              >
                {t("adsCatalog.metaCatalogConnect")}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.metaAdsPanelTitle")}
        </h3>
        {showAdsAccountPicker ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {selectingInitialAds
                ? t("adsCatalog.metaAdsSelectAccount")
                : t("adsCatalog.metaAdsSwitchAccount")}
            </div>
            {adsAccounts.map((account) => {
              const isActive = meta.metaAdsConnected && account.id === meta.metaAdsAdAccountId;
              return (
                <button
                  key={account.id}
                  type="button"
                  disabled={busy || isActive}
                  style={isActive ? activeAccountBtn : { ...secondaryBtn, textAlign: "left" }}
                  onClick={() =>
                    void post("/api/ads-insights/meta-accounts", { adAccountId: account.id })
                  }
                >
                  {account.name || account.id}
                  {account.formatted ? ` (${account.formatted})` : ""}
                  {isActive ? ` · ${t("adsCatalog.metaAdsCurrentAccount")}` : ""}
                </button>
              );
            })}
          </div>
        ) : null}
        {meta.metaAdsConnected ? (
          <>
            {adsAccounts.length === 0 ? (
              <div style={{ fontSize: 13, color: "#0f7a52", fontWeight: 600 }}>
                {t("adsCatalog.metaAdsConnectedAs", {
                  name: meta.metaAdsAdAccountName || meta.metaAdsAdAccountId,
                })}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => openOAuth("/api/ads-insights/meta-auth-url", metaAdsOAuth)}
              >
                {t("adsCatalog.metaAdsReauth")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => void post("/api/ads-insights/meta-disconnect", {})}
              >
                {t("adsCatalog.metaAdsDisconnect")}
              </button>
            </div>
          </>
        ) : selectingInitialAds ? (
          <p style={pageHintTextStyle}>{t("adsCatalog.metaAdsSelectHint")}</p>
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.metaAdsConnectHint")}</p>
            <div>
              <button
                type="button"
                style={primaryBtn}
                disabled={busy}
                onClick={() => openOAuth("/api/ads-insights/meta-auth-url", metaAdsOAuth)}
              >
                {t("adsCatalog.metaAdsConnect")}
              </button>
            </div>
          </>
        )}
      </div>

      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.metaCapiPanelTitle")}
        </h3>
        {meta.pendingCapiPixels.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {t("adsCatalog.metaCapiSelectPixel")}
            </div>
            {meta.pendingCapiPixels.map((pixel) => (
              <button
                key={pixel.pixelId}
                type="button"
                style={{ ...secondaryBtn, textAlign: "left" }}
                disabled={busy}
                onClick={() =>
                  void post("/api/ads-catalog/meta-capi-pixels", { pixelId: pixel.pixelId })
                }
              >
                {pixel.pixelName || pixel.pixelId}
              </button>
            ))}
          </div>
        ) : capiConnected ? (
          <>
            <div style={{ fontSize: 13, color: "#0f7a52", fontWeight: 600 }}>
              {t("adsCatalog.metaCapiConnected")}
            </div>
            {meta.pixelId ? (
              <div style={{ fontSize: 13 }}>
                {t("adsCatalog.metaPixelIdLabel", { id: meta.pixelId })}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => openOAuth("/api/ads-catalog/meta-capi-auth-url", metaCapiOAuth)}
              >
                {t("adsCatalog.metaCapiReconnectLegacy")}
              </button>
            </div>
          </>
        ) : !meta.connected ? (
          <p style={pageHintTextStyle}>{t("adsCatalog.metaCapiWaitCatalog")}</p>
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.metaCapiConnectHint")}</p>
            <div>
              <button
                type="button"
                style={primaryBtn}
                disabled={busy}
                onClick={() => openOAuth("/api/ads-catalog/meta-capi-auth-url", metaCapiOAuth)}
              >
                {t("adsCatalog.metaCapiConnect")}
              </button>
            </div>
          </>
        )}
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
