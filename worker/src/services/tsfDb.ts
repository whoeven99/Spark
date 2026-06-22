import { createClient, type Client } from "@libsql/client/web";

/**
 * 连接 TSF 自己的 Turso 库（与 worker 原有的 TURSO_*（Spark 库）相互独立）。
 * 翻译配置/词表/liquid 等数据迁到 TSF Prisma 后，worker 从这里读。
 *
 * 环境变量（在 Render worker 服务上配置）：
 *   TSF_TURSO_DATABASE_URL   libsql://xxx.turso.io
 *   TSF_TURSO_AUTH_TOKEN     eyJhbGci...
 */
let client: Client | null = null;

function normalizeEnv(value: string | undefined): string {
  let v = (value ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export function hasTsfDbCredentials(): boolean {
  const url = normalizeEnv(process.env.TSF_TURSO_DATABASE_URL);
  const authToken = normalizeEnv(process.env.TSF_TURSO_AUTH_TOKEN);
  return url.startsWith("libsql://") && Boolean(authToken);
}

export function getTsfDb(): Client {
  if (client) return client;
  const url = normalizeEnv(process.env.TSF_TURSO_DATABASE_URL);
  const authToken = normalizeEnv(process.env.TSF_TURSO_AUTH_TOKEN);
  if (!url.startsWith("libsql://") || !authToken) {
    throw new Error(
      "TSF Turso 未配置：请设置 TSF_TURSO_DATABASE_URL（libsql://...）与 TSF_TURSO_AUTH_TOKEN",
    );
  }
  client = createClient({ url, authToken });
  return client;
}

export type AutoTranslateShop = {
  shop: string;
  primaryLocale: string;
  targets: string[];
};

/** 自动扫描用：已迁移到 TSF 且开了自动翻译的店。 */
export async function listAutoTranslateShops(): Promise<AutoTranslateShop[]> {
  // 按语言精确取：已迁移店 + 该语言开了自动翻译（ShopTargetLocale）
  const rs = await getTsfDb().execute(
    `SELECT s.shop AS shop, s.primaryLocale AS primaryLocale, t.locale AS target
     FROM ShopTranslationSettings s
     JOIN ShopTargetLocale t ON t.shop = s.shop
     WHERE s.migratedToTsf = 1 AND t.autoTranslate = 1 AND t.status = 1`,
  );
  const byShop = new Map<string, AutoTranslateShop>();
  for (const r of rs.rows) {
    const shop = String(r.shop);
    const primaryLocale = String(r.primaryLocale);
    const target = String(r.target);
    const entry = byShop.get(shop) ?? { shop, primaryLocale, targets: [] };
    entry.targets.push(target);
    byShop.set(shop, entry);
  }
  return [...byShop.values()];
}

/**
 * 从 TSF 的 Session 表取该店的 offline accessToken（自动任务回写 Shopify 用）。
 * TSF 用 @shopify/shopify-app Prisma session 存储，offline session 的 isOnline=0。
 */
export async function getOfflineAccessTokenFromTsf(shop: string): Promise<string | null> {
  const rs = await getTsfDb().execute({
    sql: "SELECT accessToken FROM Session WHERE shop = ? AND isOnline = 0 AND accessToken IS NOT NULL LIMIT 1",
    args: [shop],
  });
  const token = rs.rows[0]?.accessToken;
  return token ? String(token) : null;
}

export type TsfGlossaryRow = {
  sourceText: string;
  targetText: string;
  rangeCode: string | null;
  caseSensitive: boolean;
};

/**
 * 从 TSF Turso 读该店适用于 target 的术语表。
 * 过滤口径与 Java GlossaryService.getGlossaryDoByShopName 一致：rangeCode == target 或 "ALL"。
 */
export async function loadGlossaryRowsFromTsf(
  shop: string,
  target: string,
): Promise<TsfGlossaryRow[]> {
  const rs = await getTsfDb().execute({
    sql: "SELECT sourceText, targetText, rangeCode, caseSensitive FROM Glossary WHERE shop = ? AND status = 1 AND (rangeCode = ? OR rangeCode = 'ALL' OR rangeCode IS NULL)",
    args: [shop, target],
  });
  return rs.rows.map((r) => ({
    sourceText: String(r.sourceText ?? ""),
    targetText: String(r.targetText ?? ""),
    rangeCode: r.rangeCode != null ? String(r.rangeCode) : null,
    caseSensitive: Number(r.caseSensitive) === 1,
  }));
}

