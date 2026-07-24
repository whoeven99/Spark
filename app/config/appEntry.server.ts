/**
 * 一级目的地（新信息架构，docs 见迁移方案 PR1）。
 * 旧的 per-tool 入口（product-improve / image-studio / order-monitor 等）已收敛进
 * today / studio / settings 三个目的地，导航统一为 5 项。
 */
export type NavItemKey = "ask" | "today" | "studio" | "tasks" | "settings";

type AppShellConfig = {
  home: string;
  nav: readonly NavItemKey[];
};

const DEFAULT_APP_SHELL_CONFIG = {
  home: "/app",
  nav: ["ask", "today", "studio", "tasks", "settings"],
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
