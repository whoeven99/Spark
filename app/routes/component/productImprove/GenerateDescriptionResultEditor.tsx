import { Alert, Button, Input, Space } from "antd";
import { useTranslation } from "react-i18next";
import type { CopyTarget } from "../../../hooks/useProductImprove";
import { DialogShell } from "../shared/DialogShell";

export type GenerateDescriptionResultEditorProps = {
  variant: "page" | "card";
  draftTitle: string;
  draftDescription: string;
  onDraftTitleChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  copyTarget: CopyTarget | null;
  copyBusy: boolean;
  isSubmitting: boolean;
  isSaving: boolean;
  saveErrorText: string | null;
  onCopyTitle: () => void;
  onCopyDescription: () => void;
  onCopyAll: () => void;
  onClickSave: () => void;
  saveConfirmOpen: boolean;
  onSaveConfirm: () => void;
  onSaveCancel: () => void;
};

const { TextArea } = Input;

export function GenerateDescriptionResultEditor(props: GenerateDescriptionResultEditorProps) {
  const { t } = useTranslation();
  const {
    variant,
    draftTitle,
    draftDescription,
    onDraftTitleChange,
    onDraftDescriptionChange,
    copyTarget,
    copyBusy,
    isSubmitting,
    isSaving,
    saveErrorText,
    onCopyTitle,
    onCopyDescription,
    onCopyAll,
    onClickSave,
    saveConfirmOpen,
    onSaveConfirm,
    onSaveCancel,
  } = props;

  const disabledCopy = isSubmitting || isSaving || copyBusy;
  const descFieldId =
    variant === "page" ? "generate-description-draft-desc" : "generate-description-draft-desc-card";

  const body = (
    <div
      className={`${variant === "page" ? "rounded-app-card border border-app-subtle bg-app-subtle p-4" : ""}`}
    >
      <div className="space-y-4">
        {variant === "card" ? (
          <div className="mb-1 text-xs font-semibold text-app-text-primary">
            {t("generate.resultTitle")}
          </div>
        ) : null}

        <div>
          <label
            htmlFor="generate-description-draft-title"
            className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary"
          >
            {t("generate.productTitleLabel")}
          </label>
          <Input
            id="generate-description-draft-title"
            value={draftTitle}
            onChange={(e) => onDraftTitleChange(e.target.value)}
            autoComplete="off"
            disabled={isSubmitting || isSaving}
          />
        </div>

        <div>
          <label htmlFor={descFieldId} className="mb-2 block text-xs font-semibold tracking-[0.01em] text-app-text-secondary">
            {t("generate.productDescriptionLabel")}
          </label>
          <TextArea
            id={descFieldId}
            value={draftDescription}
            onChange={(e) => onDraftDescriptionChange(e.target.value)}
            disabled={isSubmitting || isSaving}
            rows={variant === "card" ? 6 : 8}
            className="resize-y"
          />
        </div>

        {saveErrorText ? <Alert type="error" showIcon message={saveErrorText} /> : null}

        <div className="pt-1">
          <Space wrap size="middle">
            <Button onClick={onCopyTitle} disabled={disabledCopy} loading={copyTarget === "title" && copyBusy}>
              {copyTarget === "title" ? t("generate.copying") : t("generate.copyTitle")}
            </Button>
            <Button
              onClick={onCopyDescription}
              disabled={disabledCopy}
              loading={copyTarget === "description" && copyBusy}
            >
              {copyTarget === "description"
                ? t("generate.copying")
                : t("generate.copyDescription")}
            </Button>
            <Button onClick={onCopyAll} disabled={disabledCopy} loading={copyTarget === "all" && copyBusy}>
              {copyTarget === "all" ? t("generate.copying") : t("generate.copyAll")}
            </Button>
            <Button
              type="primary"
              onClick={onClickSave}
              disabled={isSubmitting || isSaving}
              loading={isSaving}
            >
              {t("generate.saveToShopify")}
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {variant === "page" ? (
        body
      ) : (
        <div className="mb-3.5">{body}</div>
      )}

      <DialogShell
        open={saveConfirmOpen}
        onClose={onSaveCancel}
        closeDisabled={isSaving}
        destroyOnHidden
        width={420}
        title={t("generate.confirmSaveTitle")}
        description={t("generate.confirmSaveDesc")}
        footer={
          <div className="flex flex-wrap gap-3">
            <Button onClick={onSaveCancel} disabled={isSaving}>
              {t("common.cancel")}
            </Button>
            <Button type="primary" onClick={onSaveConfirm} loading={isSaving}>
              {t("generate.confirmSaveAction")}
            </Button>
          </div>
        }
      >
      </DialogShell>
    </>
  );
}
