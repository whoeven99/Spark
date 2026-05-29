import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, type SupportedLocale } from "./config";
import { translationResources } from "./resources";

export function initI18n(locale: SupportedLocale): I18nInstance {
  const i18nInstance = createInstance();
  void i18nInstance.use(initReactI18next).init({
    resources: translationResources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: Object.keys(translationResources),
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    initImmediate: false,
  });
  return i18nInstance;
}
