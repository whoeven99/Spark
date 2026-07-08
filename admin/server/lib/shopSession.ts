import { getTsfDb, isTsfDbConfigured } from "./tsfDb.js";

export function normalizeShopName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes(".myshopify.com")) return trimmed;
  return `${trimmed}.myshopify.com`;
}

export type ShopSessionInfo = {
  shop: string;
  accessToken: string;
  scope: string | null;
};

/**
 * 从 TSF Turso Session 表解析商店 accessToken（翻译 App OAuth 写入）。
 */
export async function resolveShopAccessToken(shopName: string): Promise<ShopSessionInfo> {
  if (!isTsfDbConfigured()) {
    throw new Error("TSF Turso 未配置，无法查询 Session");
  }

  const shop = normalizeShopName(shopName);
  if (!shop) {
    throw new Error("商店名不能为空");
  }

  const db = getTsfDb();

  const offline = await db.execute({
    sql: `SELECT accessToken, scope FROM Session
          WHERE shop = ? AND isOnline = 0
          ORDER BY expires DESC
          LIMIT 1`,
    args: [shop],
  });

  const row = offline.rows[0] ?? (
    await db.execute({
      sql: `SELECT accessToken, scope FROM Session
            WHERE shop = ?
            ORDER BY expires DESC
            LIMIT 1`,
      args: [shop],
    })
  ).rows[0];

  if (!row) {
    throw new Error(`未找到商店 ${shop} 的 Session，请确认店铺已安装翻译 App`);
  }

  const accessToken = String(row.accessToken ?? "").trim();
  if (!accessToken) {
    throw new Error(`商店 ${shop} 的 accessToken 为空`);
  }

  return {
    shop,
    accessToken,
    scope: row.scope != null ? String(row.scope) : null,
  };
}
