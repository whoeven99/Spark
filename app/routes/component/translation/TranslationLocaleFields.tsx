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

  const showLoadingPlaceholder = loading && targetOptions.length === 0;
  const showEmptyHint = !loading && targetOptions.length === 0;

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
        <div id={`${targetFieldId}-label`} style={pageFieldLabelStyle}>
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
          <div
            id={targetFieldId}
            role="radiogroup"
            aria-labelledby={`${targetFieldId}-label`}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "0.5rem",
              marginTop: "0.35rem",
            }}
          >
            {targetOptions.map((opt) => {
              const selected = targetLocale === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={fieldsDisabled}
                  style={localeCardStyle(selected, fieldsDisabled)}
                  onClick={() => onTargetLocaleChange(opt.value)}
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
