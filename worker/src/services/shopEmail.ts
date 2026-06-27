import { getShopAccessToken, invalidateShopAccessTokenCache } from "./shopAccessToken.js";
import { buildShopifyAdminGraphqlUrl } from "./shopifyAdminApiVersion.js";
import { maskEmail } from "./workerEmail.js";

const LOG = "[shopEmail]";
const CACHE_TTL_MS = 60 * 60 * 1000;

function logDetail(phase: string, payload: Record<string, unknown>): void {
  console.info(`${LOG} ${phase} ${JSON.stringify(payload)}`);
}

const SHOP_EMAIL_QUERY = `#graphql
  query ShopContactEmail {
    shop {
      email
      contactEmail
    }
  }
`;

type CacheEntry = { email: string | null; cachedAt: number };
const emailCache = new Map<string, CacheEntry>();

export type FetchShopEmailOptions = {
  legacyToken?: string;
  /** 外部来源任务（TsFrontend / 自动任务）：直接用 job 快照 token */
  preferLegacyToken?: boolean;
};

function pickShopEmail(shop: {
  email?: string | null;
  contactEmail?: string | null;
} | null | undefined): string | null {
  return shop?.email?.trim() || shop?.contactEmail?.trim() || null;
}

async function shopifyGraphqlOnce(
  shop: string,
  accessToken: string,
): Promise<Response> {
  const url = buildShopifyAdminGraphqlUrl(shop);
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: SHOP_EMAIL_QUERY }),
  });
}

/**
 * 从 Shopify Admin GraphQL 拉取店铺最新联系邮箱（优先 shop.email，其次 contactEmail）。
 * 对齐主应用 fetchShopBasicInfo / api.support resolveShopEmail 口径。
 */
export async function fetchShopEmail(
  shop: string,
  options: FetchShopEmailOptions = {},
): Promise<string | null> {
  const normalizedShop = shop.trim();
  if (!normalizedShop) {
    logDetail("fetch-skipped", { reason: "empty_shop" });
    return null;
  }

  const cached = emailCache.get(normalizedShop);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    logDetail("cache-hit", {
      shop: normalizedShop,
      email: cached.email ? maskEmail(cached.email) : null,
      cacheAgeMs: Date.now() - cached.cachedAt,
    });
    return cached.email;
  }

  logDetail("fetch-start", {
    shop: normalizedShop,
    preferLegacyToken: options.preferLegacyToken ?? false,
    hasLegacyToken: Boolean(options.legacyToken?.trim()),
  });

  const legacyToken = options.legacyToken?.trim() ?? "";
  let email: string | null = null;
  const startedAt = Date.now();

  try {
    let tokenRetried = false;
    while (true) {
      const accessToken = await getShopAccessToken(
        normalizedShop,
        legacyToken,
        options.preferLegacyToken ?? false,
      );
      logDetail("graphql-request", {
        shop: normalizedShop,
        tokenRetried,
        tokenLen: accessToken.length,
      });
      const resp = await shopifyGraphqlOnce(normalizedShop, accessToken);

      if (resp.status === 401 && !tokenRetried) {
        logDetail("graphql-401-retry", { shop: normalizedShop });
        invalidateShopAccessTokenCache(normalizedShop);
        tokenRetried = true;
        continue;
      }

      if (!resp.ok) {
        logDetail("graphql-http-error", {
          shop: normalizedShop,
          status: resp.status,
          elapsedMs: Date.now() - startedAt,
        });
        break;
      }

      const json = (await resp.json()) as {
        data?: { shop?: { email?: string | null; contactEmail?: string | null } };
        errors?: Array<{ message?: string }>;
      };

      if (json.errors?.length) {
        logDetail("graphql-errors", {
          shop: normalizedShop,
          errors: json.errors.map((e) => e.message).filter(Boolean),
          elapsedMs: Date.now() - startedAt,
        });
        break;
      }

      const shopEmail = json.data?.shop?.email?.trim() || null;
      const contactEmail = json.data?.shop?.contactEmail?.trim() || null;
      email = pickShopEmail(json.data?.shop);
      logDetail("graphql-success", {
        shop: normalizedShop,
        hasShopEmail: Boolean(shopEmail),
        hasContactEmail: Boolean(contactEmail),
        picked: email ? maskEmail(email) : null,
        pickedFrom: shopEmail ? "shop.email" : contactEmail ? "shop.contactEmail" : "none",
        elapsedMs: Date.now() - startedAt,
      });
      break;
    }
  } catch (e) {
    logDetail("fetch-failed", {
      shop: normalizedShop,
      elapsedMs: Date.now() - startedAt,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    console.warn(`${LOG} fetch failed shop=${normalizedShop}`, e);
  }

  emailCache.set(normalizedShop, { email, cachedAt: Date.now() });
  logDetail("fetch-done", {
    shop: normalizedShop,
    email: email ? maskEmail(email) : null,
    cached: true,
  });
  return email;
}

/** 仅测试用 */
export function resetShopEmailCacheForTests(): void {
  emailCache.clear();
}
