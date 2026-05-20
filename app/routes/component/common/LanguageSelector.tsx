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
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
};

type LanguageSelectorProps = {
  locale?: SupportedLocale;
};

export function LanguageSelector({ locale = DEFAULT_LOCALE }: LanguageSelectorProps) {
  const { i18n, t } = useTranslation();
  const { setLocale, isSyncingLocale } = useLocaleActions();

  return (
    <div
      style={languageSelectorBarStyle}
      role="group"
      aria-label={t("common.languageSelectorLabel")}
    >
      <span style={languageSelectorLabelStyle}>{t("common.languageSelectorLabel")}</span>
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
        style={pageSelectCompactStyle(isSyncingLocale)}
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
