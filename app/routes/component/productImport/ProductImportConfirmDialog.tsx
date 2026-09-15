import { useTranslation } from "react-i18next";
import { pageColorTokens } from "../../page/pageUiStyles";
import { actionButtonStyle } from "../aiTask/AITaskCardShell";
import { DialogShell } from "../shared/DialogShell";
import type { ProductImportSheetPreview } from "../../../lib/productImportSheetPreview";
import { ProductImportSheetPreviewView } from "./ProductImportSheetPreviewView";

type Props = {
  open: boolean;
  preview: ProductImportSheetPreview | null;
  previewLoading: boolean;
  previewErrorKey?: string;
  submitting: boolean;
  onClose: () => void;
  onConfirmMatch: () => void;
};

export function ProductImportConfirmDialog({
  open,
  preview,
  previewLoading,
  previewErrorKey,
  submitting,
  onClose,
  onConfirmMatch,
}: Props) {
  const { t } = useTranslation();
  const confirmDisabled = submitting || !preview || Boolean(previewErrorKey) || previewLoading;

  return (
    <DialogShell
      open={open}
      width={980}
      onClose={onClose}
      closeDisabled={submitting}
      title={t("productImport.previewSheetTitle")}
      description={t("productImport.previewSheetDescription")}
      destroyOnHidden
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            style={actionButtonStyle("subtle", submitting)}
            disabled={submitting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            style={actionButtonStyle("primary", confirmDisabled)}
            disabled={confirmDisabled}
            onClick={onConfirmMatch}
          >
            {t("productImport.confirmMatchPreview")}
          </button>
        </div>
      }
    >
      <DialogBody
        preview={preview}
        previewLoading={previewLoading}
        previewErrorKey={previewErrorKey}
      />
    </DialogShell>
  );
}

function DialogBody({
  preview,
  previewLoading,
  previewErrorKey,
}: {
  preview: ProductImportSheetPreview | null;
  previewLoading: boolean;
  previewErrorKey?: string;
}) {
  const { t } = useTranslation();
  if (previewLoading && !preview) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
        {t("productImport.sheetPreview.loading")}
      </div>
    );
  }
  if (previewErrorKey) {
    return (
      <div style={{ fontSize: 13, color: pageColorTokens.criticalText }}>{t(previewErrorKey)}</div>
    );
  }
  if (preview) {
    return <ProductImportSheetPreviewView preview={preview} density="dialog" />;
  }
  return (
    <div style={{ fontSize: 13, color: pageColorTokens.textSecondary }}>
      {t("productImport.sheetPreview.error.missing_file")}
    </div>
  );
}
