import { useCallback, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { usePictureTranslateContext } from "./pictureTranslateContext";
import { formErrorBoxStyle, pageEmptyStateStyle } from "../../page/pageUiStyles";

function EmptyState({ message }: { message: string }) {
  return (
    <div style={pageEmptyStateStyle}>
      <span style={{ fontSize: "1.75rem", opacity: 0.6 }} aria-hidden>
        🖼️
      </span>
      <span>{message}</span>
    </div>
  );
}

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
    } catch {
      // toast only on success per existing behavior
    } finally {
      setCopyBusy(false);
    }
  }, [shopify, t, translatedImage]);

  if (!hasSubmittedOnce && !translatedImage && !isSubmitting) {
    return <EmptyState message={t("pictureTranslate.empty")} />;
  }

  if (isSubmitting) {
    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div
          style={{
            height: "200px",
            borderRadius: "12px",
            background:
              "linear-gradient(90deg, #f1f2f3 25%, rgba(138, 5, 255, 0.1) 50%, #f1f2f3 75%)",
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
        <div style={formErrorBoxStyle}>{resultErrorText}</div>
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
    return <EmptyState message={t("pictureTranslate.empty")} />;
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
            borderRadius: "12px",
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
            <span style={{ fontWeight: 600, color: "#202223" }}>
              {t("pictureTranslate.imageSourceSummary")}:{" "}
            </span>
            {resultMeta.imageSourceLabel}
          </div>
          <div>
            <span style={{ fontWeight: 600, color: "#202223" }}>
              {t("pictureTranslate.sourceLanguage")}:{" "}
            </span>
            {resultMeta.sourceLanguageLabel}
          </div>
          <div>
            <span style={{ fontWeight: 600, color: "#202223" }}>
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
