import type { CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useImageGeneration } from "../../../hooks/useImageGeneration";
import type { ImageGenerationFormPayload } from "../../../lib/imageGenerationFormPayload";
import { ImageGenerationForm } from "../imageGeneration/ImageGenerationForm";

type ImageGenerationChatCardProps = {
  embedded?: boolean;
  initialFormPayload?: ImageGenerationFormPayload;
  onTaskCreated?: (taskId: string, batchId: string) => void;
};

export function ImageGenerationChatCard({
  embedded = false,
  initialFormPayload,
  onTaskCreated,
}: ImageGenerationChatCardProps) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch =
    typeof window !== "undefined" ? window.location.search : "";

  const {
    description,
    setDescription,
    descriptionErrorText,
    isSubmitting,
    submitGenerate,
  } = useImageGeneration({
    locationSearch,
    initialFormPayload,
    toastShow: (message) => {
      shopify.toast.show(message);
    },
    onTaskCreated: (taskId, batchId) => {
      onTaskCreated?.(taskId, batchId);
    },
  });

  const shellStyle: CSSProperties = {
    marginTop: embedded ? 0 : "0.5rem",
    borderRadius: embedded ? "14px" : "16px",
    padding: "1px",
    background:
      "linear-gradient(135deg, rgba(44, 110, 203, 0.38) 0%, rgba(0, 128, 96, 0.28) 50%, rgba(147, 112, 219, 0.22) 100%)",
    boxShadow: embedded
      ? "0 2px 12px rgba(0, 0, 0, 0.05)"
      : "0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
  };

  const innerStyle: CSSProperties = {
    borderRadius: embedded ? "13px" : "15px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbfb 100%)",
    overflow: "hidden",
  };

  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <div style={{ padding: embedded ? "0.85rem 1rem 1rem" : "1rem 1.125rem 1.125rem" }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <div
              style={{
                fontSize: embedded ? "1rem" : "1.0625rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#111213",
              }}
            >
              {t("imageGeneration.pageTitle")}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#6d7175", lineHeight: 1.5 }}>
              {t("imageGeneration.pageSubtitle")}
            </div>
          </div>
          <ImageGenerationForm
            description={description}
            onDescriptionChange={setDescription}
            descriptionErrorText={descriptionErrorText}
            busy={isSubmitting}
            isSubmitting={isSubmitting}
            onGenerateImage={() => void submitGenerate()}
          />
        </div>
      </div>
    </div>
  );
}
