import { useTranslation } from "react-i18next";
import type { ShopLocaleOption } from "../../../lib/productImproveLocales";
import type { LocaleSelectionMode } from "../../../hooks/useShopLocales";
import {
  pageFieldLabelStyle,
  pageHintTextStyle,
  pageSelectStyle,
} from "../../page/pageUiStyles";

export type TranslationLocaleFieldsProps = {
  sourceLocale: string;
  sourceLabel: string;
  targetLocale: string;
  onTargetLocaleChange: (value: string) => void;
  targetOptions: ShopLocaleOption[];
  loading?: boolean;
  disabled?: boolean;
  localesIsFallback?: boolean;
  /** 预留多选；当前仅实现 single */
  selectionMode?: LocaleSelectionMode;
  targetFieldId?: string;
};

export function TranslationLocaleFields({
  sourceLocale,
  sourceLabel,
  targetLocale,
  onTargetLocaleChange,
  targetOptions,
  loading = false,
  disabled = false,
  localesIsFallback = false,
  selectionMode = "single",
  targetFieldId = "translation-target-locale",
}: TranslationLocaleFieldsProps) {
  const { t } = useTranslation();
  const fieldsDisabled = disabled || loading;
  const sourceDisplay = sourceLabel || sourceLocale;

  if (selectionMode === "multiple") {
    // 后续多目标语言：在此渲染多选 UI
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "0.75rem",
      }}
    >
      <div>
        <s-text-field
          label={t("translation.sourceLocale")}
          value={sourceDisplay}
          disabled
          autocomplete="off"
        />
      </div>
      <div>
        <label htmlFor={targetFieldId} style={pageFieldLabelStyle}>
          {t("translation.targetLocale")}
        </label>
        <select
          id={targetFieldId}
          value={targetLocale}
          onChange={(e) => onTargetLocaleChange(e.target.value)}
          disabled={fieldsDisabled || targetOptions.length === 0}
          style={pageSelectStyle(fieldsDisabled || targetOptions.length === 0)}
        >
          {loading && targetOptions.length === 0 ? (
            <option value="">{t("common.loadingLanguage")}</option>
          ) : null}
          {targetOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {localesIsFallback ? (
          <div style={pageHintTextStyle}>
            {t("translation.fallbackLocalesHint")}{" "}
            <code style={{ fontSize: "0.7rem" }}>read_locales</code>
          </div>
        ) : null}
      </div>
    </div>
  );
}
