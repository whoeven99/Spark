import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useGenerateDescription } from "../../hooks/useGenerateDescription";
import type { loader } from "../app.generate-description";
import type { ProductSelectorSelection } from "../../lib/productSearchTypes";
import { ProductSelector } from "../component/product/ProductSelector";
import { GenerateDescriptionResultEditor } from "../component/generateDescription/GenerateDescriptionResultEditor";
import {
  PageSectionHeader,
  PageSurface,
  formErrorBoxStyle,
  pageContentStyle,
  pageEmptyStateStyle,
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageLinkHintStyle,
  pageSelectStyle,
  pageStatusBadgeStyle,
  pageTrustFootnoteStyle,
  stickyAsideColumnStyle,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  twoColumnSideStyle,
} from "./pageUiStyles";

export function GenerateDescriptionPage() {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const loaderData = useLoaderData<typeof loader>();
  const billing = loaderData.billing;
  const [selectedProduct, setSelectedProduct] =
    useState<ProductSelectorSelection | null>(null);
  const [productId, setProductId] = useState("");
  const [showManualProductId, setShowManualProductId] = useState(false);

  const search =
    typeof window !== "undefined" ? window.location.search : "";

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
    resetResult,
    localesIsFallback,
  } = useGenerateDescription({
    locationSearch: search,
    initialShopLocales: loaderData.shopLocales,
    toastShow: (message) => {
      shopify.toast.show(message);
    },
  });

  const handleGenerate = async () => {
    const pid = (selectedProduct?.id ?? productId).trim();
    await submitGenerate(pid);
  };

  const productIdForActions = (selectedProduct?.id ?? productId).trim();
  const copyBusy = copyTarget !== null;

  const billingBadge =
    billing.billingRequired && !billing.hasAccess ? (
      <span style={pageStatusBadgeStyle}>{t("generate.billingBadgeLow")}</span>
    ) : null;

  return (
    <s-page heading={t("generate.pageTitle")}>
      <div style={pageContentStyle}>
        {billing.billingRequired && !billing.hasAccess ? (
          <s-banner tone="warning">
            {t("billing.lowBalanceWarning")}{" "}
            <s-link href={`/app/billing${search}`}>{t("billing.openBillingPage")}</s-link>
          </s-banner>
        ) : null}

        <PageSectionHeader
          title={t("generate.sectionTitle")}
          subtitle={t("generate.intro")}
          badge={billingBadge}
        />

        <div style={twoColumnLayoutStyle}>
          <div style={twoColumnMainStyle}>
            <PageSurface
              title={t("generate.formCardTitle")}
              subtitle={t("generate.formCardSubtitle")}
            >
              <s-stack direction="block" gap="base">
                <ProductSelector
                  locationSearch={search}
                  selected={selectedProduct}
                  onSelectedChange={setSelectedProduct}
                />
                <details
                  style={{ marginTop: "0.25rem" }}
                  open={showManualProductId}
                  onToggle={(e) => setShowManualProductId(e.currentTarget.open)}
                >
                  <summary style={pageLinkHintStyle}>
                    {t("generate.advancedManualProductId")}
                  </summary>
                  <div style={{ marginTop: "0.65rem" }}>
                    <s-text-field
                      label={t("generate.productIdLabel")}
                      value={productId}
                      onChange={(e) => setProductId(e.currentTarget.value)}
                      autocomplete="off"
                    />
                  </div>
                </details>

                <div>
                  <label htmlFor="generate-description-lang" style={pageFieldLabelStyle}>
                    {t("generate.targetLanguage")}
                  </label>
                  <select
                    id="generate-description-lang"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={localesLoading || isSubmitting || isSaving || saveConfirmOpen}
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
                    <div style={pageHintTextStyle}>
                      {t("generate.fallbackLocalesHint")}{" "}
                      <code style={{ fontSize: "0.7rem" }}>read_locales</code>
                    </div>
                  ) : null}
                </div>

                {errorText ? <div style={formErrorBoxStyle}>{errorText}</div> : null}

                <s-stack direction="inline" gap="small">
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      void handleGenerate();
                    }}
                    {...(isSubmitting || isSaving || localesLoading || saveConfirmOpen
                      ? { disabled: true }
                      : {})}
                  >
                    {isSubmitting
                      ? t("generate.generating")
                      : localesLoading
                        ? t("common.loadingLanguage")
                        : t("generate.generateAction")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      resetResult();
                      setSelectedProduct(null);
                      setProductId("");
                    }}
                    {...(isSubmitting || isSaving ? { disabled: true } : {})}
                  >
                    {t("common.clearResult")}
                  </s-button>
                </s-stack>
              </s-stack>
            </PageSurface>
          </div>

          <div style={{ ...twoColumnSideStyle, ...stickyAsideColumnStyle }}>
            <PageSurface title={t("generate.resultTitle")}>
              {description !== null ? (
                <GenerateDescriptionResultEditor
                  variant="page"
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
              ) : (
                <div style={pageEmptyStateStyle}>
                  <span style={{ fontSize: "1.75rem", opacity: 0.6 }} aria-hidden>
                    ✨
                  </span>
                  <span>{t("generate.emptyResult")}</span>
                </div>
              )}
            </PageSurface>
          </div>
        </div>

        <p style={pageTrustFootnoteStyle}>{t("generate.pageFootnote")}</p>
      </div>
    </s-page>
  );
}
