import { getShopAccessToken, invalidateShopAccessTokenCache } from "./shopAccessToken.js";

const LOG = "[shopEmail]";
const CACHE_TTL_MS = 60 * 60 * 1000;

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
  const url = `https://${shop}/admin/api/2024-01/graphql.json`;
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
  if (!normalizedShop) return null;

  const cached = emailCache.get(normalizedShop);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.email;
  }

  const legacyToken = options.legacyToken?.trim() ?? "";
  let email: string | null = null;

  try {
    let tokenRetried = false;
    while (true) {
      const accessToken = await getShopAccessToken(
        normalizedShop,
        legacyToken,
        options.preferLegacyToken ?? false,
      );
      const resp = await shopifyGraphqlOnce(normalizedShop, accessToken);

      if (resp.status === 401 && !tokenRetried) {
        invalidateShopAccessTokenCache(normalizedShop);
        tokenRetried = true;
        continue;
      }

      if (!resp.ok) {
        console.warn(`${LOG} GraphQL HTTP ${resp.status} shop=${normalizedShop}`);
        break;
      }

      const json = (await resp.json()) as {
        data?: { shop?: { email?: string | null; contactEmail?: string | null } };
        errors?: Array<{ message?: string }>;
      };

      if (json.errors?.length) {
        console.warn(
          `${LOG} GraphQL errors shop=${normalizedShop}:`,
          json.errors.map((e) => e.message).filter(Boolean).join("; "),
        );
        break;
      }

      email = pickShopEmail(json.data?.shop);
      break;
    }
  } catch (e) {
    console.warn(`${LOG} fetch failed shop=${normalizedShop}`, e);
  }

  emailCache.set(normalizedShop, { email, cachedAt: Date.now() });
  return email;
}

/** 仅测试用 */
export function resetShopEmailCacheForTests(): void {
  emailCache.clear();
}
