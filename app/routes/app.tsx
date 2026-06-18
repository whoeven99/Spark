import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Outlet, useLoaderData, useLocation, useRouteError } from "react-router";
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
import { ensureWebPixel } from "../server/webPixel/ensureWebPixel.server";
import { syncV4JobShopifyTokensFromSession } from "../server/translation/v4/syncV4JobShopifyTokens.server";
import {
  getAppEntryConfig,
  type NavItemKey,
} from "../config/appEntry.server";
import {
  appendEmbeddedSearchToPath,
  resolveEmbeddedLocationSearch,
} from "../lib/embeddedLocationSearch";

const NAV_ITEMS: Record<
  NavItemKey,
  {
    href: string;
    labelKey:
      | "nav.aiAssistant"
      | "nav.translationV4"
      | "nav.productImprove"
      | "nav.imageStudio"
      | "nav.billing"
      | "nav.orderMonitor"
      | "nav.dailyOperations"
      | "nav.adsCatalog";
  }
> = {
  chat: { href: "/app", labelKey: "nav.aiAssistant" },
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
  "ads-catalog": {
    href: "/app/ads-catalog",
    labelKey: "nav.adsCatalog",
  },
  billing: { href: "/app/billing", labelKey: "nav.billing" },
};

/** 同一进程内每个 shop 的 V4 token 同步间隔，避免重复打 Cosmos。 */
const V4_TOKEN_SYNC_TTL_MS = 10 * 60 * 1000;
const lastV4TokenSyncAt = new Map<string, number>();

function scheduleV4TokenSync(shop: string, accessToken?: string | null) {
  const now = Date.now();
  const last = lastV4TokenSyncAt.get(shop) ?? 0;
  if (now - last < V4_TOKEN_SYNC_TTL_MS) return;
  lastV4TokenSyncAt.set(shop, now);

  void syncV4JobShopifyTokensFromSession(shop, accessToken).catch((error) => {
    console.error("[v4:token-sync] app shell sync failed:", error);
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // fire-and-forget：不阻断页面切换（幂等 + 日志短路）
  void recordAppInstalled({
    shop: session.shop,
    sessionId: session.id,
    scope: session.scope,
    isOnline: session.isOnline,
    source: "app_shell",
  }).catch((error) => {
    console.error("[CommonEvent] recordAppInstalled failed:", error);
  });

  // fire-and-forget：失败只记日志，不阻断页面加载（内部带 10 分钟 TTL 防抖）
  void ensureWebPixel(admin, session.shop);

  scheduleV4TokenSync(session.shop, session.accessToken);

  const locale = detectRequestLocale(request);
  const { nav, home } = getAppEntryConfig();

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale, nav, home };
};

/** /app 子页面之间切换时不重跑壳层 loader，避免重复鉴权副作用与 Cosmos 同步。 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formAction?.includes("/app")) {
    return defaultShouldRevalidate;
  }

  const isAppChildNavigation =
    currentUrl.pathname.startsWith("/app") &&
    nextUrl.pathname.startsWith("/app") &&
    currentUrl.pathname !== nextUrl.pathname;

  if (isAppChildNavigation) {
    return false;
  }

  return defaultShouldRevalidate;
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
  const location = useLocation();
  const embeddedSearch = resolveEmbeddedLocationSearch(location.search);

  return (
    <s-app-nav>
      {nav.map((item) => {
        const config = NAV_ITEMS[item];
        return (
          <s-link
            key={item}
            href={appendEmbeddedSearchToPath(config.href, embeddedSearch)}
          >
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
