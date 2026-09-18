import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useOAuthPopup } from "../../../hooks/useOAuthPopup";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";

type Props = {
  credentials: CredentialsView;
  locationSearch: string;
  languageCode: string;
  onChanged: () => void;
  /** card = 独立卡片；section = 嵌在 Google 总卡内的分项（保留完整标题） */
  layout?: "card" | "section";
};

const panelStyle: CSSProperties = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  paddingTop: 14,
  paddingBottom: 14,
  borderTop: `1px solid ${pageColorTokens.borderSubtle}`,
};

const softConnectBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: pageColorTokens.brandGreenLight,
  color: pageColorTokens.brandGreenDeep,
  border: `1px solid ${pageColorTokens.brandGreen}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "#fff",
  color: pageColorTokens.textPrimary,
  border: `1px solid ${pageColorTokens.borderSubtle}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function reauthSuffix(locationSearch: string, reauth: boolean) {
  return reauth ? `${locationSearch ? "&" : "?"}reauth=1` : "";
}

export function GscConnectPanel({
  credentials,
  locationSearch,
  languageCode,
  onChanged,
  layout = "card",
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const gscOAuth = useOAuthPopup("gsc_oauth");
  const gsc = credentials.googleSearchConsole;
  const pending = gsc.pendingSites;

  function fmtDate(iso: string | null) {
    return iso
      ? new Intl.DateTimeFormat(languageCode, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso))
      : "—";
  }

  async function openOAuth(reauth = false) {
    setBusy(true);
    try {
      await gscOAuth.startOAuth(
        `/api/gsc/auth-url${locationSearch}${reauthSuffix(locationSearch, reauth)}`,
        () => onChanged(),
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  async function post(path: string, body: Record<string, unknown> = {}) {
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

  const disabled = busy || gscOAuth.redirecting;
  const shellStyle = layout === "section" ? sectionStyle : panelStyle;

  return (
    <div style={shellStyle}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.gscPanelTitle")}
      </h3>

      {pending.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t("adsCatalog.gscSelectSite")}
          </div>
          {pending.map((site) => (
            <button
              key={site.siteUrl}
              type="button"
              disabled={disabled}
              style={{ ...secondaryBtn, textAlign: "left" }}
              onClick={() => void post("/api/gsc/sites", { siteUrl: site.siteUrl })}
            >
              {site.siteUrl}
            </button>
          ))}
          <div>
            <button
              type="button"
              style={secondaryBtn}
              disabled={disabled}
              onClick={() => void post("/api/gsc/disconnect")}
            >
              {t("adsCatalog.gscCancelSelect")}
            </button>
          </div>
        </div>
      ) : gsc.connected ? (
        <>
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "#0f7a52", fontWeight: 600 }}>
              {t("adsCatalog.gscConnected")}
            </div>
            {gsc.siteUrl ? <div>{gsc.siteUrl}</div> : null}
            <div style={pageHintTextStyle}>
              {t("adsCatalog.gscUpdatedAt", { time: fmtDate(gsc.updatedAt) })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={secondaryBtn}
              disabled={disabled}
              onClick={() => void openOAuth(true)}
            >
              {t("adsCatalog.gscReauth")}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              disabled={disabled}
              onClick={() => void post("/api/gsc/disconnect")}
            >
              {t("adsCatalog.gscDisconnect")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("adsCatalog.gscConnectHint")}</p>
          <div>
            <button
              type="button"
              style={softConnectBtn}
              disabled={disabled}
              onClick={() => void openOAuth()}
            >
              {t("adsCatalog.gscConnect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
