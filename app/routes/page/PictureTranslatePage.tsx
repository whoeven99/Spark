import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import type { PictureTranslatePageLoaderData } from "../../server/pictureTranslate/pictureTranslatePageLoader.server";
import { PictureTranslateForm } from "../component/pictureTranslate/PictureTranslateForm";
import { PictureTranslateHistorySection } from "../component/pictureTranslate/PictureTranslateHistorySection";
import { PictureTranslateProvider } from "../component/pictureTranslate/pictureTranslateContext";
import { PictureTranslateResultPanel } from "../component/pictureTranslate/PictureTranslateResultPanel";
import {
  PageSectionHeader,
  PageSurface,
  pageContentStyle,
  pageTrustFootnoteStyle,
  stickyAsideColumnStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  twoColumnSideStyle,
} from "./pageUiStyles";

export function PictureTranslatePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<PictureTranslatePageLoaderData>();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  return (
    <PictureTranslateProvider
      mode="page"
      locationSearch={locationSearch}
      initialHistory={loaderData.history}
      toastShow={(message) => {
        shopify.toast.show(message);
      }}
    >
      <s-page heading={t("pictureTranslate.pageTitle")}>
        <div style={pageContentStyle}>
          <PageSectionHeader
            title={t("pictureTranslate.sectionConfig")}
            subtitle={t("pictureTranslate.pageSubtitle")}
          />

          <div style={twoColumnLayoutStyle}>
            <div style={twoColumnMainStyle}>
              <PageSurface>
                <PictureTranslateForm variant="page" />
              </PageSurface>

              <PictureTranslateHistorySection />
            </div>

            <div style={{ ...twoColumnSideStyle, ...stickyAsideColumnStyle }}>
              <PageSurface title={t("pictureTranslate.result")}>
                <PictureTranslateResultPanel />
              </PageSurface>
            </div>
          </div>

          <p style={pageTrustFootnoteStyle}>{t("pictureTranslate.pageFootnote")}</p>
        </div>
      </s-page>
    </PictureTranslateProvider>
  );
}
