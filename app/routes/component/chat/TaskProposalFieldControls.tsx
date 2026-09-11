import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskProposalField } from "../../../lib/taskProposalPayload";
import {
  isProductImportSpreadsheetName,
  PRODUCT_IMPORT_FILE_EXTENSIONS,
} from "../../../lib/productImport";
import { pageColorTokens } from "../../page/pageUiStyles";

const ACCEPT = PRODUCT_IMPORT_FILE_EXTENSIONS.join(",");
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: pageColorTokens.textPrimary,
  cursor: "pointer",
} as const;

function parseSelected(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinSelected(values: string[], allowed: string[]): string {
  const set = new Set(values);
  return allowed.filter((item) => set.has(item)).join(",");
}

export function MultiselectField({
  field,
  value,
  onChange,
}: {
  field: TaskProposalField;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const options = field.options ?? [];
  const allowed = options.map((option) => option.value);
  const selected = new Set(parseSelected(value));
  const groups = new Map<string, typeof options>();
  for (const option of options) {
    const group = option.group ?? "";
    const list = groups.get(group) ?? [];
    list.push(option);
    groups.set(group, list);
  }

  const toggle = (optionValue: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(optionValue);
    else next.delete(optionValue);
    onChange(joinSelected([...next], allowed));
  };

  const toggleGroup = (groupValues: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const item of groupValues) {
      if (checked) next.add(item);
      else next.delete(item);
    }
    onChange(joinSelected([...next], allowed));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {field.key === "operations" ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote }}>
          {t("workspace.taskProposal.card.operationsHint")}
        </div>
      ) : null}
      {[...groups.entries()].map(([group, groupOptions]) => {
        const groupValues = groupOptions.map((option) => option.value);
        const checkedCount = groupValues.filter((item) => selected.has(item)).length;
        const allChecked = checkedCount === groupValues.length && groupValues.length > 0;
        return (
          <div key={group || "default"} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {group ? (
              <label style={{ ...checkboxRowStyle, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = checkedCount > 0 && !allChecked;
                  }}
                  onChange={(event) => toggleGroup(groupValues, event.target.checked)}
                />
                {t(`productImport.operationGroup.${group}`, { defaultValue: group })}
              </label>
            ) : null}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px 14px",
                paddingLeft: group ? 22 : 0,
              }}
            >
              {groupOptions.map((option) => {
                const label =
                  field.key === "operations"
                    ? t(`productImport.operation.${option.value}`, { defaultValue: option.label })
                    : option.label;
                return (
                  <label key={option.value} style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      checked={selected.has(option.value)}
                      onChange={(event) => toggle(option.value, event.target.checked)}
                    />
                    {label}
                    {option.value === "delete" && selected.has("delete") ? (
                      <span style={{ fontSize: 11, color: "#b45309" }}>
                        {t("productImport.operationHint.delete")}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FileField({
  field,
  value,
  fileName,
  fallbackFileId,
  onChange,
  onUploading,
}: {
  field: TaskProposalField;
  value: string;
  fileName: string;
  fallbackFileId?: string;
  onChange: (fileId: string, fileName: string) => void;
  onUploading?: (uploading: boolean) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const hasLocal = Boolean(value.trim());
  const hasFallback = Boolean(fallbackFileId?.trim());
  const displayName = fileName.trim() || (hasLocal ? value : "");

  const setBusy = (busy: boolean) => {
    setUploading(busy);
    onUploading?.(busy);
  };

  const upload = async (file: File) => {
    setError(null);
    if (!isProductImportSpreadsheetName(file.name)) {
      setError(t("workspace.taskProposal.card.fileInvalidType"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t("workspace.taskProposal.card.fileTooLarge"));
      return;
    }
    setBusy(true);
    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/upload-file${authQuery}`, { method: "POST", body: formData });
      const json = (await res.json()) as { id?: string; name?: string; error?: string };
      if (!res.ok || !json.id) {
        throw new Error(json.error || t("workspace.taskProposal.card.fileUploadFailed"));
      }
      onChange(json.id, json.name || file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspace.taskProposal.card.fileUploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        style={{
          width: "100%",
          border: `1px dashed ${dragOver ? "rgba(0, 128, 96, 0.55)" : pageColorTokens.borderSubtle}`,
          borderRadius: 10,
          background: dragOver ? pageColorTokens.brandGreenLight : pageColorTokens.surfaceSubtle,
          padding: "14px 12px",
          cursor: uploading ? "wait" : "pointer",
          textAlign: "left",
          color: pageColorTokens.textPrimary,
        }}
        aria-label={field.label}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {uploading
            ? t("workspace.taskProposal.card.fileUploading")
            : hasLocal || hasFallback
              ? t("workspace.taskProposal.card.fileReplace")
              : t("workspace.taskProposal.card.filePick")}
        </div>
        <div style={{ fontSize: 12, color: pageColorTokens.textFootnote, marginTop: 4 }}>
          {t("workspace.taskProposal.card.fileHint")}
        </div>
      </button>
      {hasLocal && displayName ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("workspace.taskProposal.card.fileSelected", { name: displayName })}
        </div>
      ) : hasFallback ? (
        <div style={{ fontSize: 12, color: pageColorTokens.textSecondary }}>
          {t("workspace.taskProposal.card.fileUsingContext")}
        </div>
      ) : null}
      {error ? (
        <div style={{ fontSize: 12, color: "#b45309" }}>{error}</div>
      ) : null}
    </div>
  );
}
