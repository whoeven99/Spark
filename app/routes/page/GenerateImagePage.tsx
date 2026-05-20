import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
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
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const {
    prompt,
    setPrompt,
    formErrorText,
    resultErrorText,
    isSubmitting,
    generatedImageUrl,
    hasSubmittedOnce,
    submitGenerate,
    resetResult,
  } = useImageGeneration({
    locationSearch,
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
                prompt={prompt}
                onPromptChange={setPrompt}
                formErrorText={formErrorText}
                isSubmitting={isSubmitting}
                onSubmit={() => void submitGenerate()}
              />
            </PageSurface>
          </div>

          <div style={{ ...twoColumnSideStyle, ...stickyAsideColumnStyle }}>
            <PageSurface title={t("imageGeneration.result")}>
              <ImageGenerationResultPanel
                isSubmitting={isSubmitting}
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
