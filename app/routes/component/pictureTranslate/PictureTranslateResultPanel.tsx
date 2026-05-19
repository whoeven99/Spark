import { useCallback, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { usePictureTranslateContext } from "./pictureTranslateContext";

const errorBoxStyle = {
  padding: "0.5rem 0.65rem",
  borderRadius: "8px",
  background: "rgba(216, 44, 13, 0.08)",
  color: "#8a2712",
  fontSize: "0.8125rem",
  lineHeight: 1.45,
} as const;

export function PictureTranslateResultPanel() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const {
    isSubmitting,
    translatedImage,
    resultErrorText,
    resultMeta,
    hasSubmittedOnce,
    resetResult,
    submitTranslate,
  } = usePictureTranslateContext();
  const [copyBusy, setCopyBusy] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (!translatedImage?.trim()) return;
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(translatedImage);
      shopify.toast.show(t("pictureTranslate.copyLinkDone"));
      console.info("[PictureTranslateResult] copy_link ok");
    } catch (e) {
      console.info("[PictureTranslateResult] copy_link failed", e);
    } finally {
      setCopyBusy(false);
    }
  }, [shopify, t, translatedImage]);

  if (!hasSubmittedOnce && !translatedImage && !isSubmitting) {
    return (
      <div
        style={{
          padding: "1.25rem 1rem",
          borderRadius: "10px",
          background: "rgba(109, 113, 117, 0.08)",
          color: "#6d7175",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        {t("pictureTranslate.empty")}
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div
          style={{
            height: "200px",
            borderRadius: "10px",
            background: "linear-gradient(90deg, #f1f2f3 25%, #e8e9ea 50%, #f1f2f3 75%)",
            backgroundSize: "200% 100%",
            animation: "pictureTranslateShimmer 1.2s ease-in-out infinite",
          }}
        />
        <div style={{ fontSize: "0.875rem", color: "#6d7175" }}>
          {t("pictureTranslate.submitting")}
        </div>
        <style>
          {`@keyframes pictureTranslateShimmer {
            0% { background-position: 100% 0; }
            100% { background-position: -100% 0; }
          }`}
        </style>
      </div>
    );
  }

  if (resultErrorText && !translatedImage) {
    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div style={errorBoxStyle}>{resultErrorText}</div>
        <s-button
          type="button"
          variant="secondary"
          onClick={() => {
            void submitTranslate();
          }}
        >
          {t("pictureTranslate.retry")}
        </s-button>
      </div>
    );
  }

  if (!translatedImage) {
    return (
      <div
        style={{
          padding: "1.25rem 1rem",
          borderRadius: "10px",
          background: "rgba(109, 113, 117, 0.08)",
          color: "#6d7175",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        {t("pictureTranslate.empty")}
      </div>
    );
  }

  return (
    <s-stack direction="block" gap="base">
      <button
        type="button"
        onClick={() => {
          window.open(translatedImage, "_blank", "noopener,noreferrer");
        }}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <img
          src={translatedImage}
          alt={t("pictureTranslate.translatedImageAlt")}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            maxHeight: "520px",
            objectFit: "contain",
            borderRadius: "10px",
            border: "1px solid rgba(44, 110, 203, 0.18)",
          }}
        />
      </button>

      {resultMeta ? (
        <div
          style={{
            fontSize: "0.8125rem",
            color: "#6d7175",
            lineHeight: 1.55,
            display: "grid",
            gap: "0.35rem",
          }}
        >
          <div>
            <span style={{ fontWeight: 600, color: "#444" }}>
              {t("pictureTranslate.imageSourceSummary")}:{" "}
            </span>
            {resultMeta.imageSourceLabel}
          </div>
          <div>
            <span style={{ fontWeight: 600, color: "#444" }}>
              {t("pictureTranslate.sourceLanguage")}:{" "}
            </span>
            {resultMeta.sourceLanguageLabel}
          </div>
          <div>
            <span style={{ fontWeight: 600, color: "#444" }}>
              {t("pictureTranslate.targetLanguage")}:{" "}
            </span>
            {resultMeta.targetLanguageLabel}
          </div>
        </div>
      ) : null}

      <s-stack direction="inline" gap="small">
        <a
          href={translatedImage}
          download
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.875rem" }}
        >
          {t("pictureTranslate.downloadImage")}
        </a>
        <s-button
          type="button"
          variant="secondary"
          onClick={() => {
            void handleCopyLink();
          }}
          {...(copyBusy ? { disabled: true } : {})}
        >
          {copyBusy ? t("pictureTranslate.copying") : t("pictureTranslate.copyLink")}
        </s-button>
        <s-button
          type="button"
          variant="secondary"
          onClick={() => {
            resetResult();
          }}
        >
          {t("pictureTranslate.retry")}
        </s-button>
      </s-stack>
    </s-stack>
  );
}
