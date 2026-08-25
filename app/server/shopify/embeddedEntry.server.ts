/** 从 Shopify 嵌入式 `host` 参数解析店铺域名（`base64("{shop}/admin")`）。 */
export function shopDomainFromHostParam(host: string): string | null {
  const trimmed = host.trim();
  if (!trimmed) return null;
  try {
    // URLSearchParams 会将 + 解释为空格，需要还原
    const normalized = trimmed.replace(/ /g, "+");
    const decoded = Buffer.from(normalized, "base64").toString("utf-8");
    const slash = decoded.indexOf("/");
    const domain = (slash >= 0 ? decoded.slice(0, slash) : decoded).trim();
    if (!domain || !/^[a-z0-9][a-z0-9.-]*$/i.test(domain)) return null;
    return domain;
  } catch {
    return null;
  }
}

/** 是否为从 Shopify Admin 嵌入式 iframe 打开应用的请求。 */
export function isEmbeddedAdminEntry(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.get("embedded") === "1") return true;
  if (url.searchParams.get("id_token")) return true;
  if (url.searchParams.get("host")) return true;
  if (url.searchParams.get("shop")) return true;
  return false;
}

/**
 * Admin 点应用名或侧栏导航时，iframe 常整页载入目标路径并丢掉 shop/host。
 * 只识别 document/iframe 导航；API / React Router data fetch（dest=empty）必须排除，
 * 否则会把带 session token 的接口请求 302 成 HTML。
 */
export function shouldRecoverEmbeddedHome(request: Request): boolean {
  const dest = request.headers.get("sec-fetch-dest")?.toLowerCase();
  if (dest === "iframe") return true;
  if (dest && dest !== "document") return false;

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).hostname === "admin.shopify.com";
  } catch {
    return false;
  }
}

/** 无 shop/host 时给当前路径补上 `embedded=1`，由 authenticate.admin 做 session token bounce。 */
export function buildEmbeddedHomeRecoveryPath(
  home: string,
  request: Request,
): string {
  const target = new URL(home, new URL(request.url).origin);
  target.search = new URL(request.url).search;
  if (target.searchParams.get("embedded") !== "1") {
    target.searchParams.set("embedded", "1");
  }
  return `${target.pathname}${target.search}`;
}

/** 解析嵌入式入口应跳转的 shop 查询值；无法解析时返回 null。 */
export function resolveShopQueryFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim();
  if (shop) return shop;

  const host = url.searchParams.get("host")?.trim();
  if (!host) return null;
  return shopDomainFromHostParam(host);
}
