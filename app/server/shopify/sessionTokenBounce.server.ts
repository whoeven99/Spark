const SESSION_TOKEN_PATH = "/auth/session-token";
const SHOPIFY_RELOAD_PARAM = "shopify-reload";
const EMBEDDED_PARAMS = ["shop", "host", "embedded"] as const;

function isSessionTokenPath(pathname: string): boolean {
  return pathname.endsWith(SESSION_TOKEN_PATH);
}

function readReloadUrl(url: URL): URL | null {
  const raw = url.searchParams.get(SHOPIFY_RELOAD_PARAM);
  if (!raw) return null;

  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/**
 * Shopify Admin can surface the App Bridge bounce URL as
 * `/auth/session-token?shopify-reload=...` after billing approval while
 * dropping the outer `shop` / `host` / `embedded` params. The SDK bounce page
 * needs those params on the current request, so recover them from the encoded
 * app URL before `authenticate.admin()` renders the page.
 */
export function buildSessionTokenBounceParamRedirect(
  request: Request,
): string | null {
  const url = new URL(request.url);
  if (!isSessionTokenPath(url.pathname)) return null;

  const reloadUrl = readReloadUrl(url);
  if (!reloadUrl) return null;

  let changed = false;
  for (const key of EMBEDDED_PARAMS) {
    if (url.searchParams.get(key)) continue;

    const value =
      key === "embedded" ? "1" : reloadUrl.searchParams.get(key)?.trim();
    if (!value) continue;

    url.searchParams.set(key, value);
    changed = true;
  }

  if (!changed) return null;
  return `${url.pathname}${url.search}`;
}
