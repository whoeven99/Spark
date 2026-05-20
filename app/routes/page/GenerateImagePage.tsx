import { useAppBridge } from "@shopify/app-bridge-react";
import { useLoaderData } from "react-router";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import type { GenerateImagePageLoaderData } from "../../server/imageGeneration/imageGenerationPageLoader.server";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import { ImageGenerationHistoryPanel } from "../component/imageGeneration/ImageGenerationHistoryPanel";
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
    prompt,
    setPrompt,
    descriptionErrorText,
    promptErrorText,
    resultErrorText,
    isGeneratingPrompt,
    isSubmitting,
    isPolling,
    busy,
    generatedImageUrl,
    requestId,
    hasSubmittedOnce,
    hasGeneratedPromptOnce,
    history,
    submitGeneratePrompt,
    submitGenerate,
    resetResult,
    selectHistoryItem,
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
                prompt={prompt}
                onPromptChange={setPrompt}
                promptErrorText={promptErrorText}
                busy={busy}
                isGeneratingPrompt={isGeneratingPrompt}
                isSubmitting={isSubmitting || isPolling}
                hasGeneratedPromptOnce={hasGeneratedPromptOnce}
                onGeneratePrompt={() => void submitGeneratePrompt()}
                onGenerateImage={() => void submitGenerate()}
              />
            </PageSurface>

            <PageSurface title={t("imageGeneration.historyTitle")}>
              <ImageGenerationHistoryPanel
                items={history}
                activeRequestId={requestId}
                onSelect={selectHistoryItem}
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
