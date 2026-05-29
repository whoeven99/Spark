import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../hooks/useImageGeneration";
import { ImageGenerationForm } from "../component/imageGeneration/ImageGenerationForm";
import {
  PageSectionHeader,
  PageSurface,
  pageContentStyle,
  pageTrustFootnoteStyle,
} from "./pageUiStyles";

export function GenerateImagePage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const { description, setDescription, descriptionErrorText, isSubmitting, submitGenerate } =
    useImageGeneration({
      locationSearch,
      toastShow: (message) => shopify.toast.show(message),
    });

  return (
    <s-page heading={t("imageGeneration.pageTitle")}>
      <div style={pageContentStyle}>
        <PageSectionHeader
          title={t("imageGeneration.sectionConfig")}
          subtitle={t("imageGeneration.pageSubtitle")}
        />

        <PageSurface>
          <ImageGenerationForm
            description={description}
            onDescriptionChange={setDescription}
            descriptionErrorText={descriptionErrorText}
            busy={isSubmitting}
            isSubmitting={isSubmitting}
            onGenerateImage={() => void submitGenerate()}
          />
        </PageSurface>

        <p style={pageTrustFootnoteStyle}>{t("imageGeneration.pageFootnote")}</p>
      </div>
    </s-page>
  );
}
