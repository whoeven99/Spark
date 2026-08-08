import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRevalidator } from "react-router";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

type PendingAccount = { id: string; name?: string; formatted?: string };

type Props = {
  connected: boolean;
  customerId: string | null;
  customerName: string | null;
  pendingAccounts: PendingAccount[];
  locationSearch: string;
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
};

export function GoogleAdsSandboxConnectPanel({
  connected,
  customerId,
  customerName,
  pendingAccounts,
  locationSearch,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const googleSandboxOAuth = useOAuthPopup("google_ads_sandbox_oauth");

  async function openOAuth(reauth = false) {
    setBusy(true);
    try {
      const reauthSuffix = reauth ? `${locationSearch ? "&" : "?"}reauth=1` : "";
      await googleSandboxOAuth.startOAuth(
        `/api/ads-insights/google-sandbox-auth-url${locationSearch}${reauthSuffix}`,
        () => {
          onChanged();
          revalidator.revalidate();
        },
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : t("adsInsights.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function selectAccount(id: string) {
    setBusy(true);
    try {
      const resp = await fetch(`/api/ads-insights/google-sandbox-accounts${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: id }),
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
      await fetch(`/api/ads-insights/google-sandbox-disconnect${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      onChanged();
      revalidator.revalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{t("adsInsights.googleSandboxConnectTitle")}</div>
      <div style={pageHintTextStyle}>{t("adsInsights.googleSandboxConnectHint")}</div>

      {pendingAccounts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t("adsInsights.googleSandboxSelectAccount")}
          </div>
          {pendingAccounts.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={busy}
              style={secondaryBtn}
              onClick={() => void selectAccount(a.id)}
            >
              {a.name || a.id}
              {a.formatted ? ` (${a.formatted})` : ""}
            </button>
          ))}
        </div>
      )}

      {connected ? (
        <>
          <div style={{ fontSize: 13, color: "#0f7a52", fontWeight: 600 }}>
            {t("adsInsights.googleSandboxConnected", {
              name: customerName || customerId || "",
            })}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={busy} style={secondaryBtn} onClick={() => void openOAuth(true)}>
              {t("adsInsights.googleSandboxReconnect")}
            </button>
            <button type="button" disabled={busy} style={secondaryBtn} onClick={() => void disconnect()}>
              {t("adsInsights.googleSandboxDisconnect")}
            </button>
          </div>
        </>
      ) : (
        <button type="button" disabled={busy} style={primaryBtn} onClick={() => void openOAuth()}>
          {busy ? t("adsInsights.connecting") : t("adsInsights.googleSandboxConnect")}
        </button>
      )}
    </div>
  );
}
