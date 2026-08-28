import { useTranslation } from "react-i18next";
import { PixelCollectionDisabledNote } from "../component/adsCatalog/PixelCollectionDisabledNote";
import { PageHeaderNav, pageContentStyle } from "./pageUiStyles";

export function PixelCollectionDisabledPage() {
  const { t } = useTranslation();
  return (
    <div style={pageContentStyle}>
      <PageHeaderNav
        title={t("adsCatalog.pixelCollectionDisabledTitle")}
        subtitle={t("adsCatalog.pixelCollectionDisabledBody")}
        backLabel={t("adsCatalog.pixelCollectionDisabledBack")}
        fallbackPath="/app/ads-catalog?tab=credentials"
        preserveSearch
      />
      <PixelCollectionDisabledNote />
    </div>
  );
}
