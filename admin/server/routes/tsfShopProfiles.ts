import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getTsfDb } from "../lib/tsfDb.js";
import { getShopScanJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { getRedis } from "../lib/redis.js";
import { requireOwner } from "../middleware/auth.js";
import {
  buildTsfShopProfilePromptBlock,
  loadTsfShopProfileArtifacts,
  type TsfProfileStrategy,
} from "../lib/tsfShopProfileArtifacts.js";

export const tsfShopProfilesRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SHOP_SCAN_HINT_KEY = "tsf:shop_scan:hints";

type ProfileState = "all" | "with" | "without";

type ShopScanJobRecord = {
  id: string;
  shopName: string;
  trigger: "install" | "scheduled" | "manual" | "admin";
  status: "CREATED" | "QUEUED" | "SCANNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  stages: Record<"contentSize" | "profile" | "coverage" | "glossary", "PENDING" | "DONE" | "SKIPPED" | "FAILED">;
  blobPrefix: string;
  summary: {
    totalItems?: number;
    totalChars?: number;
    moduleStats?: Record<string, { items: number; chars: number }>;
    coverage?: Array<{
      locale: string;
      published: boolean;
      translated: number;
      total: number;
      percent: number | null;
    }>;
    glossaryCount?: number;
    profileStrategy?: TsfProfileStrategy | null;
    glossarySuggestions?: Array<{ locale: string; source: string; target: string }>;
  };
  claimedBy: string | null;
  claimedAt: string | null;
  lastHeartbeat: string | null;
  attempts: number;
  errorMessage: string | null;
  errorStage: string | null;
  createdAt: string;
  updatedAt: string;
};

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
    SELECT shop FROM ShopProfile WHERE shop IS NOT NULL AND trim(shop) <> ''
  )
`;

function profileState(value: unknown): ProfileState {
  return value === "with" || value === "without" ? value : "all";
}

function buildScanId(shop: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${shop}-${stamp}-${randomUUID().slice(0, 8)}`;
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
    const shop = String(req.params.shop).trim();
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
    const profile = normalizeProfileRow(row as Record<string, unknown>);
    let scan: ShopScanJobRecord | null = null;
    let scanNote: string | null = null;

    if (isCosmosConfigured()) {
      try {
        const { resources } = await getShopScanJobsContainer().items
          .query<ShopScanJobRecord>(
            {
              query: "SELECT * FROM c WHERE c.shopName = @shop ORDER BY c.createdAt DESC OFFSET 0 LIMIT 1",
              parameters: [{ name: "@shop", value: shop }],
            },
            { partitionKey: shop },
          )
          .fetchAll();
        scan = resources[0] ?? null;
      } catch (error) {
        scanNote = error instanceof Error ? error.message : String(error);
      }
    } else {
      scanNote = "Cosmos 未配置";
    }

    const artifacts = scan
      ? await loadTsfShopProfileArtifacts(scan.blobPrefix, scan.summary)
      : {
          strategy: null,
          glossarySuggestions: [],
          understanding: null,
          markets: [],
          signals: null,
          facts: null,
          themeTexts: [],
          source: "none" as const,
        };

    res.json({
      profile,
      scan,
      promptBlock: buildTsfShopProfilePromptBlock(profile.hasProfile ? profile : null),
      ...artifacts,
      scanNote,
    });
  } catch (err) {
    console.error("[tsf/shop-profiles/detail]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Owner 手动触发指定商店画像扫描。
 * 这里只创建 TSF Worker 能消费的 Cosmos 任务并 best-effort 推 Redis hint；
 * Shopify access token 由 Worker 自己从 TSF Turso 的 offline Session 读取。
 */
tsfShopProfilesRouter.post("/:shop/scan", requireOwner, async (req, res) => {
  try {
    const shop = String(req.params.shop).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      res.status(400).json({ error: "商店域名格式无效" });
      return;
    }

    const db = getTsfDb();
    const sessionResult = await db.execute({
      sql: `SELECT 1 AS available
            FROM Session
            WHERE lower(shop) = lower(?)
              AND isOnline = 0
              AND accessToken IS NOT NULL
              AND trim(accessToken) <> ''
            LIMIT 1`,
      args: [shop],
    });
    if (!sessionResult.rows[0]) {
      res.status(409).json({ error: "该商店没有可用的 TSF offline Session，无法扫描 Shopify 数据" });
      return;
    }

    const container = getShopScanJobsContainer();
    const { resources: activeScans } = await container.items
      .query<{ id: string; status: string; createdAt: string }>(
        {
          query: `SELECT TOP 1 c.id, c.status, c.createdAt
                  FROM c
                  WHERE c.shopName = @shop
                    AND c.status IN ('CREATED', 'QUEUED', 'SCANNING')
                  ORDER BY c.createdAt DESC`,
          parameters: [{ name: "@shop", value: shop }],
        },
        { partitionKey: shop },
      )
      .fetchAll();
    if (activeScans[0]) {
      res.status(409).json({
        error: `该商店已有进行中的扫描（${activeScans[0].status}）`,
        activeScan: activeScans[0],
      });
      return;
    }

    const scanId = buildScanId(shop);
    const now = new Date().toISOString();
    await container.items.upsert({
      id: scanId,
      shopName: shop,
      trigger: "manual",
      status: "CREATED",
      stages: {
        contentSize: "PENDING",
        profile: "PENDING",
        coverage: "PENDING",
        glossary: "PENDING",
      },
      blobPrefix: `shop-profile/${shop}`,
      summary: {},
      claimedBy: null,
      claimedAt: null,
      lastHeartbeat: null,
      attempts: 0,
      errorMessage: null,
      errorStage: null,
      createdAt: now,
      updatedAt: now,
    });

    let hintPushed = false;
    const redis = getRedis();
    if (redis) {
      try {
        await redis.lpush(SHOP_SCAN_HINT_KEY, JSON.stringify({ scanId, shopName: shop }));
        hintPushed = true;
      } catch (error) {
        console.warn(
          `[tsf/shop-profiles/scan] Redis hint failed scan=${scanId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    res.status(202).json({
      enqueued: true,
      scanId,
      status: "CREATED",
      hintPushed,
      note: hintPushed ? null : "Redis hint 未发送，Worker 将通过 Cosmos 轮询领取任务",
    });
  } catch (err) {
    console.error("[tsf/shop-profiles/scan]", err);
    res.status(500).json({ error: String(err) });
  }
});
