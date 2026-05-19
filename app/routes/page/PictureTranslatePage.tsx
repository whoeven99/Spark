import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { PictureTranslateResultPanel } from "../component/pictureTranslate/PictureTranslateResultPanel";

export function PictureTranslatePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    console.info("[PictureTranslatePage] mount");
  }, []);

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      toastShow={(message) => {
        shopify.toast.show(message);
      }}
    >
      <s-page heading={t("pictureTranslate.pageTitle")}>
        <div
          style={{
            fontSize: "0.875rem",
            color: "#6d7175",
            lineHeight: 1.5,
            marginBottom: "1rem",
          }}
        >
          {t("pictureTranslate.pageSubtitle")}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.5rem",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: "2 1 360px", minWidth: 0 }}>
            <s-section heading={t("pictureTranslate.sectionConfig")}>
              <PictureTranslateForm variant="page" />
            </s-section>
          </div>

          <div style={{ flex: "3 1 480px", minWidth: 0 }}>
            <s-section heading={t("pictureTranslate.result")}>
              <PictureTranslateResultPanel />
            </s-section>
          </div>
        </div>
      </s-page>
    </PictureTranslateProvider>
  );
}
