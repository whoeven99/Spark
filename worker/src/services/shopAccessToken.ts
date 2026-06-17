import { createClient, type Client } from "@libsql/client/web";

const LOG = "[shop-token]";
const CACHE_TTL_MS = 30_000;

type CacheEntry = { token: string; cachedAt: number };

const tokenCache = new Map<string, CacheEntry>();
let tursoClient: Client | null = null;

function normalizeEnv(value: string | undefined): string {
  return (value ?? "").trim();
}

function resolveTursoTarget(): "test" | "prod" {
  const explicit = normalizeEnv(process.env.TURSO_TARGET).toLowerCase();
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test" || explicit === "testing") return "test";
  const nodeEnv = normalizeEnv(process.env.NODE_ENV).toLowerCase();
  return nodeEnv === "production" || nodeEnv === "prod" ? "prod" : "test";
}

function readTursoCredentials(target: "test" | "prod"): { url: string; authToken: string } {
  if (target === "prod") {
    return {
      url: normalizeEnv(process.env.TURSO_PROD_DATABASE_URL),
      authToken: normalizeEnv(process.env.TURSO_PROD_AUTH_TOKEN),
    };
  }
  return {
    url: normalizeEnv(process.env.TURSO_TEST_DATABASE_URL),
    authToken: normalizeEnv(process.env.TURSO_TEST_AUTH_TOKEN),
  };
}

function getTursoClient(): Client | null {
  if (tursoClient) return tursoClient;
  const { url, authToken } = readTursoCredentials(resolveTursoTarget());
  if (!url.startsWith("libsql://") || !authToken) return null;
  tursoClient = createClient({ url, authToken });
  return tursoClient;
}

function isSessionTokenUsable(token: string, expiresRaw: unknown): boolean {
  if (!token) return false;
  if (expiresRaw == null || expiresRaw === "") return true;
  const expires = new Date(String(expiresRaw));
  return !Number.isNaN(expires.getTime()) && expires > new Date();
}

async function loadTokenFromSession(shop: string): Promise<string | null> {
  const client = getTursoClient();
  if (!client) return null;

  const result = await client.execute({
    sql: `SELECT accessToken, expires FROM Session WHERE shop = ? ORDER BY isOnline ASC, updatedAt DESC LIMIT 1`,
    args: [shop],
  });

  const row = result.rows[0];
  if (!row) return null;

  const token = normalizeEnv(String(row.accessToken ?? ""));
  if (!isSessionTokenUsable(token, row.expires)) return null;
  return token;
}

/**
 * 运行时从 Turso Session 读取最新 Shopify token（优先 offline session）。
 * Cosmos 里的 shopifyAccessToken 仅作 Turso 不可用时的兜底。
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

  // 外部来源任务（如 TsFrontend）：该 shop 的 Session 不在本服务的 Turso 里，
  // 直接用 job 快照里的 token，跳过 Turso 查询与共享缓存（避免命中其它 app 的 token）。
  if (preferLegacy) {
    const legacy = normalizeEnv(legacyFallback);
    if (legacy) return legacy;
  }

  const cached = tokenCache.get(normalizedShop);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.token;
  }

  const fromSession = await loadTokenFromSession(normalizedShop);
  if (fromSession) {
    tokenCache.set(normalizedShop, { token: fromSession, cachedAt: Date.now() });
    return fromSession;
  }

  const fallback = normalizeEnv(legacyFallback);
  if (fallback) {
    console.warn(
      `${LOG} Session miss/expired for ${normalizedShop} — using job snapshot (may 401)`,
    );
    return fallback;
  }

  throw new Error(
    `${LOG} no valid Session token for shop=${normalizedShop}; open the embedded app to re-authenticate`,
  );
}

export function invalidateShopAccessTokenCache(shop: string): void {
  tokenCache.delete(shop.trim());
}

/** 仅测试用 */
export function resetShopAccessTokenStateForTests(): void {
  tokenCache.clear();
  tursoClient = null;
}

export function isTursoSessionConfigured(): boolean {
  const { url, authToken } = readTursoCredentials(resolveTursoTarget());
  return url.startsWith("libsql://") && Boolean(authToken);
}
