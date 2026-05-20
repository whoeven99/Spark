import { useTranslation } from "react-i18next";
import { useLocaleActions } from "../../../i18n/provider";
import {
  isSupportedLocale,
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../../i18n/config";

/** 语言下拉选项展示：每种语言用自身书写形式，不随 UI 语言变化，也不走 t()。 */
const LANGUAGE_NATIVE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  "zh-CN": "中文（简体）",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
};

export function LanguageSelector({ locale }: { locale: SupportedLocale }) {
  const { i18n, t } = useTranslation();
  const { setLocale, isSyncingLocale } = useLocaleActions();

  return (
    <div style={{ margin: 0 }}>
      <label
        htmlFor="spark-language-selector"
        style={{
          display: "inline-block",
          marginBottom: "0.25rem",
          fontSize: "0.75rem",
          color: "#6d7175",
        }}
      >
        {t("common.languageSelectorLabel")}
      </label>
      <select
        id="spark-language-selector"
        value={isSupportedLocale(i18n.language) ? i18n.language : locale}
        onChange={(event) => {
          const next = normalizeLocale(event.target.value);
          if (!next) return;
          void i18n.changeLanguage(next);
          setLocale(next);
        }}
        disabled={isSyncingLocale}
        style={{
          display: "block",
          minWidth: "180px",
          padding: "0.35rem 0.5rem",
          borderRadius: "8px",
          border: "1px solid #c9cccf",
          background: "#fff",
          color: "#303030",
          fontSize: "0.8125rem",
        }}
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
