/**
 * 一级目的地。
 * ads-catalog 保留为可路由入口（Studio/Settings 内链），不占一级导航。
 * 计费在一级「账户与订阅」`/app/account`；旧 `/app/settings/billing` 重定向至此。
 *
 * 导航按运行时环境分流：prod 仅首页 + 账户；测/本地展示全量。
 */
import { isProductionNodeEnv } from "./nodeEnv.server";

export type NavItemKey =
  | "home"
  | "ask"
  | "home-v1"
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

/** 测环境 / 本地：全量一级导航。 */
const FULL_NAV = [
  "home",
  "ask",
  "home-v1",
  "today",
  "health-monitor",
  "studio",
  "tasks",
  "account",
  "settings",
] as const satisfies readonly NavItemKey[];

/** 生产：第一版仅首页与账户与订阅。 */
const PROD_NAV = ["home", "account"] as const satisfies readonly NavItemKey[];

export function getAppEntryConfig(): AppShellConfig {
  return {
    home: "/app",
    nav: isProductionNodeEnv() ? PROD_NAV : FULL_NAV,
  };
}

/** 嵌入式 App 首页路径（工作台 `/app`）。 */
export function getAppHomePath(): string {
  return "/app";
}

/** 嵌入式 Admin 跳转时保留 shop/host/id_token 等查询参数，避免鉴权循环。 */
export function buildEmbeddedAppPath(path: string, request: Request): string {
  const url = new URL(request.url);
  const target = new URL(path, url.origin);
  target.search = url.search;
  return `${target.pathname}${target.search}`;
}
