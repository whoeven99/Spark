import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import {
  PageSectionHeader,
  PageSurface,
  pageContentStyle,
  pageTrustFootnoteStyle,
} from "./pageUiStyles";

function PictureTranslatePageInner() {
  const { t } = useTranslation();

  return (
    <s-page heading={t("pictureTranslate.pageTitle")}>
      <div style={pageContentStyle}>
        <PageSectionHeader
          title={t("pictureTranslate.sectionConfig")}
          subtitle={t("pictureTranslate.pageSubtitle")}
        />

        <PageSurface>
          <PictureTranslateForm variant="page" />
        </PageSurface>

        <p style={pageTrustFootnoteStyle}>{t("pictureTranslate.pageFootnote")}</p>
      </div>
    </s-page>
  );
}

export function PictureTranslatePage() {
  const shopify = useAppBridge();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      toastShow={(message) => shopify.toast.show(message)}
    >
      <PictureTranslatePageInner />
    </PictureTranslateProvider>
  );
}
