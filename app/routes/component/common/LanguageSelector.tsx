import { useTranslation } from "react-i18next";
import { useLocaleActions } from "../../../i18n/provider";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../../i18n/config";
import {
  languageSelectorBarStyle,
  languageSelectorLabelStyle,
  pageSelectCompactStyle,
} from "../../page/pageUiStyles";

/** 语言下拉选项展示：每种语言用自身书写形式，不随 UI 语言变化，也不走 t()。 */
const LANGUAGE_NATIVE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  "zh-CN": "中文（简体）",
};

type LanguageSelectorProps = {
  locale?: SupportedLocale;
  variant?: "bar" | "inline" | "panel";
};

export function LanguageSelector({
  locale = DEFAULT_LOCALE,
  variant = "bar",
}: LanguageSelectorProps) {
  const { i18n, t } = useTranslation();
  const { setLocale, isSyncingLocale } = useLocaleActions();
  const isInline = variant === "inline";
  const isPanel = variant === "panel";
  const stableA11yLabel = "Language selector";

  return (
    <div
      style={
        isInline
          ? {
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              minWidth: 0,
            }
          : isPanel
            ? {
                ...languageSelectorBarStyle,
                width: "100%",
                minWidth: 0,
                marginTop: 0,
                padding: "0.75rem",
              }
            : languageSelectorBarStyle
      }
      role="group"
      aria-label={stableA11yLabel}
      suppressHydrationWarning
    >
      {!isInline && !isPanel ? (
        <span style={languageSelectorLabelStyle} suppressHydrationWarning>
          {t("common.languageSelectorLabel")}
        </span>
      ) : null}
      <select
        id="spark-language-selector"
        aria-label={stableA11yLabel}
        value={isSupportedLocale(i18n.language) ? i18n.language : locale}
        onChange={(event) => {
          const next = normalizeLocale(event.target.value);
          if (!next) return;
          void i18n.changeLanguage(next);
          setLocale(next);
        }}
        disabled={isSyncingLocale}
        style={
          isInline
            ? {
                ...pageSelectCompactStyle(isSyncingLocale),
                minWidth: "8.5rem",
                maxWidth: "12rem",
                width: "100%",
                boxSizing: "border-box",
              }
            : isPanel
              ? {
                  ...pageSelectCompactStyle(isSyncingLocale),
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "100%",
                  flex: "1 1 auto",
                  boxSizing: "border-box",
                }
              : {
                  ...pageSelectCompactStyle(isSyncingLocale),
                  boxSizing: "border-box",
              }
        }
      >
        {SUPPORTED_LOCALES.map((item) => (
          <option key={item} value={item}>
            {LANGUAGE_NATIVE_LABELS[item] ?? item}
          </option>
        ))}
      </select>
    </div>
  );
}
