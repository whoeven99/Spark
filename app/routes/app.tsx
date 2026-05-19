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

import { debugAuthenticateAdmin } from "../server/debug/authenticateAdminDebug.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import {
  getAppEntryConfig,
  type NavItemKey,
} from "../config/appEntry.server";

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

const NAV_ITEMS: Record<
  NavItemKey,
  {
    href: string;
    labelKey:
      | "nav.aiAssistant"
      | "nav.diagnosis"
      | "nav.translation"
      | "nav.generateDescription"
      | "nav.pictureTranslate"
      | "nav.billing";
  }
> = {
  chat: { href: "/app", labelKey: "nav.aiAssistant" },
  diagnosis: { href: "/app/additional", labelKey: "nav.diagnosis" },
  translation: { href: "/app/translation", labelKey: "nav.translation" },
  "generate-description": {
    href: "/app/generate-description",
    labelKey: "nav.generateDescription",
  },
  "picture-translate": {
    href: "/app/picture-translate",
    labelKey: "nav.pictureTranslate",
  },
  billing: { href: "/app/billing", labelKey: "nav.billing" },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await debugAuthenticateAdmin(request, "app.shell");
  try {
    await recordAppInstalled({
      shop: session.shop,
      sessionId: session.id,
      scope: session.scope,
      isOnline: session.isOnline,
    });
  } catch (error) {
    console.error("[CommonEvent] recordAppInstalled failed:", error);
  }
  const locale = detectRequestLocale(request);
  const nav = getAppEntryConfig().nav;

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale, nav };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  await debugAuthenticateAdmin(request, "app.shell.action");

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

export default function App() {
  const { apiKey, locale, nav } = useLoaderData<typeof loader>();

  return (
    <AppI18nProvider locale={locale}>
      <AppProvider embedded apiKey={apiKey}>
        <AppNav nav={nav} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 1 auto",
            minHeight: 0,
          }}
        >
          <div style={{ flex: "1 1 auto", minHeight: 0 }}>
            <Outlet />
          </div>
          <footer
            className="spark-app-shell-footer"
            style={{
              flexShrink: 0,
              marginTop: "0.75rem",
              paddingTop: "0.75rem",
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
              borderTop: "1px solid #e1e3e5",
            }}
          >
            <LanguageSelector locale={locale} />
          </footer>
        </div>
      </AppProvider>
    </AppI18nProvider>
  );
}

function AppNav({ nav }: { nav: readonly NavItemKey[] }) {
  const { t } = useTranslation();
  return (
    <s-app-nav>
      {nav.map((item) => {
        const config = NAV_ITEMS[item];
        return (
          <s-link key={item} href={config.href}>
            {t(config.labelKey)}
          </s-link>
        );
      })}
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
