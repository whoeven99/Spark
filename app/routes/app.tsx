import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppI18nProvider, useLocaleActions } from "../i18n/provider";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  buildLocaleCookieHeader,
  isSupportedLocale,
  normalizeLocale,
  type SupportedLocale,
} from "../i18n/config";
import { detectRequestLocale } from "../i18n/detector.server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const locale = detectRequestLocale(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  if (!url.searchParams.has("setLocale")) {
    return Response.json({ ok: false, message: "unsupported action" }, { status: 400 });
  }

  const formData = await request.formData();
  const nextLocale = normalizeLocale(formData.get("locale")?.toString());
  const locale = nextLocale ?? DEFAULT_LOCALE;
  console.info(`[i18n] set locale=${locale}`);

  return Response.json(
    { ok: true, locale },
    {
      headers: {
        "Set-Cookie": buildLocaleCookieHeader(locale),
      },
    },
  );
};

function LanguageSelector({ locale }: { locale: SupportedLocale }) {
  const { i18n, t } = useTranslation();
  const { setLocale, isSyncingLocale } = useLocaleActions();

  return (
    <div style={{ margin: "0.5rem 0 0.35rem" }}>
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
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();

  return (
    <AppI18nProvider locale={locale}>
      <AppProvider embedded apiKey={apiKey}>
        <LanguageSelector locale={locale} />
        <AppNav />
        <Outlet />
      </AppProvider>
    </AppI18nProvider>
  );
}

function AppNav() {
  const { t } = useTranslation();
  return (
    <s-app-nav>
      <s-link href="/app">{t("nav.aiAssistant")}</s-link>
      <s-link href="/app/additional">{t("nav.diagnosis")}</s-link>
      <s-link href="/app/translation">{t("nav.translation")}</s-link>
      <s-link href="/app/generate-description">{t("nav.generateDescription")}</s-link>
    </s-app-nav>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
