import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isTiktokCatalogAutoCreateRegion } from "../../../lib/tiktokCatalogRegions";
import { pageColorTokens, pageFieldLabelStyle, pageHintTextStyle } from "../../page/pageUiStyles";

type Props = {
  locationSearch: string;
  inferredTiktokRegion: string;
  catalogRegionCode?: string;
  defaultCatalogName: string;
  onCreated: () => void;
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
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

export function TiktokCreateCatalogForm({
  locationSearch,
  inferredTiktokRegion,
  catalogRegionCode,
  defaultCatalogName,
  onCreated,
}: Props) {
  const { t } = useTranslation();
  const [catalogName, setCatalogName] = useState(defaultCatalogName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const trimmedName = catalogName.trim();
    if (!trimmedName) {
      setError(t("adsCatalog.tiktokCreateCatalogNameRequired"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const regionCode =
        catalogRegionCode ||
        (isTiktokCatalogAutoCreateRegion(inferredTiktokRegion) ? inferredTiktokRegion : "DE");
      const resp = await fetch(`/api/ads-catalog/tiktok-create-catalog${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionCode, catalogName: trimmedName }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? t("adsCatalog.authError"));
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: "12px 14px",
        borderRadius: 8,
        background: "#fff",
        border: `1px solid ${pageColorTokens.borderSubtle}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>
        {t("adsCatalog.tiktokCreateCatalogSectionTitle")}
      </div>
      <p style={{ ...pageHintTextStyle, margin: 0 }}>
        {t("adsCatalog.tiktokCreateCatalogSectionHint")}
      </p>
      <div>
        <label style={pageFieldLabelStyle}>{t("adsCatalog.tiktokCreateCatalogNameLabel")}</label>
        <input
          type="text"
          value={catalogName}
          onChange={(e) => setCatalogName(e.target.value)}
          placeholder={t("adsCatalog.tiktokCreateCatalogNamePlaceholder")}
          maxLength={80}
          disabled={busy}
          style={{ ...inputStyle, marginTop: 6 }}
        />
      </div>
      <div>
        <button
          type="button"
          style={{ ...primaryBtn, opacity: busy ? 0.7 : 1 }}
          disabled={busy}
          onClick={() => void handleCreate()}
        >
          {busy ? t("adsCatalog.tiktokCreateCatalogBusy") : t("adsCatalog.tiktokCreateCatalog")}
        </button>
      </div>
      {error && (
        <div style={{ color: pageColorTokens.criticalText, fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}
