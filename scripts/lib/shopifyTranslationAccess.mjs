/**
 * 修复脚本用：解析 Shopify accessToken，并按 resourceId 读取现网译文。
 */
import { createClient } from "@libsql/client";
import { getEnv } from "./translationStorage.mjs";

function shopifyApiVersion() {
  return getEnv("SHOPIFY_API_VERSION", "2024-10");
}

let _tsfClient = null;

function normalizeShopName(input) {
  const trimmed = String(input ?? "")
    .trim()
    .toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes(".myshopify.com")) return trimmed;
  return `${trimmed}.myshopify.com`;
}

function resolveTsfTursoTarget() {
  const explicit = getEnv("TSF_TURSO_TARGET").toLowerCase();
  if (explicit === "prod" || explicit === "production") return "prod";
  if (explicit === "test" || explicit === "testing") return "test";

  const hasProd = getEnv("TSF_TURSO_PROD_DATABASE_URL").startsWith("libsql://");
  const hasTest = getEnv("TSF_TURSO_TEST_DATABASE_URL").startsWith("libsql://");
  if (hasProd && !hasTest) return "prod";
  if (hasTest && !hasProd) return "test";
  return "test";
}

function isTsfDbConfigured() {
  return Boolean(
    getEnv("TSF_TURSO_PROD_DATABASE_URL") || getEnv("TSF_TURSO_TEST_DATABASE_URL"),
  );
}

function getTsfDb() {
  if (_tsfClient) return _tsfClient;
  const target = resolveTsfTursoTarget();
  const url =
    target === "prod"
      ? getEnv("TSF_TURSO_PROD_DATABASE_URL")
      : getEnv("TSF_TURSO_TEST_DATABASE_URL");
  const authToken =
    target === "prod"
      ? getEnv("TSF_TURSO_PROD_AUTH_TOKEN")
      : getEnv("TSF_TURSO_TEST_AUTH_TOKEN");
  if (!url || !authToken) {
    throw new Error(`TSF Turso ${target} 未配置（需要 DATABASE_URL + AUTH_TOKEN）`);
  }
  _tsfClient = createClient({ url, authToken });
  return _tsfClient;
}

async function resolveTokenFromTsfSession(shopName) {
  if (!isTsfDbConfigured()) {
    throw new Error("TSF Turso 未配置，无法回退查询 Session");
  }
  const shop = normalizeShopName(shopName);
  if (!shop) throw new Error("商店名不能为空");

  const db = getTsfDb();
  const offline = await db.execute({
    sql: `SELECT accessToken, scope FROM Session
          WHERE shop = ? AND isOnline = 0
          ORDER BY expires DESC
          LIMIT 1`,
    args: [shop],
  });

  const row =
    offline.rows[0] ??
    (
      await db.execute({
        sql: `SELECT accessToken, scope FROM Session
              WHERE shop = ?
              ORDER BY expires DESC
              LIMIT 1`,
        args: [shop],
      })
    ).rows[0];

  if (!row) {
    throw new Error(`未找到商店 ${shop} 的 TSF Session`);
  }
  const accessToken = String(row.accessToken ?? "").trim();
  if (!accessToken) {
    throw new Error(`商店 ${shop} 的 TSF Session accessToken 为空`);
  }
  return accessToken;
}

/**
 * 优先 job.shopifyAccessToken，失败/缺失再查 TSF Session。
 * @returns {{ accessToken: string, source: "job"|"tsf-session" }}
 */
export async function resolveShopifyAccessToken(job) {
  const fromJob = String(job?.shopifyAccessToken ?? "").trim();
  if (fromJob) {
    return { accessToken: fromJob, source: "job" };
  }
  const token = await resolveTokenFromTsfSession(job?.shopName);
  return { accessToken: token, source: "tsf-session" };
}

async function shopifyGraphql(shopName, accessToken, query, variables) {
  const shop = normalizeShopName(shopName);
  const url = `https://${shop}/admin/api/${shopifyApiVersion()}/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify GraphQL error");
  }
  return payload.data;
}

const TRANSLATABLE_RESOURCE_BY_ID_QUERY = `
query RepairGetTranslatableResourceById($resourceId: ID!, $locale: String!) {
  translatableResource(resourceId: $resourceId) {
    resourceId
    translations(locale: $locale) {
      key
      value
      outdated
    }
  }
}`;

/**
 * 读取 Shopify 现网某 resource 在指定 locale 下的全部译文（key → value）。
 * @returns {Map<string, string>}
 */
export async function fetchShopifyResourceTranslations({
  shopName,
  accessToken,
  resourceId,
  locale,
}) {
  const data = await shopifyGraphql(shopName, accessToken, TRANSLATABLE_RESOURCE_BY_ID_QUERY, {
    resourceId,
    locale,
  });

  const rows = data?.translatableResource?.translations ?? [];
  const map = new Map();
  for (const row of rows) {
    if (!row?.key) continue;
    map.set(row.key, row.value ?? "");
  }
  return map;
}

/**
 * 带缓存的现网字段读取。
 * cache: Map<`${resourceId}::${locale}`, Promise<Map<string,string>> | Map>
 */
export async function getShopifyTranslatedValue({
  shopName,
  accessToken,
  resourceId,
  locale,
  key,
  cache,
}) {
  const cacheKey = `${resourceId}::${locale}`;
  let pending = cache?.get(cacheKey);
  if (!pending) {
    pending = fetchShopifyResourceTranslations({
      shopName,
      accessToken,
      resourceId,
      locale,
    });
    cache?.set(cacheKey, pending);
  }
  const map = await pending;
  if (!map.has(key)) return { found: false, value: null };
  return { found: true, value: map.get(key) ?? "" };
}
