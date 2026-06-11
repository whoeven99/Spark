import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppI18nProvider } from "../i18n/provider";
import {
  DEFAULT_LOCALE,
  buildLocaleCookieHeader,
  normalizeLocale,
} from "../i18n/config";
import { detectRequestLocale } from "../i18n/detector.server";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { syncV4JobShopifyTokensFromSession } from "../server/translation/v4/syncV4JobShopifyTokens.server";
import {
  getAppEntryConfig,
  type NavItemKey,
} from "../config/appEntry.server";

const NAV_ITEMS: Record<
  NavItemKey,
  {
    href: string;
    labelKey:
      | "nav.aiAssistant"
      | "nav.diagnosis"
      | "nav.translationV4"
      | "nav.productImprove"
      | "nav.imageStudio"
      | "nav.billing"
      | "nav.orderMonitor"
      | "nav.dailyOperations";
  }
> = {
  chat: { href: "/app", labelKey: "nav.aiAssistant" },
  diagnosis: { href: "/app/additional", labelKey: "nav.diagnosis" },
  "translation-v4": { href: "/app/translation-v4", labelKey: "nav.translationV4" },
  "product-improve": {
    href: "/app/product-improve",
    labelKey: "nav.productImprove",
  },
  "image-studio": {
    href: "/app/image-studio",
    labelKey: "nav.imageStudio",
  },
  "picture-translate": {
    href: "/app/image-studio?tab=translate",
    labelKey: "nav.imageStudio",
  },
  "generate-image": {
    href: "/app/image-studio?tab=generate",
    labelKey: "nav.imageStudio",
  },
  "order-monitor": { href: "/app/order-monitor", labelKey: "nav.orderMonitor" },
  "daily-operations": {
    href: "/app/daily-operations",
    labelKey: "nav.dailyOperations",
  },
  billing: { href: "/app/billing", labelKey: "nav.billing" },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    await recordAppInstalled({
      shop: session.shop,
      sessionId: session.id,
      scope: session.scope,
      isOnline: session.isOnline,
      source: "app_shell",
    });
  } catch (error) {
    console.error("[CommonEvent] recordAppInstalled failed:", error);
  }

  try {
    await syncV4JobShopifyTokensFromSession(session.shop, session.accessToken);
  } catch (error) {
    console.error("[v4:token-sync] app shell sync failed:", error);
  }

  const locale = detectRequestLocale(request);
  const { nav, home } = getAppEntryConfig();

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale, nav, home };
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

export default function App() {
  const { apiKey, locale, nav } = useLoaderData<typeof loader>();

  return (
    <AppI18nProvider locale={locale}>
      <AppProvider embedded apiKey={apiKey}>
        <AppNav nav={nav} />
        <Outlet />
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
