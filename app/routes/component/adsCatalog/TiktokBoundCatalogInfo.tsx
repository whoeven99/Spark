import { useTranslation } from "react-i18next";
import {
  resolveTiktokCatalogSyncStatus,
  type TiktokCatalogSyncStatus,
} from "../../../lib/tiktokCatalogSyncability";
import { pageHintTextStyle } from "../../page/pageUiStyles";
import { TiktokCreateCatalogForm } from "./TiktokCreateCatalogForm";

type Props = {
  catalogId: string;
  catalogName?: string;
  bindingMode?: string;
  currency?: string;
  regionCode?: string;
  channel?: string;
  locationSearch?: string;
  inferredTiktokRegion?: string;
  catalogRegionCode?: string;
  shopLabel?: string;
  onChanged?: () => void;
};

function syncStatusLabel(
  status: TiktokCatalogSyncStatus,
  t: (key: string) => string,
): string | null {
  switch (status) {
    case "official":
      return t("adsCatalog.tiktokModeOfficialShort");
    case "syncable":
      return t("adsCatalog.tiktokCatalogSyncable");
    case "not_syncable":
      return t("adsCatalog.tiktokCatalogNotSyncable");
    default:
      return null;
  }
}

export function TiktokBoundCatalogInfo({
  catalogId,
  catalogName,
  bindingMode,
  currency,
  regionCode,
  channel,
  locationSearch,
  inferredTiktokRegion,
  catalogRegionCode,
  shopLabel,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const syncStatus = resolveTiktokCatalogSyncStatus({
    bindingMode,
    channel: channel === "" ? "" : channel,
  });
  const statusText = syncStatusLabel(syncStatus, t);
  const showCreateForm =
    syncStatus === "not_syncable" &&
    Boolean(locationSearch && onChanged && inferredTiktokRegion);
  const defaultCatalogName = `Spark Catalog — ${(shopLabel || "Store").slice(0, 40)}`;

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
        {statusText ? ` (${statusText})` : ""}
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
      {syncStatus === "not_syncable" && (
        <div style={{ ...pageHintTextStyle, color: "#b42318", marginTop: 6 }}>
          {t("adsCatalog.tiktokCatalogNotSyncableHint")}
        </div>
      )}
      {showCreateForm && (
        <TiktokCreateCatalogForm
          locationSearch={locationSearch!}
          inferredTiktokRegion={inferredTiktokRegion!}
          catalogRegionCode={catalogRegionCode}
          defaultCatalogName={defaultCatalogName}
          onCreated={onChanged!}
        />
      )}
      <p style={{ ...pageHintTextStyle, marginBottom: 0, marginTop: 8 }}>
        {t("adsCatalog.tiktokBoundCatalogMetaHint")}
      </p>
    </div>
  );
}
