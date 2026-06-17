import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";

type AdsLink = { bound: boolean; customerId: string | null; linked: boolean | null };

type Props = {
  credentials: CredentialsView;
  adsLink: AdsLink | null;
  locationSearch: string;
  languageCode: string;
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

export function GoogleConnectPanels({
  credentials,
  adsLink,
  locationSearch,
  languageCode,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const gmc = credentials.googleMerchant;
  const ads = credentials.googleAds;

  function openOAuth(path: string) {
    const url = `${path}${locationSearch}`;
    window.open(url, "_top");
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

  const fmtDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(languageCode, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Google Merchant Center ── */}
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.gmcPanelTitle")}
        </h3>

        {gmc.connected ? (
          <>
            <div style={{ fontSize: 13 }}>
              <div style={{ color: "#0f7a52", fontWeight: 600 }}>
                {t("adsCatalog.gmcConnected")}
              </div>
              <div>{t("adsCatalog.gmcMerchantId", { id: gmc.merchantId })}</div>
              <div style={pageHintTextStyle}>
                {t("adsCatalog.gmcUpdatedAt", { time: fmtDate(gmc.updatedAt) })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={secondaryBtn} onClick={() => openOAuth("/app/ads/google-merchant/start")}>
                {t("adsCatalog.gmcReauth")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => void post("/api/ads-catalog/google-disconnect", { target: "gmc" })}
              >
                {t("adsCatalog.gmcDisconnect")}
              </button>
            </div>
          </>
        ) : gmc.pendingAccounts.length > 0 ? (
          <AccountSelect
            label={t("adsCatalog.gmcSelectAccount")}
            accounts={gmc.pendingAccounts.map((a) => ({ id: a.id, label: a.name || a.id }))}
            busy={busy}
            onSelect={(id) =>
              void post("/api/ads-catalog/google-merchant-accounts", { merchantId: id })
            }
          />
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.gmcConnectHint")}</p>
            <div>
              <button type="button" style={primaryBtn} onClick={() => openOAuth("/app/ads/google-merchant/start")}>
                {t("adsCatalog.gmcConnect")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Google Ads (optional) ── */}
      <div style={panelStyle}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
          {t("adsCatalog.adsPanelTitle")}
        </h3>

        {ads.connected ? (
          <>
            <div style={{ fontSize: 13 }}>
              <div style={{ color: "#0f7a52", fontWeight: 600 }}>{t("adsCatalog.adsBound")}</div>
              <div>{t("adsCatalog.adsCustomerId", { id: ads.customerIdFormatted || ads.customerId })}</div>
              <div style={{ marginTop: 4 }}>
                {adsLink?.linked === true
                  ? <span style={{ color: "#0f7a52" }}>{t("adsCatalog.adsLinked")}</span>
                  : adsLink?.linked === false
                    ? <a
                        href="https://merchants.google.com/"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#a36a00" }}
                      >
                        {t("adsCatalog.adsNotLinked")}
                      </a>
                    : <span style={pageHintTextStyle}>{t("adsCatalog.adsLinkUnknown")}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={secondaryBtn} onClick={() => openOAuth("/app/ads/google-ads/start")}>
                {t("adsCatalog.adsChange")}
              </button>
              <button
                type="button"
                style={secondaryBtn}
                disabled={busy}
                onClick={() => void post("/api/ads-catalog/google-disconnect", { target: "ads" })}
              >
                {t("adsCatalog.gmcDisconnect")}
              </button>
            </div>
          </>
        ) : ads.pendingAccounts.length > 0 ? (
          <AccountSelect
            label={t("adsCatalog.adsSelectAccount")}
            accounts={ads.pendingAccounts.map((a) => ({ id: a.id, label: a.formatted || a.id }))}
            busy={busy}
            onSelect={(id) =>
              void post("/api/ads-catalog/google-ads-accounts", { customerId: id })
            }
          />
        ) : (
          <>
            <p style={pageHintTextStyle}>{t("adsCatalog.adsConnectHint")}</p>
            <div>
              <button type="button" style={primaryBtn} onClick={() => openOAuth("/app/ads/google-ads/start")}>
                {t("adsCatalog.adsConnect")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AccountSelect({
  label,
  accounts,
  busy,
  onSelect,
}: {
  label: string;
  accounts: Array<{ id: string; label: string }>;
  busy: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(accounts[0]?.id ?? "");
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
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
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
