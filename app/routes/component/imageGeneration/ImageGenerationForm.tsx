import { useTranslation } from "react-i18next";
import {
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageTextareaStyle,
} from "../../page/pageUiStyles";

const stepDividerStyle = {
  margin: "20px 0",
  borderTop: `1px solid ${pageColorTokens.divider}`,
} as const;

export type ImageGenerationFormProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  descriptionErrorText: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  promptErrorText: string;
  busy: boolean;
  isGeneratingPrompt: boolean;
  isSubmitting: boolean;
  hasGeneratedPromptOnce: boolean;
  onGeneratePrompt: () => void;
  onGenerateImage: () => void;
};

export function ImageGenerationForm({
  description,
  onDescriptionChange,
  descriptionErrorText,
  prompt,
  onPromptChange,
  promptErrorText,
  busy,
  isGeneratingPrompt,
  isSubmitting,
  hasGeneratedPromptOnce,
  onGeneratePrompt,
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

      <div style={{ marginTop: "12px" }}>
        <s-button
          variant="secondary"
          onClick={() => void onGeneratePrompt()}
          disabled={busy || !description.trim()}
        >
          {isGeneratingPrompt
            ? t("imageGeneration.generatingPrompt")
            : t("imageGeneration.generatePrompt")}
        </s-button>
      </div>

      <div style={stepDividerStyle} role="separator" />

      <label style={pageFieldLabelStyle} htmlFor="image-gen-prompt">
        {t("imageGeneration.promptLabel")}
      </label>
      <p style={pageHintTextStyle}>
        {hasGeneratedPromptOnce
          ? t("imageGeneration.promptHintAfterGen")
          : t("imageGeneration.promptHintBeforeGen")}
      </p>
      <textarea
        id="image-gen-prompt"
        style={pageTextareaStyle()}
        rows={6}
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={t("imageGeneration.promptPlaceholder")}
        disabled={busy}
      />

      {promptErrorText ? (
        <div style={{ ...formErrorBoxStyle, marginTop: "12px" }}>{promptErrorText}</div>
      ) : null}

      <div style={{ marginTop: "16px" }}>
        <s-button
          variant="primary"
          onClick={() => void onGenerateImage()}
          disabled={busy || !prompt.trim()}
        >
          {isSubmitting
            ? t("imageGeneration.submitting")
            : t("imageGeneration.submit")}
        </s-button>
      </div>
    </div>
  );
}
