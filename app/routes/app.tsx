import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import {
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { useTranslation } from "react-i18next";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppI18nProvider } from "../i18n/provider";
import {
  DEFAULT_LOCALE,
  buildLocaleCookieHeader,
  normalizeLocale,
} from "../i18n/config";
import { detectRequestLocale, readShopifySessionLocale } from "../i18n/detector.server";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { ensureWebPixel } from "../server/webPixel/ensureWebPixel.server";
import {
  syncSessionShopProfile,
  syncSessionUserProfileFromOnline,
} from "../server/session/syncSessionUserProfile.server";
import {
  getAppEntryConfig,
  type NavItemKey,
} from "../config/appEntry.server";
import { SupportChatWidget } from "./component/SupportChatWidget";
import {
  appShellContentMobileStyle,
  appShellContentStyle,
} from "./page/pageUiStyles";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  appendEmbeddedSearchToPath,
  resolveEmbeddedLocationSearch,
} from "../lib/embeddedLocationSearch";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";

const NAV_ITEMS: Record<
  NavItemKey,
  {
    href: string;
    labelKey:
      | "nav.ask"
      | "nav.today"
      | "nav.healthMonitor"
      | "nav.studio"
      | "nav.insights"
      | "nav.tasks"
      | "nav.settings"
      | "nav.adsCatalog";
  }
> = {
  ask: { href: "/app", labelKey: "nav.ask" },
  today: { href: "/app/today", labelKey: "nav.today" },
  "health-monitor": { href: "/app/health-monitor", labelKey: "nav.healthMonitor" },
  studio: { href: "/app/studio", labelKey: "nav.studio" },
  insights: { href: "/app/insights", labelKey: "nav.insights" },
  tasks: { href: "/app/tasks", labelKey: "nav.tasks" },
  settings: { href: "/app/settings", labelKey: "nav.settings" },
  "ads-catalog": { href: "/app/ads-catalog", labelKey: "nav.adsCatalog" },
};

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

  void syncSessionUserProfileFromOnline(session).catch((error) => {
    console.warn("[SessionSync] syncSessionUserProfileFromOnline failed:", error);
  });

  void syncSessionShopProfile(session.shop, admin).catch((error) => {
    console.warn("[SessionSync] syncSessionShopProfile failed:", error);
  });

  // fire-and-forget：失败只记日志，不阻断页面加载（内部带 10 分钟 TTL 防抖）
  void ensureWebPixel(admin, session.shop);

  const locale = detectRequestLocale(request, {
    sessionLocale: readShopifySessionLocale(session),
  });
  const { nav, home } = getAppEntryConfig();

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale, nav, home };
};

/** /app 子页面之间切换时不重跑壳层 loader，避免重复鉴权副作用。 */
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
  // 尽早缓存 shop/host，供客户端 navigate / fetch 在 query 丢失后兜底。
  useEmbeddedLocationSearch();

  return (
    <AppI18nProvider locale={locale}>
      <AppProvider embedded apiKey={apiKey}>
        <AppNav nav={nav} />
        <AppShellContent />
        <SupportChatWidget />
      </AppProvider>
    </AppI18nProvider>
  );
}

/**
 * 页面留白的唯一来源。工作台首页是整屏两栏布局，自带内边距，因此不套这层容器。
 */
function AppShellContent() {
  const location = useLocation();
  const { isMobile } = useResponsiveLayout();
  const isWorkspace = location.pathname.replace(/\/+$/, "") === "/app";

  if (isWorkspace) {
    return <Outlet />;
  }

  return (
    <div style={isMobile ? appShellContentMobileStyle : appShellContentStyle}>
      <Outlet />
    </div>
  );
}

function AppNav({ nav }: { nav: readonly NavItemKey[] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const embeddedSearch = resolveEmbeddedLocationSearch(location.search);
  const navigate = useEmbeddedNavigate();

  return (
    <s-app-nav>
      {nav.map((item) => {
        const config = NAV_ITEMS[item];
        const target = appendEmbeddedSearchToPath(config.href, embeddedSearch);
        return (
          <s-link
            key={item}
            href={target}
            onClick={(event) => {
              event.preventDefault();
              void navigate(target);
            }}
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
