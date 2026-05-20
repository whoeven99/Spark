import { useState, type CSSProperties } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { CriticalErrorBox } from "../shared/CriticalErrorBox";
import { useGenerateDescription } from "../../../hooks/useGenerateDescription";
import type { GenerateDescriptionCardPayload } from "../../../lib/chatMessage";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import { ProductSelector } from "../product/ProductSelector";
import { GenerateDescriptionResultEditor } from "../generateDescription/GenerateDescriptionResultEditor";
import {
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageSelectStyle,
} from "../../page/pageUiStyles";

type Props = {
  /** 嵌在助手气泡内时略收紧边距与阴影 */
  embedded?: boolean;
  initialResult?: GenerateDescriptionCardPayload;
};

export function GenerateDescriptionChatCard({
  embedded = false,
  initialResult,
}: Props) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const [selectedProduct, setSelectedProduct] =
    useState<ProductSelectorSelection | null>(null);
  const [productId, setProductId] = useState(initialResult?.productId ?? "");
  const [showManualProductId, setShowManualProductId] = useState(false);

  const search = typeof window !== "undefined" ? window.location.search : "";

  const {
    targetLanguage,
    setTargetLanguage,
    localeOptions,
    localesLoading,
    isSubmitting,
    isSaving,
    errorText,
    saveErrorText,
    description,
    pinnedProductId,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    copyTarget,
    saveConfirmOpen,
    requestOpenSaveDialog,
    cancelSaveDialog,
    confirmSaveToShopify,
    submitGenerate,
    copyTitle,
    copyDescription,
    copyAll,
    localesIsFallback,
  } = useGenerateDescription({
    locationSearch: search,
    initialShopLocales: null,
    initialResult,
    toastShow: (message: string) => {
      shopify.toast.show(message);
    },
  });

  const handleGenerate = async () => {
    const pid = (selectedProduct?.id ?? productId).trim();
    await submitGenerate(pid);
  };

  const productIdForActions = (selectedProduct?.id ?? productId ?? pinnedProductId).trim();
  const hasPrefilledResult =
    Boolean(initialResult?.title?.trim()) &&
    Boolean(initialResult?.description);

  const copyBusy = copyTarget !== null;

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

  const primaryBtnStyle: CSSProperties = {
    width: "100%",
    marginTop: "0.25rem",
  };

  return (
    <div style={shellStyle}>
      <div style={innerStyle}>
        <div
          style={{
            padding: embedded ? "0.85rem 1rem 1rem" : "1rem 1.125rem 1.125rem",
          }}
        >
          <div style={{ marginBottom: "0.75rem" }}>
            <div
              style={{
                fontSize: embedded ? "1rem" : "1.0625rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#111213",
              }}
            >
              {t("generate.sectionTitle")}
            </div>
            <div
              style={{
                marginTop: "0.35rem",
                fontSize: "0.8125rem",
                color: "#6d7175",
                lineHeight: 1.45,
              }}
            >
              {t("generate.intro")}
            </div>
          </div>

          {!hasPrefilledResult ? (
            <>
              <div style={{ marginBottom: "0.85rem" }}>
                <ProductSelector
                  locationSearch={search}
                  embedded={embedded}
                  selected={selectedProduct}
                  onSelectedChange={setSelectedProduct}
                />
                <details
                  style={{ marginTop: "0.35rem" }}
                  open={showManualProductId}
                  onToggle={(e) =>
                    setShowManualProductId(e.currentTarget.open)
                  }
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      color: "#2c6ecb",
                      userSelect: "none",
                    }}
                  >
                    {t("generate.advancedManualProductId")}
                  </summary>
                  <div style={{ marginTop: "0.5rem" }}>
                    <s-text-field
                      label={t("generate.productIdLabel")}
                      value={productId}
                      onChange={(e) => setProductId(e.currentTarget.value)}
                      autocomplete="off"
                    />
                  </div>
                </details>
              </div>

              <div style={{ ...fieldGridStyle, marginBottom: "0.85rem" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label
                    htmlFor="generate-description-lang-card"
                    style={pageFieldLabelStyle}
                  >
                    {t("generate.targetLanguage")}
                  </label>
                  <select
                    id="generate-description-lang-card"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={
                      localesLoading || isSubmitting || isSaving || saveConfirmOpen
                    }
                    style={pageSelectStyle(
                      localesLoading || isSubmitting || isSaving || saveConfirmOpen,
                    )}
                  >
                    {localesLoading && localeOptions.length === 0 ? (
                      <option value="">{t("common.loadingLanguage")}</option>
                    ) : null}
                    {localeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {localesIsFallback ? (
                    <div style={pageHintTextStyle}>{t("generate.fallbackLocalesHint")}</div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {errorText ? (
            <CriticalErrorBox style={{ marginBottom: "0.75rem" }}>{errorText}</CriticalErrorBox>
          ) : null}

          {description !== null ? (
            <GenerateDescriptionResultEditor
              variant="card"
              draftTitle={draftTitle}
              draftDescription={draftDescription}
              onDraftTitleChange={setDraftTitle}
              onDraftDescriptionChange={setDraftDescription}
              copyTarget={copyTarget}
              copyBusy={copyBusy}
              isSubmitting={isSubmitting}
              isSaving={isSaving}
              saveErrorText={saveErrorText}
              onCopyTitle={copyTitle}
              onCopyDescription={copyDescription}
              onCopyAll={copyAll}
              onClickSave={requestOpenSaveDialog}
              saveConfirmOpen={saveConfirmOpen}
              onSaveConfirm={() => {
                void confirmSaveToShopify(productIdForActions);
              }}
              onSaveCancel={cancelSaveDialog}
            />
          ) : null}

          {!hasPrefilledResult ? (
            <s-stack direction="block" gap="small">
              <div style={primaryBtnStyle}>
                <s-button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    void handleGenerate();
                  }}
                  {...(isSubmitting || isSaving || localesLoading || saveConfirmOpen ? { disabled: true } : {})}
                >
                  {isSubmitting
                    ? t("generate.generating")
                    : localesLoading
                      ? t("common.loadingLanguage")
                      : t("generate.generateAction")}
                </s-button>
              </div>
            </s-stack>
          ) : null}
        </div>
      </div>
    </div>
  );
}
