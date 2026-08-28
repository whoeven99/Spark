import { useEffect } from "react";
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
import { resolveUiLocale } from "../i18n/resolveUiLocale.server";
import { authenticate } from "../shopify.server";
import { recordAppInstalled } from "../server/commonEventLog/index.server";
import { deleteShopWebPixel, ensureWebPixel } from "../server/webPixel/ensureWebPixel.server";
import { isStorefrontPixelCollectionEnabled } from "../lib/storefrontPixelCollection";
import { ensureInstallOrderBackfill } from "../server/shopify/sync/ensureInstallOrderBackfill.server";
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
  buildEmbeddedHomeRedirectPath,
  hasEmbeddedAuthContext,
  resolveEmbeddedLocationSearch,
} from "../lib/embeddedLocationSearch";
import { useEmbeddedLocationSearch } from "../hooks/useEmbeddedLocationSearch";
import { useEmbeddedNavigate } from "../hooks/useEmbeddedNavigate";
import {
  describeValueShape,
  logClientDiagnostic,
  logClientRenderError,
  warnIfLegacySpringRequests,
} from "../lib/clientDiagnostics.client";
import { getSparkBuildInfo } from "../lib/sparkBuildInfo.server";

const NAV_ITEMS: Record<
  NavItemKey,
  {
    href: string;
    labelKey:
      | "nav.home"
      | "nav.ask"
      | "nav.homeV1"
      | "nav.today"
      | "nav.healthMonitor"
      | "nav.studio"
      | "nav.tasks"
      | "nav.account"
      | "nav.settings"
      | "nav.adsCatalog";
  }
> = {
  home: { href: "/app", labelKey: "nav.home" },
  ask: { href: "/app/assistant", labelKey: "nav.ask" },
  "home-v1": { href: "/app/home-v1", labelKey: "nav.homeV1" },
  today: { href: "/app/today", labelKey: "nav.today" },
  "health-monitor": { href: "/app/health-monitor", labelKey: "nav.healthMonitor" },
  studio: { href: "/app/studio", labelKey: "nav.studio" },
  tasks: { href: "/app/tasks", labelKey: "nav.tasks" },
  account: { href: "/app/account", labelKey: "nav.account" },
  settings: { href: "/app/settings", labelKey: "nav.settings" },
  "ads-catalog": { href: "/app/ads-catalog", labelKey: "nav.adsCatalog" },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // fire-and-forget：不阻断页面切换（幂等 + 日志短路）
  void (async () => {
    const isNewInstall = await recordAppInstalled({
      shop: session.shop,
      sessionId: session.id,
      scope: session.scope,
      isOnline: session.isOnline,
      source: "app_shell",
    });
    // 新安装 / 重装：强制再跑一轮；否则仅在尚未 done 时补跑（含失败重试）。
    await ensureInstallOrderBackfill(session.shop, admin, { force: isNewInstall });
  })().catch((error) => {
    console.error("[AppShell] install bootstrap failed:", error);
  });

  void syncSessionUserProfileFromOnline(session).catch((error) => {
    console.warn("[SessionSync] syncSessionUserProfileFromOnline failed:", error);
  });

  void syncSessionShopProfile(session.shop, admin).catch((error) => {
    console.warn("[SessionSync] syncSessionShopProfile failed:", error);
  });

  // fire-and-forget：失败只记日志，不阻断页面加载（内部带 10 分钟 TTL 防抖）
  if (isStorefrontPixelCollectionEnabled()) {
    void ensureWebPixel(admin, session.shop);
  } else {
    void deleteShopWebPixel(admin, session.shop);
  }

  const locale = await resolveUiLocale(request, {
    admin,
    logContext: `app-shell shop=${session.shop}`,
  });
  const { nav, home } = getAppEntryConfig();
  const buildInfo = getSparkBuildInfo();
  const safeNav = Array.isArray(nav) ? nav : [];

  if (!Array.isArray(nav)) {
    console.warn("[SparkDiag] app_shell_loader invalid_nav", {
      shop: session.shop,
      navType: typeof nav,
      build: buildInfo.gitCommit,
    });
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    locale,
    nav: safeNav,
    home,
    buildInfo,
  };
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
    // Admin 侧栏整页跳转若丢掉 shop/host，必须重跑壳层 loader 才能补回 embedded 会话。
    if (!hasEmbeddedAuthContext(nextUrl.search)) {
      return true;
    }
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
  const { apiKey, locale, nav, buildInfo } = useLoaderData<typeof loader>();
  // 尽早缓存 shop/host，供客户端 navigate / fetch 在 query 丢失后兜底。
  useEmbeddedLocationSearch();

  useEffect(() => {
    warnIfLegacySpringRequests();
    logClientDiagnostic("app_shell_mount", {
      buildInfo,
      navShape: describeValueShape(nav),
      href: window.location.href,
      origin: window.location.origin,
    });

    fetch("/api/build-info")
      .then((res) => res.json())
      .then((json) => {
        logClientDiagnostic("build_info_verify", json);
      })
      .catch((error) => {
        logClientDiagnostic("build_info_verify_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [buildInfo, nav]);

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
 * 页面留白的唯一来源。主页与助手页都自带整屏布局，因此不套这层容器。
 */
function AppShellContent() {
  const location = useLocation();
  const { isMobile } = useResponsiveLayout();
  const normalizedPath = location.pathname.replace(/\/+$/, "");
  const isWorkspace =
    normalizedPath === "/app" ||
    normalizedPath === "/app/assistant" ||
    normalizedPath === "/app/home-v2";

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
  const navItems: NavItemKey[] = Array.isArray(nav) ? [...nav] : [];

  return (
    <s-app-nav>
      {navItems.map((item) => {
        const config = NAV_ITEMS[item];
        if (!config) return null;
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
  const error = useRouteError();

  useEffect(() => {
    logClientRenderError(error);
    if (typeof window === "undefined" || window.parent === window) return;
    const recovered = buildEmbeddedHomeRedirectPath(
      window.location.pathname,
      window.location.search,
    );
    const current = `${window.location.pathname}${window.location.search}`;
    if (recovered !== current) {
      window.location.replace(recovered);
    }
  }, [error]);

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
