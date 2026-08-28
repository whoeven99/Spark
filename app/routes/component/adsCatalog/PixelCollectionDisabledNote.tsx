import { useTranslation } from "react-i18next";
import { pageColorTokens, pageHintTextStyle } from "../../page/pageUiStyles";

const cardStyle = {
  border: `1px solid ${pageColorTokens.border}`,
  borderRadius: pageColorTokens.radiusCard,
  padding: 20,
  background: pageColorTokens.surface,
  display: "flex",
  flexDirection: "column" as const,
  gap: 10,
};

export function PixelCollectionDisabledNote() {
  const { t } = useTranslation();
  return (
    <div style={cardStyle}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {t("adsCatalog.pixelCollectionDisabledTitle")}
      </h3>
      <p style={{ ...pageHintTextStyle, margin: 0 }}>
        {t("adsCatalog.pixelCollectionDisabledBody")}
      </p>
      <p style={{ ...pageHintTextStyle, margin: 0 }}>
        {t("adsCatalog.pixelCollectionDisabledCustomPixelHint")}
      </p>
    </div>
  );
}
