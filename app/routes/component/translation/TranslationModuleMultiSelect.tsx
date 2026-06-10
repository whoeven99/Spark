import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getTranslationModuleOptions } from "../../../lib/translationModuleLabels";
import { TranslationMultiSelect } from "./TranslationMultiSelect";
import { pageColorTokens } from "../../page/pageUiStyles";

export type TranslationModuleMultiSelectProps = {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  label?: string;
  /** When set, only these module values appear in the dropdown. */
  allowedValues?: string[];
};

export function TranslationModuleMultiSelect({
  id,
  values,
  onChange,
  disabled = false,
  label,
  allowedValues,
}: TranslationModuleMultiSelectProps) {
  const { t } = useTranslation();
  const allOptions = useMemo(() => getTranslationModuleOptions(t), [t]);
  const options = useMemo(() => {
    if (!allowedValues?.length) return allOptions;
    const allowed = new Set(allowedValues);
    return allOptions.filter((o) => allowed.has(o.value));
  }, [allOptions, allowedValues]);
  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const allSelected = values.length === allValues.length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <span style={{ fontSize: "0.8125rem", color: pageColorTokens.textSecondary, fontWeight: 500 }}>
          {label ?? t("translationRuntime.moduleTitle")}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(allSelected ? [] : allValues)}
            style={{
              fontSize: "0.75rem",
              color: pageColorTokens.textSecondary,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 2px",
              textDecoration: "underline",
            }}
          >
            {allSelected ? "取消全选" : "全选"}
          </button>
        )}
      </div>
      <TranslationMultiSelect
        id={id}
        options={options}
        values={values}
        onChange={onChange}
        disabled={disabled}
        summaryMode="count"
        columns={3}
      />
    </div>
  );
}
