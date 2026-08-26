/**
 * 一级目的地。
 * ads-catalog 保留为可路由入口（Studio/Settings 内链），不占一级导航。
 * 计费在一级「账户与订阅」`/app/account`；旧 `/app/settings/billing` 重定向至此。
 */
export type NavItemKey =
  | "ask"
  | "home-v2"
  | "today"
  | "health-monitor"
  | "studio"
  | "tasks"
  | "account"
  | "settings"
  | "ads-catalog";

type AppShellConfig = {
  home: string;
  nav: readonly NavItemKey[];
};

const DEFAULT_APP_SHELL_CONFIG = {
  home: "/app",
  nav: [
    "ask",
    "home-v2",
    "today",
    "health-monitor",
    "studio",
    "tasks",
    "account",
    "settings",
  ],
} as const satisfies AppShellConfig;

export function getAppEntryConfig(): AppShellConfig {
  return DEFAULT_APP_SHELL_CONFIG;
}

/** 嵌入式 App 首页路径（工作台 `/app`）。 */
export function getAppHomePath(): string {
  return DEFAULT_APP_SHELL_CONFIG.home;
}

/** 嵌入式 Admin 跳转时保留 shop/host/id_token 等查询参数，避免鉴权循环。 */
export function buildEmbeddedAppPath(path: string, request: Request): string {
  const url = new URL(request.url);
  const target = new URL(path, url.origin);
  target.search = url.search;
  return `${target.pathname}${target.search}`;
}
