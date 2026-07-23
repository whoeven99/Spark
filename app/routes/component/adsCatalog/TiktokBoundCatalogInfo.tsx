import { useTranslation } from "react-i18next";
import { pageFieldLabelStyle, pageHintTextStyle } from "../../page/pageUiStyles";

type Props = {
  catalogId: string;
  catalogName?: string;
  bindingMode?: string;
  currency?: string;
  regionCode?: string;
  channel?: string;
};

export function TiktokBoundCatalogInfo({
  catalogId,
  catalogName,
  bindingMode,
  currency,
  regionCode,
  channel,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        background: "#f6f6f7",
        border: "1px solid #e3e3e3",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {t("adsCatalog.tiktokBoundCatalogMetaTitle")}
      </div>
      <div>
        {catalogName || catalogId}
        {bindingMode === "api_managed"
          ? ` (${t("adsCatalog.tiktokModeApiShort")})`
          : bindingMode === "shopify_official"
            ? ` (${t("adsCatalog.tiktokModeOfficialShort")})`
            : ""}
      </div>
      <div style={pageHintTextStyle}>
        {t("adsCatalog.tiktokBoundCatalogMetaId", { id: catalogId })}
      </div>
      {(currency || regionCode) && (
        <div style={{ marginTop: 6 }}>
          {t("adsCatalog.tiktokBoundCatalogMetaMarket", {
            currency: currency || "—",
            region: regionCode || "—",
          })}
        </div>
      )}
      {channel && (
        <div style={pageHintTextStyle}>
          {t("adsCatalog.tiktokBoundCatalogMetaChannel", { channel })}
        </div>
      )}
      <p style={{ ...pageHintTextStyle, marginBottom: 0, marginTop: 8 }}>
        {t("adsCatalog.tiktokBoundCatalogMetaHint")}
      </p>
    </div>
  );
}
