import type { CSSProperties } from "react";
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
  pageColorTokens,
  pageSelectCompactStyle,
} from "../../page/pageUiStyles";

/** 语言下拉选项展示：每种语言用自身书写形式，不随 UI 语言变化，也不走 t()。 */
const LANGUAGE_NATIVE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  "zh-CN": "中文（简体）",
};

/** 自定义居中箭头，避免原生 select 箭头在 Windows 上偏上/偏下。 */
const SELECT_CHEVRON_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="${pageColorTokens.textSecondary}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);

function withCenteredChevron(base: CSSProperties, disabled: boolean): CSSProperties {
  // 去掉 pageSelect 的 background 简写，改用 color + image 才能把箭头垂直居中
  const rest = { ...base };
  delete rest.background;
  return {
    ...rest,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    backgroundColor: disabled ? pageColorTokens.surfaceMuted : pageColorTokens.surface,
    backgroundImage: `url("data:image/svg+xml,${SELECT_CHEVRON_SVG}")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.65rem center",
    backgroundSize: "12px 12px",
    paddingRight: "1.85rem",
    cursor: disabled ? "default" : "pointer",
  };
}

type LanguageSelectorProps = {
  locale?: SupportedLocale;
  /** bar：独立灰条含标签；inline：紧凑行内；fill：无标签、撑满父容器（账户菜单等） */
  variant?: "bar" | "inline" | "fill";
};

export function LanguageSelector({
  locale = DEFAULT_LOCALE,
  variant = "bar",
}: LanguageSelectorProps) {
  const { i18n, t } = useTranslation();
  const { setLocale, isSyncingLocale } = useLocaleActions();
  const isInline = variant === "inline";
  const isFill = variant === "fill";

  const selectStyle = withCenteredChevron(
    isFill
      ? {
          ...pageSelectCompactStyle(isSyncingLocale),
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
          flex: "none",
        }
      : isInline
        ? {
            ...pageSelectCompactStyle(isSyncingLocale),
            minWidth: "8.5rem",
            maxWidth: "12rem",
          }
        : pageSelectCompactStyle(isSyncingLocale),
    isSyncingLocale,
  );

  return (
    <div
      style={
        isFill
          ? { display: "block", width: "100%", minWidth: 0 }
          : isInline
            ? {
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }
            : languageSelectorBarStyle
      }
      role="group"
      aria-label={t("common.languageSelectorLabel")}
    >
      {!isInline && !isFill ? (
        <span style={languageSelectorLabelStyle}>{t("common.languageSelectorLabel")}</span>
      ) : null}
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
        style={selectStyle}
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
