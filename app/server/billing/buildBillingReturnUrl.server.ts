import { BillingError, BILLING_ERROR_CODE } from "./errors.server";

/** Shopify Billing API `returnUrl` 上限（字符数）。 */
export const SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH = 255;

/** 计费与订阅页路径（支付/购包批准后应回到此页）。 */
export const BILLING_PAGE_PATH = "/app/billing";

/** 根路径或 `/app` 兜底重定向时识别「来自计费结账」的 query 标记。 */
export const BILLING_RETURN_QUERY_FLAG = "billing_return";

const ADMIN_APP_IDENTIFIER_BY_API_KEY: Record<string, string> = {
  "940b967eda872dd81f9ffc283e29a013": "aiassistant-test",
};

const ADMIN_APP_IDENTIFIER_BY_APP_HOST: Record<string, string> = {
  "aiassistant-wi7b.onrender.com": "aiassistant-test",
};

export function isBillingReturnRequest(request: Request): boolean {
  return (
    new URL(request.url).searchParams.get(BILLING_RETURN_QUERY_FLAG) === "1"
  );
}

/** Shopify 嵌入式 Admin 的 `host` 参数（`base64("{shop}/admin")`）。 */
export function buildShopifyAdminHostParam(shop: string): string {
  const shopDomain = shop.includes(".") ? shop : `${shop}.myshopify.com`;
  return Buffer.from(`${shopDomain}/admin`, "utf-8").toString("base64");
}

function resolveHostParam(shop: string, incoming: URL): string {
  const fromRequest = incoming.searchParams.get("host");
  if (fromRequest) {
    return fromRequest;
  }
  return buildShopifyAdminHostParam(shop);
}

function resolveAppOrigin(request: Request): string {
  const configured = process.env.SHOPIFY_APP_URL?.trim();
  if (configured) {
    const withProtocol = configured.startsWith("http")
      ? configured
      : `https://${configured}`;
    return new URL(withProtocol).origin;
  }
  return new URL(request.url).origin;
}

function appIdentifierFromConfiguredAppUrl(): string | null {
  const configured = process.env.SHOPIFY_APP_URL?.trim();
  if (!configured) return null;

  try {
    const withProtocol = configured.startsWith("http")
      ? configured
      : `https://${configured}`;
    const host = new URL(withProtocol).hostname;
    return ADMIN_APP_IDENTIFIER_BY_APP_HOST[host] ?? null;
  } catch {
    return null;
  }
}

function appIdentifierFromApiKey(): string | null {
  const apiKey = process.env.SHOPIFY_API_KEY?.trim();
  return apiKey ? (ADMIN_APP_IDENTIFIER_BY_API_KEY[apiKey] ?? null) : null;
}

function shopifyAdminStoreHandle(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "");
}

function appIdentifierFromAdminUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.hostname !== "admin.shopify.com") return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const appsIndex = segments.indexOf("apps");
    const identifier = appsIndex >= 0 ? segments[appsIndex + 1] : undefined;
    return identifier ? decodeURIComponent(identifier) : null;
  } catch {
    return null;
  }
}

function resolveAdminAppIdentifier(request: Request): string | null {
  const fromReferer = appIdentifierFromAdminUrl(request.headers.get("referer"));
  if (fromReferer) return fromReferer;

  const configured =
    process.env.SHOPIFY_ADMIN_APP_HANDLE?.trim() ||
    process.env.SHOPIFY_APP_HANDLE?.trim() ||
    appIdentifierFromConfiguredAppUrl() ||
    appIdentifierFromApiKey() ||
    process.env.SHOPIFY_API_KEY?.trim();
  return configured || null;
}

function buildAdminEmbeddedBillingReturnUrl(
  path: string,
  request: Request,
  shop: string,
): string | null {
  const appIdentifier = resolveAdminAppIdentifier(request);
  if (!appIdentifier) return null;

  const url = new URL(
    `/store/${shopifyAdminStoreHandle(shop)}/apps/${encodeURIComponent(appIdentifier)}${path}`,
    "https://admin.shopify.com",
  );
  url.searchParams.set(BILLING_RETURN_QUERY_FLAG, "1");
  return url.toString();
}

function applyBillingReturnQuery(url: URL, shop: string, incoming: URL): void {
  url.searchParams.set("shop", shop);
  url.searchParams.set(BILLING_RETURN_QUERY_FLAG, "1");
  url.searchParams.set("embedded", "1");
  url.searchParams.set("host", resolveHostParam(shop, incoming));
}

/**
 * 构建计费确认后的 returnUrl。勿复制完整嵌入式 query（尤其 `id_token`），否则会超过 255 字符。
 * 使用 `SHOPIFY_APP_URL` 作为 origin（与 Partner 配置一致）；保留 `shop` + `host` + `embedded=1`。
 */
export function buildBillingReturnUrl(
  path: string,
  request: Request,
  shop: string,
): string {
  const adminReturnUrl = buildAdminEmbeddedBillingReturnUrl(path, request, shop);
  if (
    adminReturnUrl &&
    adminReturnUrl.length <= SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH
  ) {
    return adminReturnUrl;
  }

  const origin = resolveAppOrigin(request);
  const incoming = new URL(request.url);

  const url = new URL(path, origin);
  applyBillingReturnQuery(url, shop, incoming);

  const returnUrl = url.toString();
  if (returnUrl.length <= SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH) {
    return returnUrl;
  }

  // 仍超长时去掉 billing_return（host 必须保留，否则回跳会进登录页）
  const minimal = new URL(path, origin);
  minimal.searchParams.set("shop", shop);
  minimal.searchParams.set("embedded", "1");
  minimal.searchParams.set("host", resolveHostParam(shop, incoming));
  const minimalUrl = minimal.toString();
  if (minimalUrl.length <= SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH) {
    return minimalUrl;
  }

  throw new BillingError(
    `计费 returnUrl 超过 Shopify 上限（${SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH} 字符）`,
    BILLING_ERROR_CODE.SHOPIFY_BILLING_FAILED,
    400,
    { returnUrlLength: minimalUrl.length },
  );
}
