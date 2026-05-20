import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import type { GenerateImagePageLoaderData } from "../../server/imageGeneration/imageGenerationPageLoader.server";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import { ShopVisualJobHistoryPanel } from "../component/shopVisualJob/ShopVisualJobHistoryPanel";
import { ImageGenerationResultPanel } from "../component/imageGeneration/ImageGenerationResultPanel";
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

export function GenerateImagePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<GenerateImagePageLoaderData>();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const {
    description,
    setDescription,
    descriptionErrorText,
    resultErrorText,
    isSubmitting,
    isPolling,
    busy,
    generatedImageUrl,
    requestId,
    hasSubmittedOnce,
    history,
    submitGenerate,
    resetResult,
    selectHistoryItem,
    deleteHistoryItem,
    deletingRequestId,
  } = useImageGeneration({
    locationSearch,
    initialHistory: loaderData.history,
    toastShow: (message) => {
      shopify.toast.show(message);
    },
  });

  const handleRetry = () => {
    resetResult();
  };

  return (
    <s-page heading={t("imageGeneration.pageTitle")}>
      <div style={pageContentStyle}>
        <PageSectionHeader
          title={t("imageGeneration.sectionConfig")}
          subtitle={t("imageGeneration.pageSubtitle")}
        />

        <div style={twoColumnLayoutStyle}>
          <div style={twoColumnMainStyle}>
            <PageSurface>
              <ImageGenerationForm
                description={description}
                onDescriptionChange={setDescription}
                descriptionErrorText={descriptionErrorText}
                busy={busy}
                isSubmitting={isSubmitting || isPolling}
                onGenerateImage={() => void submitGenerate()}
              />
            </PageSurface>

            <PageSurface title={t("imageGeneration.historyTitle")}>
              <ShopVisualJobHistoryPanel
                i18nPrefix="imageGeneration"
                items={history}
                activeRequestId={requestId}
                onSelect={selectHistoryItem}
                onDelete={(item) => void deleteHistoryItem(item)}
                deletingRequestId={deletingRequestId}
              />
            </PageSurface>
          </div>

          <div style={{ ...twoColumnSideStyle, ...stickyAsideColumnStyle }}>
            <PageSurface title={t("imageGeneration.result")}>
              <ImageGenerationResultPanel
                isSubmitting={isSubmitting}
                isPolling={isPolling}
                hasSubmittedOnce={hasSubmittedOnce}
                resultErrorText={resultErrorText}
                generatedImageUrl={generatedImageUrl}
                onRetry={handleRetry}
              />
            </PageSurface>
          </div>
        </div>

        <p style={pageTrustFootnoteStyle}>{t("imageGeneration.pageFootnote")}</p>
      </div>
    </s-page>
  );
}
