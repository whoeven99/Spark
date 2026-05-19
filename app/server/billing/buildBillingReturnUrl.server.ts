import { BillingError, BILLING_ERROR_CODE } from "./errors.server";

/** Shopify Billing API `returnUrl` 上限（字符数）。 */
export const SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH = 255;

/**
 * 构建计费确认后的 returnUrl。勿复制完整嵌入式 query（尤其 `id_token`），否则会超过 255 字符。
 * 保留 `shop` + `host` 即可在批准后回到嵌入式 Admin；会话由 cookie / OAuth 恢复。
 */
export function buildBillingReturnUrl(
  path: string,
  request: Request,
  shop: string,
): string {
  const origin = new URL(request.url).origin;
  const incoming = new URL(request.url);

  const url = new URL(path, origin);
  url.searchParams.set("shop", shop);

  const host = incoming.searchParams.get("host");
  if (host) {
    url.searchParams.set("host", host);
  }

  const returnUrl = url.toString();
  if (returnUrl.length <= SHOPIFY_BILLING_RETURN_URL_MAX_LENGTH) {
    return returnUrl;
  }

  // host 异常过长时仅保留 shop（仍须满足 Shopify 上限）
  const minimal = new URL(path, origin);
  minimal.searchParams.set("shop", shop);
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
