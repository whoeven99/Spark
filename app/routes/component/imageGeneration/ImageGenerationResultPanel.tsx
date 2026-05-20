import { useTranslation } from "react-i18next";
import { pageEmptyStateStyle } from "../../page/pageUiStyles";

export type ImageGenerationResultPanelProps = {
  isSubmitting: boolean;
  hasSubmittedOnce: boolean;
  resultErrorText: string;
  generatedImageUrl: string | null;
  onRetry: () => void;
};

function EmptyState({ message }: { message: string }) {
  return <p style={pageEmptyStateStyle}>{message}</p>;
}

export function ImageGenerationResultPanel({
  isSubmitting,
  hasSubmittedOnce,
  resultErrorText,
  generatedImageUrl,
  onRetry,
}: ImageGenerationResultPanelProps) {
  const { t } = useTranslation();

  if (isSubmitting) {
    return (
      <div>
        <p style={pageEmptyStateStyle}>{t("imageGeneration.submitting")}</p>
      </div>
    );
  }

  if (resultErrorText) {
    return (
      <div>
        <div style={{ color: "#8a2712", marginBottom: "12px" }}>{resultErrorText}</div>
        <s-button variant="secondary" onClick={onRetry}>
          {t("imageGeneration.retry")}
        </s-button>
      </div>
    );
  }

  if (!generatedImageUrl) {
    return (
      <EmptyState
        message={
          hasSubmittedOnce
            ? t("imageGeneration.empty")
            : t("imageGeneration.emptyBeforeSubmit")
        }
      />
    );
  }

  return (
    <div>
      <img
        src={generatedImageUrl}
        alt={t("imageGeneration.generatedImageAlt")}
        style={{
          width: "100%",
          maxHeight: "480px",
          objectFit: "contain",
          borderRadius: "8px",
          border: "1px solid #e1e3e5",
        }}
      />
      <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <s-button
          variant="secondary"
          onClick={() => {
            window.open(generatedImageUrl, "_blank", "noopener,noreferrer");
          }}
        >
          {t("imageGeneration.openImage")}
        </s-button>
        <s-button variant="secondary" onClick={onRetry}>
          {t("imageGeneration.retry")}
        </s-button>
      </div>
    </div>
  );
}
