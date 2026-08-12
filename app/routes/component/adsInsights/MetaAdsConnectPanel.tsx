import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

type AccountOption = { id: string; name?: string; formatted?: string };

type Props = {
  connected: boolean;
  adAccountId: string | null;
  adAccountName: string | null;
  pendingAccounts: AccountOption[];
  availableAccounts: AccountOption[];
  locationSearch: string;
  businessLoginConfigured?: boolean;
  onChanged: () => void;
};

const panelStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 16,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

const primaryBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  background: pageColorTokens.brandGreen,
  color: "#fff",
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left" as const,
};

const activeAccountBtn = {
  ...secondaryBtn,
  border: `1px solid #0f7a52`,
  background: "#f4fbf7",
  color: "#0f7a52",
  cursor: "default",
};

export function MetaAdsConnectPanel({
  connected,
  adAccountId,
  adAccountName,
  pendingAccounts,
  availableAccounts,
  locationSearch,
  businessLoginConfigured = false,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>(() =>
    pendingAccounts.length > 0 ? pendingAccounts : availableAccounts,
  );
  const metaBusinessOAuth = useOAuthPopup("meta_business_oauth");
  const metaAdsOAuth = useOAuthPopup("meta_ads_oauth");

  useEffect(() => {
    if (pendingAccounts.length > 0) {
      setAccounts(pendingAccounts);
      return;
    }
    if (availableAccounts.length > 0) {
      setAccounts(availableAccounts);
      return;
    }
    if (!connected) {
      setAccounts([]);
      return;
    }

    let cancelled = false;
    void fetch(`/api/ads-insights/meta-accounts${locationSearch}`)
      .then((resp) => resp.json())
      .then((data: { ok?: boolean; accounts?: AccountOption[] }) => {
        if (!cancelled && data.ok && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [availableAccounts, connected, locationSearch, pendingAccounts]);

  async function openOAuth() {
    setBusy(true);
    try {
      const oauth = businessLoginConfigured ? metaBusinessOAuth : metaAdsOAuth;
      const endpoint = businessLoginConfigured
        ? `/api/ads-catalog/meta-business-auth-url${locationSearch}`
        : `/api/ads-insights/meta-auth-url${locationSearch}`;
      await oauth.startOAuth(endpoint, () => {
        onChanged();
        revalidator.revalidate();
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : t("adsInsights.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function selectAccount(id: string) {
    if (connected && id === adAccountId) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/ads-insights/meta-accounts${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adAccountId: id }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (resp.ok && data.ok) {
        onChanged();
        revalidator.revalidate();
      } else if (data.error) {
        alert(data.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch(`/api/ads-insights/meta-disconnect${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setAccounts([]);
      onChanged();
      revalidator.revalidate();
    } finally {
      setBusy(false);
    }
  }

  const selectingInitial = !connected && pendingAccounts.length > 0;
  const showAccountPicker = selectingInitial || (connected && accounts.length > 0);

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{t("adsInsights.metaConnectTitle")}</div>
      <div style={pageHintTextStyle}>{t("adsInsights.metaConnectHint")}</div>

      {showAccountPicker && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {selectingInitial
              ? t("adsInsights.metaSelectAccount")
              : t("adsInsights.metaSwitchAccount")}
          </div>
          {accounts.map((a) => {
            const isActive = connected && a.id === adAccountId;
            return (
              <button
                key={a.id}
                type="button"
                disabled={busy || isActive}
                style={isActive ? activeAccountBtn : secondaryBtn}
                onClick={() => void selectAccount(a.id)}
              >
                {a.name || a.id}
                {a.formatted ? ` (${a.formatted})` : ""}
                {isActive ? ` · ${t("adsInsights.metaCurrentAccount")}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {connected ? (
        <>
          {accounts.length === 0 && (
            <div style={{ fontSize: 13, color: "#0f7a52", fontWeight: 600 }}>
              {t("adsInsights.metaConnected", {
                name: adAccountName || adAccountId || "",
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} style={secondaryBtn} onClick={() => void openOAuth()}>
              {t("adsInsights.metaReconnect")}
            </button>
            <button type="button" disabled={busy} style={secondaryBtn} onClick={() => void disconnect()}>
              {t("adsInsights.metaDisconnect")}
            </button>
          </div>
        </>
      ) : (
        <button type="button" disabled={busy} style={primaryBtn} onClick={() => void openOAuth()}>
          {busy ? t("adsInsights.connecting") : t("adsInsights.metaConnect")}
        </button>
      )}
    </div>
  );
}
