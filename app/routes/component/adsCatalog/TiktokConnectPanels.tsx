import { useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";
import type { CredentialsView } from "./types";

type Props = {
  credentials: CredentialsView;
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
            <div style={pageHintTextStyle}>
              {t("adsCatalog.tiktokUpdatedAt", { time: fmtDate(tiktok.updatedAt) })}
            </div>
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
      ) : tiktok.pendingCatalogs.length > 0 ? (
        <CatalogSelect
          label={t("adsCatalog.tiktokSelectCatalog")}
          catalogs={tiktok.pendingCatalogs.map((c) => ({ id: c.id, label: c.name || c.id }))}
          busy={busy}
          onSelect={(id) => void post("/api/ads-catalog/tiktok-catalogs", { catalogId: id })}
        />
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
