import { useTranslation } from "react-i18next";
import {
  formErrorBoxStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageTextareaStyle,
} from "../../page/pageUiStyles";

export type ImageGenerationFormProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  descriptionErrorText: string;
  busy: boolean;
  isSubmitting: boolean;
  onGenerateImage: () => void;
};

export function ImageGenerationForm({
  description,
  onDescriptionChange,
  descriptionErrorText,
  busy,
  isSubmitting,
  onGenerateImage,
}: ImageGenerationFormProps) {
  const { t } = useTranslation();

  return (
    <div>
      <label style={pageFieldLabelStyle} htmlFor="image-gen-description">
        {t("imageGeneration.descriptionLabel")}
      </label>
      <p style={pageHintTextStyle}>{t("imageGeneration.descriptionHint")}</p>
      <textarea
        id="image-gen-description"
        style={pageTextareaStyle({ minHeight: "120px" })}
        rows={4}
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder={t("imageGeneration.descriptionPlaceholder")}
        disabled={busy}
      />

      {descriptionErrorText ? (
        <div style={{ ...formErrorBoxStyle, marginTop: "12px" }}>
          {descriptionErrorText}
        </div>
      ) : null}

      <div style={{ marginTop: "16px" }}>
        <s-button
          variant="primary"
          onClick={() => void onGenerateImage()}
          disabled={busy || !description.trim()}
        >
          {isSubmitting
            ? t("imageGeneration.submitting")
            : t("imageGeneration.submit")}
        </s-button>
      </div>
    </div>
  );
}
