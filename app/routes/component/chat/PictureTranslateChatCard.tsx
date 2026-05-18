import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import {
  filterPictureTranslateSourceLanguages,
  filterPictureTranslateTargetLanguages,
  type PictureTranslateProvider,
} from "../../../config/pictureTranslateLanguages";

type PictureTranslateLanguageOption = {
  value: string;
  label: string;
};

type PictureTranslateChatCardProps = {
  embedded?: boolean;
  onSuccess: (detail: { translatedImage: string; message: string }) => void;
};

type PictureTranslateChatResponse = {
  success?: unknown;
  translatedImage?: unknown;
  error?: unknown;
  requestId?: unknown;
};

const PICTURE_TRANSLATE_PROVIDER: PictureTranslateProvider | null = null;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_file_failed"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result.trim() : "";
      if (!result) {
        reject(new Error("read_file_failed"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export function PictureTranslateChatCard({
  embedded = false,
  onSuccess,
}: PictureTranslateChatCardProps) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState("");
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageFileName, setImageFileName] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("zh");
  const [errorText, setErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceLanguageOptions = useMemo<PictureTranslateLanguageOption[]>(
    () =>
      filterPictureTranslateSourceLanguages(PICTURE_TRANSLATE_PROVIDER).map(
        (language) => ({
          value: language.code,
          label: t(language.i18nKey, { defaultValue: language.code }),
        }),
      ),
    [t],
  );
  const targetLanguageOptions = useMemo<PictureTranslateLanguageOption[]>(
    () =>
      filterPictureTranslateTargetLanguages({
        sourceLanguage,
        provider: PICTURE_TRANSLATE_PROVIDER,
      }).map((language) => ({
        value: language.code,
        label: t(language.i18nKey, { defaultValue: language.code }),
      })),
    [sourceLanguage, t],
  );

  useEffect(() => {
    console.info(
      `[PictureTranslateLanguage] provider=${PICTURE_TRANSLATE_PROVIDER ?? "auto-route"} source=${sourceLanguage} targetOptions=${JSON.stringify(
        targetLanguageOptions.map((option) => option.value),
      )}`,
    );
  }, [sourceLanguage, targetLanguageOptions]);

  useEffect(() => {
    console.info(
      `[SourceLanguageChanged] provider=${PICTURE_TRANSLATE_PROVIDER ?? "auto-route"} source=${sourceLanguage}`,
    );
  }, [sourceLanguage]);

  useEffect(() => {
    if (targetLanguageOptions.length === 0) return;
    const stillValid = targetLanguageOptions.some(
      (option) => option.value === targetLanguage,
    );
    if (stillValid) return;

    const nextTarget = targetLanguageOptions[0].value;
    setTargetLanguage(nextTarget);
    console.info(
      `[TargetLanguageUpdated] provider=${PICTURE_TRANSLATE_PROVIDER ?? "auto-route"} source=${sourceLanguage} nextTarget=${nextTarget} targetOptions=${JSON.stringify(
        targetLanguageOptions.map((option) => option.value),
      )}`,
    );
  }, [sourceLanguage, targetLanguage, targetLanguageOptions]);

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
  const fieldGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "0.75rem",
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg)$/i.test(file.type)) {
      const message = t("pictureTranslate.validationInvalidFileType");
      setErrorText(message);
      shopify.toast.show(message);
      return;
    }

    try {
      const nextBase64 = await readFileAsDataUrl(file);
      setImageBase64(nextBase64);
      setImageFileName(file.name);
      setErrorText("");
      console.info(
        `[PictureTranslateCard] file selected name=${file.name} size=${file.size}`,
      );
    } catch {
      const message = t("pictureTranslate.readFileFailed");
      setErrorText(message);
      shopify.toast.show(message);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmedUrl = imageUrl.trim();
    if (!trimmedUrl && !imageBase64) {
      const message = t("pictureTranslate.validationImageRequired");
      setErrorText(message);
      shopify.toast.show(message);
      console.info("[PictureTranslateCard] validation failed reason=image_required");
      return;
    }

    const payload = {
      imageUrl: trimmedUrl || undefined,
      imageBase64,
      sourceLanguage,
      targetLanguage,
    };
    const payloadSummary = {
      hasImageUrl: Boolean(payload.imageUrl),
      imageUrlHost: payload.imageUrl ? (() => {
        try {
          return new URL(payload.imageUrl).host;
        } catch {
          return "invalid-url";
        }
      })() : "",
      hasImageBase64: Boolean(payload.imageBase64),
      imageBase64Length: payload.imageBase64?.length ?? 0,
      sourceLanguage: payload.sourceLanguage,
      targetLanguage: payload.targetLanguage,
    };
    console.info(`[PictureTranslateSubmit] submit ${JSON.stringify(payloadSummary)}`);

    setIsSubmitting(true);
    setErrorText("");
    const startedAt = Date.now();
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    try {
      const response = await fetch(`/api/picture-translate-chat${authQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = (await response.json().catch(() => ({}))) as PictureTranslateChatResponse;
      const success = raw.success === true;
      const translatedImage =
        typeof raw.translatedImage === "string" ? raw.translatedImage.trim() : "";
      const error =
        typeof raw.error === "string" && raw.error.trim()
          ? raw.error.trim()
          : t("pictureTranslate.submitFailed");
      const requestId = typeof raw.requestId === "string" ? raw.requestId : "n/a";
      const durationMs = Date.now() - startedAt;

      if (!response.ok || !success || !translatedImage) {
        const message = response.ok ? error : t("pictureTranslate.submitFailed");
        setErrorText(message);
        shopify.toast.show(message);
        console.info(
          `[PictureTranslateResult] success=false durationMs=${durationMs} requestId=${requestId} error=${message}`,
        );
        return;
      }

      console.info(
        `[PictureTranslateResult] success=true durationMs=${durationMs} requestId=${requestId}`,
      );
      onSuccess({
        translatedImage,
        message: t("pictureTranslate.submitSuccess"),
      });
    } catch {
      const durationMs = Date.now() - startedAt;
      const message = t("pictureTranslate.submitFailed");
      setErrorText(message);
      shopify.toast.show(message);
      console.info(
        `[PictureTranslateResult] success=false durationMs=${durationMs} requestId=n/a error=${message}`,
      );
    } finally {
      setIsSubmitting(false);
    }
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
              {t("pictureTranslate.title")}
            </div>
            <div
              style={{
                marginTop: "0.35rem",
                fontSize: "0.8125rem",
                color: "#6d7175",
                lineHeight: 1.45,
              }}
            >
              {t("pictureTranslate.subtitle")}
            </div>
          </div>

          <s-stack direction="block" gap="small">
            <s-text-field
              label={t("pictureTranslate.imageUrl")}
              value={imageUrl}
              onChange={(event) => setImageUrl(event.currentTarget.value)}
              placeholder={t("pictureTranslate.imageUrlPlaceholder")}
              autocomplete="off"
              {...(isSubmitting ? { disabled: true } : {})}
            />

            <div>
              <label
                htmlFor="picture-translate-file-input"
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "#444",
                  marginBottom: "0.35rem",
                }}
              >
                {t("pictureTranslate.uploadImage")}
              </label>
              <input
                id="picture-translate-file-input"
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={(event) => {
                  void handleFileChange(event);
                }}
                disabled={isSubmitting}
                style={{ width: "100%" }}
              />
              {imageFileName ? (
                <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "#6d7175" }}>
                  {t("pictureTranslate.selectedFile", { fileName: imageFileName })}
                </div>
              ) : null}
            </div>

            <div style={fieldGridStyle}>
              <div>
                <label
                  htmlFor="picture-translate-source-language"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#444",
                  }}
                >
                  {t("pictureTranslate.sourceLanguage")}
                </label>
                <select
                  id="picture-translate-source-language"
                  value={sourceLanguage}
                  onChange={(event) => setSourceLanguage(event.target.value)}
                  disabled={isSubmitting}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "0.35rem",
                    padding: "0.45rem 0.55rem",
                    fontSize: "0.8125rem",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    background: isSubmitting ? "#f6f6f7" : "#fff",
                    color: "#303030",
                    boxSizing: "border-box",
                  }}
                >
                  {sourceLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="picture-translate-target-language"
                  style={{
                    display: "block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#444",
                  }}
                >
                  {t("pictureTranslate.targetLanguage")}
                </label>
                <select
                  id="picture-translate-target-language"
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value)}
                  disabled={isSubmitting}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: "0.35rem",
                    padding: "0.45rem 0.55rem",
                    fontSize: "0.8125rem",
                    borderRadius: "8px",
                    border: "1px solid #c9cccf",
                    background: isSubmitting ? "#f6f6f7" : "#fff",
                    color: "#303030",
                    boxSizing: "border-box",
                  }}
                >
                  {targetLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorText ? (
              <div
                style={{
                  marginTop: "0.3rem",
                  padding: "0.5rem 0.65rem",
                  borderRadius: "8px",
                  background: "rgba(216, 44, 13, 0.08)",
                  color: "#8a2712",
                  fontSize: "0.8125rem",
                  lineHeight: 1.45,
                }}
              >
                {errorText}
              </div>
            ) : null}

            <div style={{ marginTop: "0.25rem" }}>
              <s-button
                type="button"
                variant="primary"
                onClick={() => {
                  void handleSubmit();
                }}
                {...(isSubmitting ? { disabled: true } : {})}
              >
                {isSubmitting
                  ? t("pictureTranslate.submitting")
                  : t("pictureTranslate.submit")}
              </s-button>
            </div>
          </s-stack>
        </div>
      </div>
    </div>
  );
}
