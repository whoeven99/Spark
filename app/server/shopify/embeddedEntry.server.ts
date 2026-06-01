/** 从 Shopify 嵌入式 `host` 参数解析店铺域名（`base64("{shop}/admin")`）。 */
export function shopDomainFromHostParam(host: string): string | null {
  const trimmed = host.trim();
  if (!trimmed) return null;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
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

/** 解析嵌入式入口应跳转的 shop 查询值；无法解析时返回 null。 */
export function resolveShopQueryFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim();
  if (shop) return shop;

  const host = url.searchParams.get("host")?.trim();
  if (!host) return null;
  return shopDomainFromHostParam(host);
}
