import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfShopProfilesRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

type ProfileState = "all" | "with" | "without";

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseKeywords(value: unknown): string[] {
  if (value == null) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeProfileRow(row: Record<string, unknown>) {
  const hasProfile = Number(row.hasProfile ?? 0) > 0;
  return {
    shop: String(row.shop ?? ""),
    installed: Number(row.installed ?? 0) > 0,
    hasProfile,
    shopName: hasProfile ? stringOrNull(row.shopName) : null,
    primaryLocale: hasProfile ? stringOrNull(row.primaryLocale) : null,
    industry: hasProfile ? stringOrNull(row.industry) : null,
    keywords: hasProfile ? parseKeywords(row.keywords) : [],
    description: hasProfile ? stringOrNull(row.description) : null,
    brandTone: hasProfile ? stringOrNull(row.brandTone) : null,
    aiModel: hasProfile ? stringOrNull(row.aiModel) : null,
    lastScanId: hasProfile ? stringOrNull(row.lastScanId) : null,
    lastScannedAt: hasProfile ? stringOrNull(row.lastScannedAt) : null,
    createdAt: hasProfile ? stringOrNull(row.createdAt) : null,
    updatedAt: hasProfile ? stringOrNull(row.updatedAt) : null,
  };
}

const KNOWN_SHOPS_CTE = `
  WITH known_shops AS (
    SELECT DISTINCT shop FROM Session WHERE shop IS NOT NULL AND trim(shop) <> ''
    UNION
    SELECT shop FROM Account WHERE shop IS NOT NULL AND trim(shop) <> ''
    UNION
    SELECT shop FROM ShopBillingBinding WHERE shop IS NOT NULL AND trim(shop) <> ''
    UNION
    SELECT shop FROM ShopProfile WHERE shop IS NOT NULL AND trim(shop) <> ''
  )
`;

function profileState(value: unknown): ProfileState {
  return value === "with" || value === "without" ? value : "all";
}

/** TSF 商店画像总览：列出已知商店，并标记是否存在当前生效的 ShopProfile。 */
tsfShopProfilesRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
    const search = String(req.query.search ?? "").trim().slice(0, 200);
    const state = profileState(req.query.profileState);
    const page = clampPositiveInt(req.query.page, 1, 1_000_000);
    const pageSize = clampPositiveInt(req.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const conditions: string[] = [];
    const args: Array<string | number> = [];
    if (search) {
      conditions.push("(k.shop LIKE ? OR p.shopName LIKE ? OR p.industry LIKE ?)");
      const pattern = `%${search}%`;
      args.push(pattern, pattern, pattern);
    }
    if (state === "with") conditions.push("p.shop IS NOT NULL");
    if (state === "without") conditions.push("p.shop IS NULL");
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [statsResult, countResult, rowsResult] = await Promise.all([
      db.execute(`${KNOWN_SHOPS_CTE}
        SELECT
          COUNT(*) AS totalShops,
          SUM(CASE WHEN p.shop IS NOT NULL THEN 1 ELSE 0 END) AS profileShops,
          SUM(CASE WHEN p.shop IS NULL THEN 1 ELSE 0 END) AS missingProfileShops,
          SUM(CASE WHEN EXISTS (SELECT 1 FROM Session s WHERE s.shop = k.shop) THEN 1 ELSE 0 END) AS installedShops
        FROM known_shops k
        LEFT JOIN ShopProfile p ON p.shop = k.shop
      `),
      db.execute({
        sql: `${KNOWN_SHOPS_CTE}
          SELECT COUNT(*) AS total
          FROM known_shops k
          LEFT JOIN ShopProfile p ON p.shop = k.shop
          ${where}
        `,
        args,
      }),
      db.execute({
        sql: `${KNOWN_SHOPS_CTE}
          SELECT
            k.shop,
            CASE WHEN EXISTS (SELECT 1 FROM Session s WHERE s.shop = k.shop) THEN 1 ELSE 0 END AS installed,
            CASE WHEN p.shop IS NOT NULL THEN 1 ELSE 0 END AS hasProfile,
            p.shopName,
            p.primaryLocale,
            p.industry,
            p.keywords,
            p.description,
            p.brandTone,
            p.aiModel,
            p.lastScanId,
            p.lastScannedAt,
            p.createdAt,
            p.updatedAt
          FROM known_shops k
          LEFT JOIN ShopProfile p ON p.shop = k.shop
          ${where}
          ORDER BY
            CASE WHEN p.shop IS NOT NULL THEN 0 ELSE 1 END,
            COALESCE(p.lastScannedAt, p.updatedAt, p.createdAt) DESC,
            k.shop ASC
          LIMIT ? OFFSET ?
        `,
        args: [...args, pageSize, (page - 1) * pageSize],
      }),
    ]);

    const stats = statsResult.rows[0] ?? {};
    res.json({
      stats: {
        totalShops: Number(stats.totalShops ?? 0),
        profileShops: Number(stats.profileShops ?? 0),
        missingProfileShops: Number(stats.missingProfileShops ?? 0),
        installedShops: Number(stats.installedShops ?? 0),
      },
      profiles: rowsResult.rows.map((row) => normalizeProfileRow(row as Record<string, unknown>)),
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
    });
  } catch (err) {
    console.error("[tsf/shop-profiles]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 按 myshopify 域名读取单店当前生效画像；已知但无画像时返回 hasProfile=false。 */
tsfShopProfilesRouter.get("/:shop", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = req.params.shop.trim();
    const result = await db.execute({
      sql: `${KNOWN_SHOPS_CTE}
        SELECT
          k.shop,
          CASE WHEN EXISTS (SELECT 1 FROM Session s WHERE s.shop = k.shop) THEN 1 ELSE 0 END AS installed,
          CASE WHEN p.shop IS NOT NULL THEN 1 ELSE 0 END AS hasProfile,
          p.shopName,
          p.primaryLocale,
          p.industry,
          p.keywords,
          p.description,
          p.brandTone,
          p.aiModel,
          p.lastScanId,
          p.lastScannedAt,
          p.createdAt,
          p.updatedAt
        FROM known_shops k
        LEFT JOIN ShopProfile p ON p.shop = k.shop
        WHERE k.shop = ?
        LIMIT 1
      `,
      args: [shop],
    });

    const row = result.rows[0];
    if (!row) {
      res.status(404).json({ error: "未找到该商店" });
      return;
    }
    res.json({ profile: normalizeProfileRow(row as Record<string, unknown>) });
  } catch (err) {
    console.error("[tsf/shop-profiles/detail]", err);
    res.status(500).json({ error: String(err) });
  }
});
