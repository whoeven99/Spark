import { useEffect, useRef } from "react";
import type { i18n as I18nInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { useFetcher } from "react-router";
import { initI18n } from "./index";
import {
  LOCALE_STORAGE_KEY,
  type SupportedLocale,
  normalizeLocale,
} from "./config";

type Props = {
  locale: SupportedLocale;
  children: React.ReactNode;
};

export function AppI18nProvider({ locale, children }: Props) {
  const i18nRef = useRef<I18nInstance>(initI18n(locale));
  const i18n = i18nRef.current;
  const localeFetcher = useFetcher();

  useEffect(() => {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
  }, [i18n, locale]);

  useEffect(() => {
    const next = normalizeLocale(i18n.language);
    if (!next || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, [i18n.language]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useLocaleActions() {
  const localeFetcher = useFetcher();

  const setLocale = (nextLocale: SupportedLocale) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    }
    localeFetcher.submit(
      { locale: nextLocale },
      { method: "post", action: "/app?setLocale=1" },
    );
  };

  return {
    setLocale,
    isSyncingLocale: localeFetcher.state !== "idle",
  };
}
