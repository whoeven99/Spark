import { useState } from "react";
import { Alert, Button, Empty, Input, Select, Spin } from "antd";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { useProductImprove } from "../../../hooks/useProductImprove";
import { useEmbeddedLocationSearch } from "../../../hooks/useEmbeddedLocationSearch";
import type { ProductSelectorSelection } from "../../../lib/productSearchTypes";
import type { loader } from "../../app.create";
import { ProductSelector } from "../product/ProductSelector";
import {
  PageSurface,
  formErrorBoxStyle,
  pageColorTokens,
  pageFieldLabelStyle,
} from "../../page/pageUiStyles";
import { CreateConfirmDialog } from "./CreateConfirmDialog";
import { CreateOperationShell } from "./CreateOperationShell";
import { useCreateEstimationRows } from "./useCreateEstimationRows";

export function CreateCopyWorkspace({ onBack }: { onBack: () => void }) {
  const shopify = useAppBridge();
  const { t } = useTranslation();
  const locationSearch = useEmbeddedLocationSearch();
  const { estimations } = useLoaderData<typeof loader>();
  const buildEstimationRows = useCreateEstimationRows();
  const [selectedProduct, setSelectedProduct] = useState<ProductSelectorSelection | null>(
    null,
  );
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);

  const copy = useProductImprove({
    locationSearch,
    initialShopLocales: null,
    toastShow: (message) => shopify.toast.show(message),
  });

  const hasResult = Boolean(copy.productTitle || copy.description);
  const languageLabel =
    copy.localeOptions.find((option) => option.value === copy.targetLanguage)?.label ??
    copy.targetLanguage;
  const productLabel = selectedProduct?.title ?? t("createPage.copy.selectedProductFallback");

  function handleRequestGenerate() {
    if (!selectedProduct) {
      shopify.toast.show(t("createPage.copy.selectProductFirst"));
      return;
    }
    setGenerateConfirmOpen(true);
  }

  async function handleConfirmGenerate() {
    if (!selectedProduct) return;
    setGenerateConfirmOpen(false);
    await copy.submitGenerate(selectedProduct.id);
  }

  async function handleSave() {
    await copy.confirmSaveToShopify(selectedProduct?.id ?? copy.pinnedProductId);
  }

  const config = (
    <PageSurface
      title={t("createPage.copy.configTitle")}
      subtitle={t("createPage.copy.configSubtitle")}
    >
      <div className="flex flex-col gap-4">
        <div>
          <span style={pageFieldLabelStyle}>{t("createPage.copy.productLabel")}</span>
          <ProductSelector
            locationSearch={locationSearch}
            selected={selectedProduct}
            onSelectedChange={(next) => {
              setSelectedProduct(next);
              copy.resetResult();
            }}
          />
        </div>

        <div>
          <label htmlFor="create-copy-language" style={pageFieldLabelStyle}>
            {t("createPage.copy.languageLabel")}
          </label>
          <Select
            id="create-copy-language"
            className="w-full"
            value={copy.targetLanguage || undefined}
            disabled={copy.localesLoading || copy.isSubmitting}
            loading={copy.localesLoading}
            options={copy.localeOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onChange={(value) => copy.setTargetLanguage(value)}
          />
        </div>

        {copy.errorText ? <div style={formErrorBoxStyle}>{copy.errorText}</div> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="primary"
            loading={copy.isSubmitting}
            disabled={copy.localesLoading || !selectedProduct}
            onClick={handleRequestGenerate}
          >
            {copy.isSubmitting
              ? t("createPage.copy.generating")
              : t("createPage.copy.generate")}
          </Button>
          {hasResult ? (
            <Button disabled={copy.isSubmitting} onClick={copy.resetResult}>
              {t("createPage.copy.newRound")}
            </Button>
          ) : null}
        </div>
      </div>
    </PageSurface>
  );

  const result = (
    <PageSurface
      title={t("createPage.copy.resultTitle")}
      subtitle={
        selectedProduct
          ? t("createPage.copy.resultSubtitle", {
              product: selectedProduct.title,
              language: languageLabel,
            })
          : t("createPage.copy.resultEmptyHint")
      }
    >
      {copy.isSubmitting ? (
        <div className="flex min-h-52 flex-col items-center justify-center gap-3">
          <Spin />
          <p className="m-0 text-sm" style={{ color: pageColorTokens.textSecondary }}>
            {t("createPage.copy.generating")}
          </p>
        </div>
      ) : !hasResult ? (
        <Empty className="spark-ant-empty py-10" description={t("createPage.copy.resultEmpty")} />
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="create-copy-title" style={pageFieldLabelStyle}>
              {t("createPage.copy.draftTitle")}
            </label>
            <Input
              id="create-copy-title"
              value={copy.draftTitle}
              onChange={(event) => copy.setDraftTitle(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="create-copy-description" style={pageFieldLabelStyle}>
              {t("createPage.copy.draftDescription")}
            </label>
            <Input.TextArea
              id="create-copy-description"
              value={copy.draftDescription}
              autoSize={{ minRows: 8, maxRows: 18 }}
              onChange={(event) => copy.setDraftDescription(event.target.value)}
            />
          </div>
          {copy.saveErrorText ? (
            <Alert type="error" showIcon message={copy.saveErrorText} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy.copyTitle}>{t("createPage.copy.copyTitle")}</Button>
            <Button onClick={copy.copyDescription}>
              {t("createPage.copy.copyDescription")}
            </Button>
            <Button onClick={copy.copyAll}>{t("createPage.copy.copyAll")}</Button>
            <Button type="primary" onClick={copy.requestOpenSaveDialog}>
              {t("createPage.copy.save")}
            </Button>
          </div>
        </div>
      )}
    </PageSurface>
  );

  return (
    <>
      <CreateOperationShell kind="generate" onBack={onBack} config={config} result={result} />

      <CreateConfirmDialog
        open={generateConfirmOpen}
        title={t("createPage.copy.generateConfirmTitle")}
        goal={t("createPage.copy.generateConfirmGoal")}
        rows={[
          { label: t("createPage.copy.productLabel"), value: productLabel },
          { label: t("createPage.copy.languageLabel"), value: languageLabel },
          ...buildEstimationRows(estimations.productImprove),
        ]}
        confirmLabel={t("createPage.copy.generate")}
        onConfirm={() => {
          void handleConfirmGenerate();
        }}
        onCancel={() => setGenerateConfirmOpen(false)}
      />

      <CreateConfirmDialog
        open={copy.saveConfirmOpen}
        title={t("createPage.copy.saveConfirmTitle")}
        goal={t("createPage.copy.saveConfirmBody", { product: productLabel })}
        rows={[
          { label: t("createPage.copy.productLabel"), value: productLabel },
          {
            label: t("createPage.confirm.affectedFields"),
            value: t("createPage.copy.saveConfirmFields"),
          },
        ]}
        confirmLabel={t("createPage.copy.saveConfirmOk")}
        loading={copy.isSaving}
        errorText={copy.saveErrorText}
        onConfirm={() => {
          void handleSave();
        }}
        onCancel={copy.cancelSaveDialog}
      />
    </>
  );
}
