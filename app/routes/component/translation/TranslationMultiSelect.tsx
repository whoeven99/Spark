import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageSelectStyle,
} from "../../page/pageUiStyles";

export type TranslationMultiSelectOption = {
  value: string;
  label: string;
};

export type TranslationMultiSelectProps = {
  id: string;
  label?: string;
  options: TranslationMultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  /** 单选时每次只保留一项 */
  selectionMode?: "single" | "multiple";
  summaryMode?: "names" | "count";
  /** 超过该数量时摘要改用 count 模式 */
  summaryNameLimit?: number;
  /** 下拉面板内的列数，>1 时启用紧凑多列布局 */
  columns?: number;
};

function panelStyle(columns: number): CSSProperties {
  return {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: "18rem",
    overflowY: "auto",
    borderRadius: pageColorTokens.radiusControl,
    border: `1px solid ${pageColorTokens.border}`,
    background: pageColorTokens.surface,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
    padding: "0.4rem",
    ...(columns > 1
      ? { display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: "2px" }
      : { padding: "0.35rem 0" }),
  };
}

function optionRowStyle(selected: boolean, disabled: boolean, compact: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: compact ? "0.3rem" : "0.5rem",
    width: "100%",
    padding: compact ? "0.3rem 0.5rem" : "0.45rem 0.75rem",
    fontSize: compact ? "0.75rem" : "0.8125rem",
    fontWeight: selected ? 600 : 400,
    textAlign: "left",
    border: "none",
    borderRadius: compact ? "4px" : 0,
    background: selected ? "rgba(0, 166, 124, 0.10)" : "transparent",
    color: selected ? pageColorTokens.textPrimary : pageColorTokens.textBody,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

function buildSummary(
  options: TranslationMultiSelectOption[],
  values: string[],
  summaryMode: "names" | "count",
  summaryNameLimit: number,
  placeholder: string,
  selectedCountLabel: (count: number) => string,
): string {
  if (!values.length) {
    return placeholder;
  }
  if (summaryMode === "count" || values.length > summaryNameLimit) {
    return selectedCountLabel(values.length);
  }
  const labelByValue = new Map(options.map((o) => [o.value, o.label]));
  return values.map((v) => labelByValue.get(v) ?? v).join("、");
}

export function TranslationMultiSelect({
  id,
  label,
  options,
  values,
  onChange,
  disabled = false,
  placeholder,
  selectionMode = "multiple",
  summaryMode = "names",
  summaryNameLimit = 3,
  columns = 1,
}: TranslationMultiSelectProps) {
  const { t } = useTranslation();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const resolvedPlaceholder =
    placeholder ?? t("translationRuntime.selectPlaceholder");

  const summary = useMemo(
    () =>
      buildSummary(
        options,
        values,
        summaryMode,
        summaryNameLimit,
        resolvedPlaceholder,
        (count) => t("translationRuntime.selectedCount", { count }),
      ),
    [options, values, summaryMode, summaryNameLimit, resolvedPlaceholder, t],
  );

  const toggleValue = useCallback(
    (value: string) => {
      if (disabled) return;
      if (selectionMode === "single") {
        onChange([value]);
        setOpen(false);
        return;
      }
      if (values.includes(value)) {
        onChange(values.filter((v) => v !== value));
      } else {
        onChange([...values, value]);
      }
    },
    [disabled, onChange, selectionMode, values],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const labelId = `${id}-label`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      {label ? (
        <div id={labelId} style={pageFieldLabelStyle}>
          {label}
        </div>
      ) : null}
      <button
        type="button"
        id={id}
        aria-labelledby={label ? labelId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          ...pageSelectStyle(disabled),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          color: values.length ? pageColorTokens.textBody : pageColorTokens.textSecondary,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {summary}
        </span>
        <span aria-hidden style={{ fontSize: "0.65rem", color: pageColorTokens.textSecondary }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : id}
          aria-multiselectable={selectionMode === "multiple" ? true : undefined}
          style={panelStyle(columns)}
        >
          {options.map((opt) => {
            const selected = values.includes(opt.value);
            const compact = columns > 1;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                style={optionRowStyle(selected, disabled, compact)}
                onClick={() => toggleValue(opt.value)}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={selected}
                  tabIndex={-1}
                  aria-hidden
                  style={{ pointerEvents: "none", flexShrink: 0 }}
                />
                <span style={{ lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
