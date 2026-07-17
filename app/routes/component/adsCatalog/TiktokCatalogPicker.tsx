import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pageColorTokens, pageFieldLabelStyle, pageHintTextStyle } from "../../page/pageUiStyles";

type CatalogOption = {
  id: string;
  name: string;
  bindingMode: "shopify_official" | "api_managed";
};

type Props = {
  locationSearch: string;
  boundCatalogId: string;
  boundBindingMode: "" | "shopify_official" | "api_managed";
  onChanged: () => void;
  /** 同步页使用更紧凑的标签文案 */
  variant?: "sync" | "credentials";
};

const selectStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid ${pageColorTokens.borderInput}`,
  fontSize: 13,
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

export function TiktokCatalogPicker({
  locationSearch,
  boundCatalogId,
  boundBindingMode,
  onChanged,
  variant = "sync",
}: Props) {
  const { t } = useTranslation();
  const [catalogs, setCatalogs] = useState<CatalogOption[]>([]);
  const [selected, setSelected] = useState(boundCatalogId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modeLabel = useCallback(
    (mode: CatalogOption["bindingMode"]) =>
      mode === "shopify_official"
        ? t("adsCatalog.tiktokModeOfficialShort")
        : t("adsCatalog.tiktokModeApiShort"),
    [t],
  );

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-catalogs${locationSearch}`, {
        headers: { Accept: "application/json" },
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        catalogs?: CatalogOption[];
        boundCatalogId?: string;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? t("adsCatalog.authError"));
      }
      setCatalogs(data.catalogs ?? []);
      if (data.boundCatalogId) {
        setSelected(data.boundCatalogId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setLoading(false);
    }
  }, [locationSearch, t]);

  useEffect(() => {
    void loadCatalogs();
  }, [loadCatalogs]);

  useEffect(() => {
    setSelected(boundCatalogId);
  }, [boundCatalogId]);

  const selectedCatalog = useMemo(
    () => catalogs.find((c) => c.id === selected) ?? null,
    [catalogs, selected],
  );

  const canSwitch = Boolean(selected) && selected !== boundCatalogId && !loading && !busy;

  async function handleSwitch() {
    if (!canSwitch || !selectedCatalog) return;
    const proceed = window.confirm(
      t("adsCatalog.confirmTiktokSwitchCatalog", {
        name: selectedCatalog.name,
        mode: modeLabel(selectedCatalog.bindingMode),
      }),
    );
    if (!proceed) return;

    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-catalogs${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: selected }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        unchanged?: boolean;
      };
      if (!resp.ok || !data.ok) {
        throw new Error(data.error ?? t("adsCatalog.authError"));
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setBusy(false);
    }
  }

  const label =
    variant === "sync"
      ? t("adsCatalog.tiktokSyncCatalogLabel")
      : t("adsCatalog.tiktokSwitchCatalogLabel");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={pageFieldLabelStyle}>{label}</label>
      {boundCatalogId && boundBindingMode && (
        <p style={{ ...pageHintTextStyle, margin: 0 }}>
          {t("adsCatalog.tiktokBoundCatalog", {
            name:
              catalogs.find((c) => c.id === boundCatalogId)?.name || boundCatalogId,
            mode: modeLabel(boundBindingMode),
          })}
        </p>
      )}
      {loading ? (
        <p style={pageHintTextStyle}>{t("adsCatalog.tiktokCatalogListLoading")}</p>
      ) : catalogs.length === 0 ? (
        <p style={pageHintTextStyle}>{t("adsCatalog.tiktokCatalogListEmpty")}</p>
      ) : (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={selectStyle}
          disabled={busy}
        >
          {catalogs.map((c) => (
            <option key={c.id} value={c.id}>
              {`${c.name} (${modeLabel(c.bindingMode)}) — ${c.id}`}
            </option>
          ))}
        </select>
      )}
      {selectedCatalog && (
        <p style={pageHintTextStyle}>
          {selectedCatalog.bindingMode === "shopify_official"
            ? t("adsCatalog.tiktokModeOfficialHint")
            : t("adsCatalog.tiktokModeApiHint")}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          style={primaryBtn}
          disabled={!canSwitch}
          onClick={() => void handleSwitch()}
        >
          {busy ? t("adsCatalog.tiktokSwitchCatalogBusy") : t("adsCatalog.tiktokSwitchCatalog")}
        </button>
        <button
          type="button"
          style={secondaryBtn}
          disabled={loading || busy}
          onClick={() => void loadCatalogs()}
        >
          {t("adsCatalog.tiktokCatalogListRefresh")}
        </button>
      </div>
      {error && (
        <div style={{ color: pageColorTokens.criticalText, fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}
