import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";
import { usePictureTranslateContext } from "./pictureTranslateContext";
import { CriticalErrorBox } from "../shared/CriticalErrorBox";

type PictureTranslateFormProps = {
  variant: "page" | "card";
  embedded?: boolean;
};

export function PictureTranslateForm({ variant, embedded = false }: PictureTranslateFormProps) {
  const { t } = useTranslation();
  const {
    imageUrl,
    setImageUrl,
    setImageBase64,
    imageFileName,
    selectedSource,
    setSelectedSource,
    productKeyword,
    setProductKeyword,
    submittedKeyword,
    selectedProduct,
    selectedImage,
    sourceLanguage,
    setSourceLanguage,
    targetLanguage,
    setTargetLanguage,
    sourceLanguageOptions,
    targetLanguageOptions,
    productItems,
    isProductSearching,
    productSearchError,
    formErrorText,
    isSubmitting,
    executeSearch,
    handleProductSelect,
    handleProductImageSelect,
    handleFileChange,
    submitTranslate,
    setImageFileName,
  } = usePictureTranslateContext();

  const fieldGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "0.75rem",
  };
  const sourceSelectorStyle: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  };
  const productImageGridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
    gap: "0.55rem",
  };

  const radioName = `picture-translate-image-source-${variant}`;

  const handleSearchInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    executeSearch();
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    void handleFileChange(file);
  };

  const renderUploadArea = () => {
    const fileInputId = `picture-translate-file-input-${variant}`;

    return (
      <label
        htmlFor={fileInputId}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          marginTop: "0.5rem",
          border: `1px dashed ${pageColorTokens.border}`,
          borderRadius: pageColorTokens.radiusControl,
          background: isSubmitting ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
          cursor: isSubmitting ? "not-allowed" : "pointer",
          transition: "all 0.2s ease-in-out",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = "#8a05ff";
          e.currentTarget.style.background = "rgba(138, 5, 255, 0.02)";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = pageColorTokens.border;
          e.currentTarget.style.background = pageColorTokens.surface;
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = pageColorTokens.border;
          e.currentTarget.style.background = pageColorTokens.surface;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFileChange(file);
        }}
      >
        <input
          id={fileInputId}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleFileInputChange}
          disabled={isSubmitting}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: "1.5rem", opacity: 0.5, marginBottom: "0.5rem" }}>📁</div>
        <div style={{ fontSize: "0.8125rem", color: "#303030", fontWeight: 500 }}>
          {t("pictureTranslate.uploadImage")}
        </div>
        <div style={{ fontSize: "0.75rem", color: pageColorTokens.textSecondary, marginTop: "0.25rem" }}>
          {t("pictureTranslate.validationInvalidFileType")}
        </div>
        {imageFileName ? (
          <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#8a05ff", fontWeight: 500 }}>
            {t("pictureTranslate.selectedFile", { fileName: imageFileName })}
          </div>
        ) : null}
      </label>
    );
  };

  return (
    <>
      {variant === "card" ? (
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
              color: pageColorTokens.textSecondary,
              lineHeight: 1.45,
            }}
          >
            {t("pictureTranslate.subtitle")}
          </div>
        </div>
      ) : null}

      <s-stack direction="block" gap="small">
        <div>
          <div
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#444",
              marginBottom: "0.35rem",
            }}
          >
            {t("pictureTranslate.imageSource")}
          </div>
          <div style={sourceSelectorStyle}>
            <label
              style={{
                fontSize: "0.8125rem",
                color: "#303030",
                display: "inline-flex",
                gap: "0.35rem",
                alignItems: "center",
              }}
            >
              <input
                type="radio"
                name={radioName}
                value="upload"
                checked={selectedSource === "upload"}
                disabled={isSubmitting}
                onChange={() => setSelectedSource("upload")}
              />
              {t("pictureTranslate.imageSourceUpload")}
            </label>
            <label
              style={{
                fontSize: "0.8125rem",
                color: "#303030",
                display: "inline-flex",
                gap: "0.35rem",
                alignItems: "center",
              }}
            >
              <input
                type="radio"
                name={radioName}
                value="url"
                checked={selectedSource === "url"}
                disabled={isSubmitting}
                onChange={() => setSelectedSource("url")}
              />
              {t("pictureTranslate.imageSourceUrl")}
            </label>
            <label
              style={{
                fontSize: "0.8125rem",
                color: "#303030",
                display: "inline-flex",
                gap: "0.35rem",
                alignItems: "center",
              }}
            >
              <input
                type="radio"
                name={radioName}
                value="product"
                checked={selectedSource === "product"}
                disabled={isSubmitting}
                onChange={() => setSelectedSource("product")}
              />
              {t("pictureTranslate.imageSourceProduct")}
            </label>
          </div>
        </div>

        {selectedSource === "upload" ? renderUploadArea() : null}

        {selectedSource === "url" ? (
          <s-text-field
            label={t("pictureTranslate.imageUrl")}
            value={imageUrl}
            onChange={(event) => {
              setImageUrl(event.currentTarget.value);
              setImageBase64(undefined);
              setImageFileName("");
            }}
            placeholder={t("pictureTranslate.imageUrlPlaceholder")}
            autocomplete="off"
            {...(isSubmitting ? { disabled: true } : {})}
          />
        ) : null}

        {selectedSource === "product" ? (
          <s-stack direction="block" gap="small">
            <div>
              <div
                style={{
                  display: "flex",
                  gap: "0.45rem",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor={`picture-translate-product-search-${variant}`}
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#444",
                      marginBottom: "0.35rem",
                    }}
                  >
                    {t("pictureTranslate.productKeywordLabel")}
                  </label>
                  <input
                    id={`picture-translate-product-search-${variant}`}
                    value={productKeyword}
                    onChange={(event) => setProductKeyword(event.currentTarget.value)}
                    onKeyDown={handleSearchInputKeyDown}
                    placeholder={t("pictureTranslate.productKeywordPlaceholder")}
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.55rem",
                      fontSize: "0.8125rem",
                      borderRadius: "8px",
                      border: "1px solid #c9cccf",
                      boxSizing: "border-box",
                      color: "#0d0d0d",
                      background: isSubmitting ? "#f9f9f9" : "#fff"
                    }}
                  />
                </div>
                <s-button
                  type="button"
                  variant="secondary"
                  onClick={executeSearch}
                  {...(isSubmitting ? { disabled: true } : {})}
                >
                  {t("pictureTranslate.searchProduct")}
                </s-button>
              </div>
            </div>

            {isProductSearching ? (
              <div style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary }}>
                {t("pictureTranslate.productSearching")}
              </div>
            ) : null}
            {productSearchError ? (
            <CriticalErrorBox>{productSearchError}</CriticalErrorBox>
            ) : null}
            {!isProductSearching &&
            !productSearchError &&
            submittedKeyword &&
            productItems.length === 0 ? (
              <div
                style={{
                  padding: "0.6rem 0.65rem",
                  borderRadius: "8px",
                  background: pageColorTokens.mutedBg,
                  color: pageColorTokens.textSecondary,
                  fontSize: "0.8125rem",
                }}
              >
                {t("pictureTranslate.productEmpty")}
              </div>
            ) : null}

            {productItems.length > 0 ? (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {productItems.map((product) => {
                  const isSelected = selectedProduct?.id === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductSelect(product)}
                      disabled={isSubmitting}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "42px 1fr",
                        gap: "0.55rem",
                        alignItems: "center",
                        padding: "0.5rem 0.6rem",
                        borderRadius: "8px",
                        border: isSelected
                          ? "1px solid #8a05ff"
                          : "1px solid rgba(0,0,0,0.12)",
                        background: isSelected ? "rgba(138, 5, 255, 0.04)" : "#fff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {product.featuredImageUrl ? (
                        <img
                          src={product.featuredImageUrl}
                          alt=""
                          width={42}
                          height={42}
                          style={{ borderRadius: "6px", objectFit: "cover" }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: "6px",
                            background: "rgba(109, 113, 117, 0.12)",
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            color: "#0d0d0d",
                            lineHeight: 1.35,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: isSelected ? 500 : 400,
                          }}
                        >
                          {product.title}
                        </div>
                        <div
                          style={{
                            marginTop: "0.1rem",
                            fontSize: "0.75rem",
                            color: pageColorTokens.textSecondary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {product.id}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {selectedProduct ? (
              <>
                {selectedProduct.images.length > 0 ? (
                  <div style={productImageGridStyle}>
                    {selectedProduct.images.map((image) => {
                      const active = selectedImage?.url === image.url;
                      return (
                        <button
                          key={image.url}
                          type="button"
                          onClick={() => handleProductImageSelect(image)}
                          disabled={isSubmitting}
                          style={{
                            borderRadius: "8px",
                            overflow: "hidden",
                            border: active
                              ? "2px solid #8a05ff"
                              : "1px solid rgba(0,0,0,0.12)",
                            background: "#fff",
                            padding: 0,
                            cursor: "pointer",
                            boxShadow: active
                              ? "0 0 0 2px rgba(138,5,255,0.12)"
                              : "0 1px 3px rgba(0,0,0,0.08)",
                          }}
                          title={image.altText ?? ""}
                        >
                          <img
                            src={image.url}
                            alt={image.altText ?? ""}
                            style={{
                              display: "block",
                              width: "100%",
                              aspectRatio: "1 / 1",
                              objectFit: "cover",
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "0.6rem 0.65rem",
                      borderRadius: "8px",
                      background: pageColorTokens.mutedBg,
                      color: pageColorTokens.textSecondary,
                      fontSize: "0.8125rem",
                    }}
                  >
                    {t("pictureTranslate.productImageEmpty")}
                  </div>
                )}

                {selectedImage ? (
                  <div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "#444",
                        marginBottom: "0.35rem",
                      }}
                    >
                      {t("pictureTranslate.selectedProductImage")}
                    </div>
                    <img
                      src={selectedImage.url}
                      alt={selectedImage.altText ?? t("pictureTranslate.translatedImageAlt")}
                      style={{
                        display: "block",
                        width: "100%",
                        maxWidth: "280px",
                        borderRadius: "10px",
                        border: "1px solid rgba(44,110,203,0.18)",
                      }}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </s-stack>
        ) : null}

        <div style={fieldGridStyle}>
          <div>
            <label
              htmlFor={`picture-translate-source-language-${variant}`}
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
              id={`picture-translate-source-language-${variant}`}
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
                background: isSubmitting ? "#f9f9f9" : "#fff",
                color: "#0d0d0d",
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
              htmlFor={`picture-translate-target-language-${variant}`}
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
              id={`picture-translate-target-language-${variant}`}
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
                background: isSubmitting ? "#f9f9f9" : "#fff",
                color: "#0d0d0d",
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

        {formErrorText ? (
          <CriticalErrorBox style={{ marginTop: "0.3rem" }}>{formErrorText}</CriticalErrorBox>
        ) : null}

        <div style={{ gridColumn: "1 / -1", marginTop: "0.25rem" }}>
          <s-button
            type="button"
            variant="primary"
            onClick={() => {
              void submitTranslate();
            }}
            {...(isSubmitting ? { disabled: true } : {})}
          >
            {isSubmitting ? t("pictureTranslate.submitting") : t("pictureTranslate.submit")}
          </s-button>
        </div>
      </s-stack>
    </>
  );
}
