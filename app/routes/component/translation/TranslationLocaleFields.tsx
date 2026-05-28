import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ShopLocaleOption } from "../../../lib/productImproveLocales";
import { toTranslationLocaleOptions } from "../../../lib/translationShopLocales";
import type { LocaleSelectionMode } from "../../../hooks/useShopLocales";
import { pageHintTextStyle } from "../../page/pageUiStyles";
import { TranslationMultiSelect } from "./TranslationMultiSelect";

export type TranslationLocaleFieldsProps = {
  sourceLocale: string;
  sourceLabel: string;
  targetOptions: ShopLocaleOption[];
  loading?: boolean;
  disabled?: boolean;
  localesIsFallback?: boolean;
  selectionMode?: LocaleSelectionMode;
  targetFieldId?: string;
  /** 单选模式 */
  targetLocale?: string;
  onTargetLocaleChange?: (value: string) => void;
  /** 多选模式 */
  targetLocales?: string[];
  onToggleTargetLocale?: (value: string) => void;
  onTargetLocalesChange?: (values: string[]) => void;
};

export function TranslationLocaleFields(props: TranslationLocaleFieldsProps) {
  const {
    sourceLocale,
    sourceLabel,
    targetOptions,
    loading = false,
    disabled = false,
    localesIsFallback = false,
    selectionMode = "single",
    targetFieldId = "translation-target-locale",
  } = props;

  const { t } = useTranslation();
  const fieldsDisabled = disabled || loading;
  const sourceDisplay = sourceLabel || sourceLocale;
  const isMultiple = selectionMode === "multiple";

  const displayOptions = useMemo(
    () => toTranslationLocaleOptions(targetOptions),
    [targetOptions],
  );

  const showLoadingPlaceholder = loading && targetOptions.length === 0;
  const showEmptyHint = !loading && targetOptions.length === 0;

  const selectedLocales = props.targetLocales ?? [];
  const singleTarget = props.targetLocale ?? "";
  const currentValues = isMultiple
    ? selectedLocales
    : singleTarget
      ? [singleTarget]
      : [];

  const handleChange = (values: string[]) => {
    if (isMultiple) {
      if (props.onTargetLocalesChange) {
        props.onTargetLocalesChange(values);
        return;
      }
      const prev = new Set(selectedLocales);
      const next = new Set(values);
      for (const value of values) {
        if (!prev.has(value)) {
          props.onToggleTargetLocale?.(value);
        }
      }
      for (const value of selectedLocales) {
        if (!next.has(value)) {
          props.onToggleTargetLocale?.(value);
        }
      }
      return;
    }
    props.onTargetLocaleChange?.(values[0] ?? "");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      <div>
        <s-text-field
          label={t("translation.sourceLocale")}
          value={sourceDisplay}
          disabled
          autocomplete="off"
        />
      </div>

      <div>
        {showLoadingPlaceholder ? (
          <div
            style={{
              marginTop: "0.35rem",
              fontSize: "0.8125rem",
              color: "#6d7175",
            }}
          >
            {t("common.loadingLanguage")}
          </div>
        ) : null}

        {showEmptyHint ? (
          <div style={{ ...pageHintTextStyle, marginTop: "0.35rem" }}>
            {t("translation.selectTargetLocale")}
          </div>
        ) : null}

        {!showLoadingPlaceholder && displayOptions.length > 0 ? (
          <TranslationMultiSelect
            id={targetFieldId}
            label={t("translation.targetLocale")}
            options={displayOptions}
            values={currentValues}
            onChange={handleChange}
            disabled={fieldsDisabled}
            selectionMode={isMultiple ? "multiple" : "single"}
          />
        ) : null}

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
