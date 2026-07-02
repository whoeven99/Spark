import { getOfflineAccessTokenFromTsf } from "./tsfDb.js";

const LOG = "[shop-token]";

function normalizeEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * 解析 Shopify Admin API token：优先 job 快照；TSF 来源任务可回退 TSF Session。
 */
export async function getShopAccessToken(
  shop: string,
  legacyFallback?: string,
  preferLegacy = false,
): Promise<string> {
  const normalizedShop = shop.trim();
  if (!normalizedShop) {
    throw new Error(`${LOG} shop is required`);
  }

  if (preferLegacy) {
    const tsfToken = await getOfflineAccessTokenFromTsf(normalizedShop);
    if (tsfToken) return tsfToken;
  }

  const token = normalizeEnv(legacyFallback);
  if (!token) {
    throw new Error(`${LOG} no access token on job for shop=${normalizedShop}`);
  }
  return token;
}

export function invalidateShopAccessTokenCache(_shop: string): void {}

/** 仅测试用 */
export function resetShopAccessTokenStateForTests(): void {}

export function isTursoSessionConfigured(): boolean {
  return false;
}
