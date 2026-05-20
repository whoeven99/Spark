import { useTranslation } from "react-i18next";
import { PageSurface } from "../../page/pageUiStyles";
import { ShopVisualJobHistoryPanel } from "../shopVisualJob/ShopVisualJobHistoryPanel";
import { usePictureTranslateContext } from "./pictureTranslateContext";

export function PictureTranslateHistorySection() {
  const { t } = useTranslation();
  const { history, requestId, selectHistoryItem } = usePictureTranslateContext();

  return (
    <PageSurface title={t("pictureTranslate.historyTitle")}>
      <ShopVisualJobHistoryPanel
        i18nPrefix="pictureTranslate"
        items={history}
        activeRequestId={requestId}
        onSelect={selectHistoryItem}
      />
    </PageSurface>
  );
}
