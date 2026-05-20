import { useTranslation } from "react-i18next";
import {
  formErrorBoxStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageTextareaStyle,
} from "../../page/pageUiStyles";

export type ImageGenerationFormProps = {
  prompt: string;
  onPromptChange: (value: string) => void;
  formErrorText: string;
  isSubmitting: boolean;
  onSubmit: () => void;
};

export function ImageGenerationForm({
  prompt,
  onPromptChange,
  formErrorText,
  isSubmitting,
  onSubmit,
}: ImageGenerationFormProps) {
  const { t } = useTranslation();

  return (
    <div>
      <label style={pageFieldLabelStyle} htmlFor="image-gen-prompt">
        {t("imageGeneration.promptLabel")}
      </label>
      <p style={pageHintTextStyle}>{t("imageGeneration.promptHint")}</p>
      <textarea
        id="image-gen-prompt"
        style={pageTextareaStyle()}
        rows={6}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={t("imageGeneration.promptPlaceholder")}
        disabled={isSubmitting}
      />

      {formErrorText ? (
        <div style={{ ...formErrorBoxStyle, marginTop: "12px" }}>{formErrorText}</div>
      ) : null}

      <div style={{ marginTop: "16px" }}>
        <s-button
          variant="primary"
          onClick={() => void onSubmit()}
          disabled={isSubmitting || !prompt.trim()}
        >
          {isSubmitting
            ? t("imageGeneration.submitting")
            : t("imageGeneration.submit")}
        </s-button>
      </div>
    </div>
  );
}
