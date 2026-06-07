export type NavItemKey =
  | "chat"
  | "diagnosis"
  | "translation-v4"
  | "product-improve"
  | "image-studio"
  | "order-monitor"
  | "billing";

const ALL_NAV_ITEMS: readonly NavItemKey[] = [
  "chat",
  "diagnosis",
  "translation-v4",
  "product-improve",
  "image-studio",
  "order-monitor",
  "billing",
] as const;

export function getAppNavItems(): readonly NavItemKey[] {
  return ALL_NAV_ITEMS;
}

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
