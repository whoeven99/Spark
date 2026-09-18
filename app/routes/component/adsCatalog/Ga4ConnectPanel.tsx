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

const activeAccountBtn: CSSProperties = {
  ...secondaryBtn,
  border: "1px solid #0f7a52",
  background: "#f4fbf7",
  color: "#0f7a52",
  cursor: "default",
  textAlign: "left",
};

function reauthSuffix(locationSearch: string, reauth: boolean) {
  return reauth ? `${locationSearch ? "&" : "?"}reauth=1` : "";
}

function propertyLabel(property: {
  propertyName: string;
  propertyId: string;
  accountName?: string;
}) {
  const id = property.propertyId.replace(/^properties\//, "");
  const name = property.accountName
    ? `${property.propertyName} · ${property.accountName}`
    : property.propertyName;
  return `${name} (${id})`;
}

export function Ga4ConnectPanel({
  credentials,
  locationSearch,
  languageCode,
  onChanged,
  layout = "card",
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ga4OAuth = useOAuthPopup("ga4_oauth");
  const ga4 = credentials.googleAnalytics;
  const pending = ga4.pendingProperties;
  const connectedProperties = ga4.properties;
  const switchable = ga4.allProperties.length > 0 ? ga4.allProperties : connectedProperties;
  const activeId = connectedProperties[0]?.propertyId ?? "";

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
      await ga4OAuth.startOAuth(
        `/api/ga4/auth-url${locationSearch}${reauthSuffix(locationSearch, reauth)}`,
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

  const disabled = busy || ga4OAuth.redirecting;
  const shellStyle = layout === "section" ? sectionStyle : panelStyle;

  return (
    <div style={shellStyle}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.ga4PanelTitle")}
      </h3>

      {pending.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t("adsCatalog.ga4SelectProperty")}
          </div>
          {pending.map((property) => (
            <button
              key={property.propertyId}
              type="button"
              disabled={disabled}
              style={{ ...secondaryBtn, textAlign: "left" }}
              onClick={() => void post("/api/ga4/properties", { propertyIds: [property.propertyId] })}
            >
              {propertyLabel(property)}
            </button>
          ))}
          <div>
            <button
              type="button"
              style={secondaryBtn}
              disabled={disabled}
              onClick={() => void post("/api/ga4/disconnect")}
            >
              {t("adsCatalog.ga4CancelSelect")}
            </button>
          </div>
        </div>
      ) : ga4.connected ? (
        <>
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "#0f7a52", fontWeight: 600 }}>
              {t("adsCatalog.ga4Connected", { count: connectedProperties.length })}
            </div>
            {connectedProperties.map((property) => (
              <div key={property.propertyId}>{propertyLabel(property)}</div>
            ))}
            <div style={pageHintTextStyle}>
              {t("adsCatalog.ga4UpdatedAt", { time: fmtDate(ga4.updatedAt) })}
            </div>
          </div>

          {switching && switchable.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {t("adsCatalog.ga4SwitchProperty")}
              </div>
              {switchable.map((property) => {
                const isActive = property.propertyId === activeId;
                return (
                  <button
                    key={property.propertyId}
                    type="button"
                    disabled={disabled || isActive}
                    style={isActive ? activeAccountBtn : { ...secondaryBtn, textAlign: "left" }}
                    onClick={() =>
                      void post("/api/ga4/properties", { propertyIds: [property.propertyId] })
                    }
                  >
                    {propertyLabel(property)}
                    {isActive ? ` · ${t("adsCatalog.adsCurrentAccount")}` : ""}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {switchable.length > 1 ? (
              <button
                type="button"
                style={secondaryBtn}
                disabled={disabled}
                onClick={() => setSwitching((value) => !value)}
              >
                {switching ? t("ga4.togglePropertyCollapse") : t("adsCatalog.ga4SwitchProperty")}
              </button>
            ) : null}
            <button
              type="button"
              style={secondaryBtn}
              disabled={disabled}
              onClick={() => void openOAuth(true)}
            >
              {t("adsCatalog.ga4Reauth")}
            </button>
            <button
              type="button"
              style={secondaryBtn}
              disabled={disabled}
              onClick={() => void post("/api/ga4/disconnect")}
            >
              {t("adsCatalog.ga4Disconnect")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ ...pageHintTextStyle, margin: 0 }}>{t("adsCatalog.ga4ConnectHint")}</p>
          <div>
            <button
              type="button"
              style={softConnectBtn}
              disabled={disabled}
              onClick={() => void openOAuth()}
            >
              {t("adsCatalog.ga4Connect")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
