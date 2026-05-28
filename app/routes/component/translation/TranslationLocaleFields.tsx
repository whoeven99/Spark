import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ShopLocaleOption } from "../../../lib/productImproveLocales";
import type { LocaleSelectionMode } from "../../../hooks/useShopLocales";
import {
  pageColorTokens,
  pageFieldLabelStyle,
  pageHintTextStyle,
} from "../../page/pageUiStyles";

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
};

function localeCardStyle(selected: boolean, fieldsDisabled: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    width: "100%",
    padding: "0.5rem 0.65rem",
    fontSize: "0.8125rem",
    fontWeight: selected ? 600 : 500,
    textAlign: "left",
    borderRadius: "8px",
    border: selected
      ? `1px solid ${pageColorTokens.brandGreen}`
      : `1px solid ${pageColorTokens.border}`,
    background: selected ? "rgba(0, 128, 96, 0.12)" : pageColorTokens.surface,
    color: selected ? "#004d3d" : pageColorTokens.textBody,
    cursor: fieldsDisabled ? "not-allowed" : "pointer",
    opacity: fieldsDisabled ? 0.55 : 1,
    transition: "background 0.15s ease, border-color 0.15s ease",
    boxSizing: "border-box",
  };
}

function checkboxVisualStyle(selected: boolean): CSSProperties {
  return {
    flexShrink: 0,
    width: 16,
    height: 16,
    borderRadius: 3,
    border: selected
      ? `2px solid ${pageColorTokens.brandGreen}`
      : `2px solid ${pageColorTokens.borderInput}`,
    background: selected ? pageColorTokens.brandGreen : pageColorTokens.surface,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
    fontSize: "0.65rem",
    lineHeight: 1,
  };
}

function LocaleOptionGrid({
  targetFieldId,
  labelId,
  targetOptions,
  fieldsDisabled,
  isMultiple,
  isSelected,
  onSelect,
}: {
  targetFieldId: string;
  labelId: string;
  targetOptions: ShopLocaleOption[];
  fieldsDisabled: boolean;
  isMultiple: boolean;
  isSelected: (value: string) => boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      id={targetFieldId}
      role={isMultiple ? "group" : "radiogroup"}
      aria-labelledby={labelId}
      aria-multiselectable={isMultiple ? true : undefined}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "0.5rem",
        marginTop: "0.35rem",
      }}
    >
      {targetOptions.map((opt) => {
        const selected = isSelected(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            role={isMultiple ? "checkbox" : "radio"}
            aria-checked={selected}
            disabled={fieldsDisabled}
            style={localeCardStyle(selected, fieldsDisabled)}
            onClick={() => onSelect(opt.value)}
          >
            <span style={checkboxVisualStyle(selected)} aria-hidden>
              {selected ? "✓" : null}
            </span>
            <span style={{ lineHeight: 1.35, wordBreak: "break-word" }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
  const labelId = `${targetFieldId}-label`;
  const isMultiple = selectionMode === "multiple";

  const showLoadingPlaceholder = loading && targetOptions.length === 0;
  const showEmptyHint = !loading && targetOptions.length === 0;

  const selectedLocales = props.targetLocales ?? [];
  const singleTarget = props.targetLocale ?? "";

  const isSelected = (value: string) =>
    isMultiple ? selectedLocales.includes(value) : singleTarget === value;

  const onSelect = (value: string) => {
    if (isMultiple) {
      props.onToggleTargetLocale?.(value);
    } else {
      props.onTargetLocaleChange?.(value);
    }
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
        <div id={labelId} style={pageFieldLabelStyle}>
          {t("translation.targetLocale")}
        </div>

        {showLoadingPlaceholder ? (
          <div
            style={{
              marginTop: "0.35rem",
              fontSize: "0.8125rem",
              color: pageColorTokens.textSecondary,
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

        {!showLoadingPlaceholder && targetOptions.length > 0 ? (
          <LocaleOptionGrid
            targetFieldId={targetFieldId}
            labelId={labelId}
            targetOptions={targetOptions}
            fieldsDisabled={fieldsDisabled}
            isMultiple={isMultiple}
            isSelected={isSelected}
            onSelect={onSelect}
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
