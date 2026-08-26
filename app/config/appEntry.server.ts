/**
 * 一级目的地。
 * 纯净 Agent IA：首页 v2（聊天）/ Studio / Tasks / 账户与订阅。
 * Today、Health Monitor、Settings、Ask、ads-catalog 仍可深链访问，不占一级导航。
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
  home: "/app/home-v2",
  nav: ["home-v2", "studio", "tasks", "account"],
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
