import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { PictureTranslateResultPanel } from "../component/pictureTranslate/PictureTranslateResultPanel";
import {
  PageSurface,
  pageContentStyle,
  pageIntroBannerStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  twoColumnSideStyle,
} from "./pageUiStyles";

export function PictureTranslatePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      toastShow={(message) => {
        shopify.toast.show(message);
      }}
    >
      <s-page heading={t("pictureTranslate.pageTitle")}>
        <div style={pageIntroBannerStyle("picture", { marginBottom: "1.5rem" })}>
          {t("pictureTranslate.pageSubtitle")}
        </div>

        <div style={pageContentStyle}>
        <div style={twoColumnLayoutStyle}>
          <div style={twoColumnMainStyle}>
            <PageSurface title={t("pictureTranslate.sectionConfig")}>
              <PictureTranslateForm variant="page" />
            </PageSurface>
          </div>

          <div style={twoColumnSideStyle}>
            <PageSurface title={t("pictureTranslate.result")}>
              <PictureTranslateResultPanel />
            </PageSurface>
          </div>
        </div>
        </div>
      </s-page>
    </PictureTranslateProvider>
  );
}
