import { useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { CopyTarget } from "../../../hooks/useGenerateDescription";

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

const textAreaBase = (variant: "page" | "card"): CSSProperties => ({
  display: "block",
  width: "100%",
  marginTop: variant === "card" ? "0.35rem" : "0.35rem",
  padding: variant === "card" ? "0.45rem 0.55rem" : "0.5rem 0.65rem",
  fontSize: variant === "card" ? "0.8125rem" : "0.875rem",
  borderRadius: "8px",
  border: "1px solid #c9cccf",
  background: "#fff",
  color: "#303030",
  boxSizing: "border-box",
  lineHeight: 1.55,
  minHeight: variant === "card" ? "120px" : "160px",
  resize: "vertical" as const,
  fontFamily: "inherit",
});

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

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (saveConfirmOpen) {
      if (!el.open) {
        el.showModal();
      }
    } else if (el.open) {
      el.close();
    }
  }, [saveConfirmOpen]);

  const disabledCopy = isSubmitting || isSaving || copyBusy;
  const descFieldId =
    variant === "page" ? "generate-description-draft-desc" : "generate-description-draft-desc-card";

  const body = (
    <div
      style={
        variant === "page"
          ? {
              background: "#fff",
              borderRadius: "12px",
              padding: "1.25rem",
              border: "1px solid #e1e3e5",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }
          : {}
      }
    >
      <s-stack direction="block" gap="small">
        {variant === "card" ? (
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#444",
              marginBottom: "0.25rem",
            }}
          >
            {t("generate.resultTitle")}
          </div>
        ) : null}

        <s-text-field
          label={t("generate.productTitleLabel")}
          value={draftTitle}
          onChange={(e) => onDraftTitleChange(e.currentTarget.value)}
          autocomplete="off"
          {...(isSubmitting || isSaving ? { disabled: true } : {})}
        />

        <div>
          <label
            htmlFor={descFieldId}
            style={{
              display: "block",
              fontSize: variant === "card" ? "0.75rem" : "0.8125rem",
              fontWeight: variant === "card" ? 600 : 500,
              color: variant === "card" ? "#444" : "#303030",
            }}
          >
            {t("generate.productDescriptionLabel")}
          </label>
          <textarea
            id={descFieldId}
            value={draftDescription}
            onChange={(e) => onDraftDescriptionChange(e.currentTarget.value)}
            disabled={isSubmitting || isSaving}
            rows={variant === "card" ? 6 : 8}
            style={textAreaBase(variant)}
          />
        </div>

        {saveErrorText ? (
          <div
            style={{
              padding: "0.5rem 0.65rem",
              borderRadius: "8px",
              background: "rgba(216, 44, 13, 0.08)",
              color: "#8a2712",
              fontSize: "0.8125rem",
              lineHeight: 1.45,
            }}
          >
            {saveErrorText}
          </div>
        ) : null}

        <div style={{ marginTop: "0.5rem" }}>
          <s-stack direction="inline" gap="small">
            <s-button
              type="button"
              variant="secondary"
              onClick={onCopyTitle}
              {...(disabledCopy ? { disabled: true } : {})}
            >
              {copyTarget === "title" ? t("generate.copying") : t("generate.copyTitle")}
            </s-button>
            <s-button
              type="button"
              variant="secondary"
              onClick={onCopyDescription}
              {...(disabledCopy ? { disabled: true } : {})}
            >
              {copyTarget === "description" ? t("generate.copying") : t("generate.copyDescription")}
            </s-button>
            <s-button
              type="button"
              variant="secondary"
              onClick={onCopyAll}
              {...(disabledCopy ? { disabled: true } : {})}
            >
              {copyTarget === "all" ? t("generate.copying") : t("generate.copyAll")}
            </s-button>
            <s-button
              type="button"
              variant="primary"
              onClick={onClickSave}
              {...(isSubmitting || isSaving ? { disabled: true } : {})}
            >
              {isSaving ? t("generate.saving") : t("generate.saveToShopify")}
            </s-button>
          </s-stack>
        </div>
      </s-stack>
    </div>
  );

  return (
    <>
      {variant === "page" ? (
        <s-section heading={t("generate.resultTitle")}>{body}</s-section>
      ) : (
        <div style={{ marginBottom: "0.85rem" }}>{body}</div>
      )}

      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          if (!isSaving) {
            onSaveCancel();
          }
        }}
        style={{
          maxWidth: "420px",
          width: "calc(100% - 2rem)",
          padding: 0,
          border: "none",
          borderRadius: "12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ padding: "1.125rem 1.25rem" }}>
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: "#111213",
              marginBottom: "0.5rem",
            }}
          >
            {t("generate.confirmSaveTitle")}
          </div>
          <div
            style={{
              fontSize: "0.8125rem",
              color: "#6d7175",
              lineHeight: 1.5,
              marginBottom: "1rem",
            }}
          >
            {t("generate.confirmSaveDesc")}
          </div>
          <s-stack direction="inline" gap="small">
            <s-button type="button" variant="secondary" onClick={onSaveCancel} {...(isSaving ? { disabled: true } : {})}>
              {t("common.cancel")}
            </s-button>
            <s-button type="button" variant="primary" onClick={onSaveConfirm} {...(isSaving ? { disabled: true } : {})}>
              {isSaving ? t("generate.saving") : t("generate.confirmSaveAction")}
            </s-button>
          </s-stack>
        </div>
      </dialog>
    </>
  );
}
