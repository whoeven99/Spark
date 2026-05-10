/** 翻译相关 API 路由共用的店铺域名规范化与跨店防护 */

export function normalizeShopDomain(value: string): string {
  return value.trim().toLowerCase();
}

export function effectiveShopFromQuery(
  shopNameParam: string | null | undefined,
  sessionShop: string,
): string {
  return shopNameParam?.trim() || sessionShop;
}

/**
 * URL 中若显式传入 shopName，必须与当前 session 店铺一致，否则返回 403 JSON。
 * 未传 shopName 时返回 null（由调用方使用 session.shop）。
 */
export function forbiddenIfShopMismatch(
  shopNameParam: string | null | undefined,
  sessionShop: string,
  errorMsg: string,
): Response | null {
  const trimmed = shopNameParam?.trim();
  if (!trimmed) return null;
  if (normalizeShopDomain(trimmed) !== normalizeShopDomain(sessionShop)) {
    return Response.json(
      { success: false, errorCode: 403, errorMsg, response: null },
      { status: 403 },
    );
  }
  return null;
}
