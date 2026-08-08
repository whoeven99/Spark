import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES } from "../../../lib/tiktokCatalogRegions";
import { pageFieldLabelStyle, pageHintTextStyle, pageSelectStyle } from "../../page/pageUiStyles";

type Props = {
  locationSearch: string;
  value: string;
  inferredRegion?: string;
  disabled?: boolean;
  onChanged?: (regionCode: string) => void;
};

export function TiktokCatalogRegionSelect({
  locationSearch,
  value,
  inferredRegion,
  disabled = false,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const [region, setRegion] = useState(value || "DE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value) setRegion(value);
  }, [value]);

  const inferredUnsupported =
    Boolean(inferredRegion) &&
    inferredRegion !== region &&
    !TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES.includes(
      inferredRegion as (typeof TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES)[number],
    );

  async function persistRegion(nextRegion: string) {
    setRegion(nextRegion);
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch(`/api/ads-catalog/tiktok-catalog-region${locationSearch}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionCode: nextRegion }),
      });
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        setError(data.error ?? t("adsCatalog.authError"));
        return;
      }
      onChanged?.(nextRegion);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("adsCatalog.authError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label style={pageFieldLabelStyle}>{t("adsCatalog.tiktokCatalogRegionLabel")}</label>
      <select
        value={region}
        disabled={disabled || saving}
        onChange={(e) => void persistRegion(e.target.value)}
        style={{ ...pageSelectStyle, marginTop: 6, maxWidth: 280 }}
      >
        {TIKTOK_CATALOG_AUTO_CREATE_REGION_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      <p style={pageHintTextStyle}>
        {inferredUnsupported
          ? t("adsCatalog.tiktokCatalogRegionInferredUnsupported", { region: inferredRegion })
          : inferredRegion
            ? t("adsCatalog.tiktokCatalogRegionInferred", { region: inferredRegion })
            : t("adsCatalog.tiktokCatalogRegionHint")}
      </p>
      {saving && <p style={pageHintTextStyle}>{t("adsCatalog.tiktokCatalogRegionSaving")}</p>}
      {error && <div style={{ color: "#d72c0d", fontSize: 13 }}>{error}</div>}
    </div>
  );
}
