import { Router } from "express";
import { randomUUID } from "node:crypto";
import { getTsfDb, isTsfDbConfigured } from "../lib/tsfDb.js";
import { getShopScanJobsContainer, isCosmosConfigured } from "../lib/cosmos.js";
import { getRedis } from "../lib/redis.js";
import { requireOwner } from "../middleware/auth.js";

export const tsfLanguageCoverageRouter = Router();

const SHOP_SCAN_HINT_KEY = "tsf:shop_scan:hints";

const SNAPSHOT_TTL_MS = 60_000;

export type CoverageBucket = "all" | "low" | "mid" | "high" | "missing";
export type AutoTranslateFilter = "all" | "on" | "off";

export type LocaleCoverage = {
  locale: string;
  translated: number;
  total: number;
  percent: number | null;
  updatedAt: string | null;
  cacheMissing: boolean;
  autoTranslate: boolean;
};

export type ShopLanguageCoverage = {
  shop: string;
  /** 店级：任一目标语言开启自动翻译即为 true。 */
  autoTranslate: boolean;
  /** 开启自动翻译的目标语言数。 */
  autoTranslateLocaleCount: number;
  cacheMissing: boolean;
  localeCount: number;
  translated: number;
  total: number;
  overallPercent: number | null;
  lowestLocale: { locale: string; percent: number } | null;
  updatedAt: string | null;
  locales: LocaleCoverage[];
};

type TursoLocaleRow = {
  locale: string;
  autoTranslate: boolean;
  translated: number;
  total: number;
  percent: number | null;
  updatedAt: string | null;
  cacheMissing: boolean;
};

type TursoShopBase = {
  shop: string;
  locales: TursoLocaleRow[];
};

type Snapshot = {
  at: number;
  shops: ShopLanguageCoverage[];
  /** 兼容旧字段：现为有 coverageUpdatedAt 的 (shop,locale) 数 */
  redisKeyCount: number;
  tursoShopCount: number;
  tursoLocaleCount: number;
};

let snapshotCache: Snapshot | null = null;
let snapshotInflight: Promise<Snapshot> | null = null;

function clearSnapshotCache(): void {
  snapshotCache = null;
  snapshotInflight = null;
}

function normalizeShop(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes(".myshopify.com")) return trimmed;
  return `${trimmed}.myshopify.com`;
}

function buildScanId(shop: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${shop}-${stamp}-${randomUUID().slice(0, 8)}`;
}

function ratioPercent(translated: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((translated / total) * 100));
}

function asBool(autoRaw: unknown): boolean {
  return (
    autoRaw === 1 ||
    autoRaw === "1" ||
    String(autoRaw).toLowerCase() === "true"
  );
}

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (!s) return null;
  const ts = Date.parse(s);
  if (!Number.isFinite(ts)) return s;
  return new Date(ts).toISOString();
}

function mapLocaleRow(row: Record<string, unknown>): TursoLocaleRow | null {
  const locale = String(row.locale ?? "").trim();
  if (!locale) return null;
  const updatedAt = asIso(row.coverageUpdatedAt);
  const translated = Number(row.coverageTranslated ?? 0) || 0;
  const total = Number(row.coverageTotal ?? 0) || 0;
  const percentRaw = row.coveragePercent;
  const percent =
    updatedAt == null
      ? null
      : typeof percentRaw === "number"
        ? percentRaw
        : percentRaw != null && String(percentRaw).trim() !== ""
          ? Number(percentRaw)
          : ratioPercent(translated, total);
  return {
    locale,
    autoTranslate: asBool(row.autoTranslate),
    translated,
    total,
    percent: percent != null && Number.isFinite(percent) ? percent : null,
    updatedAt,
    cacheMissing: updatedAt == null,
  };
}

async function listTursoShopsWithLocales(): Promise<TursoShopBase[]> {
  if (!isTsfDbConfigured()) {
    throw new Error("TSF Turso not configured");
  }
  const db = getTsfDb();
  const [accounts, locales] = await Promise.all([
    db.execute(
      `SELECT shop FROM Account WHERE deletedAt IS NULL ORDER BY shop ASC`,
    ),
    db.execute(
      `SELECT shop, locale, autoTranslate,
              coverageTranslated, coverageTotal, coveragePercent, coverageUpdatedAt
       FROM ShopTargetLocale
       ORDER BY shop ASC, locale ASC`,
    ),
  ]);

  const localeByShop = new Map<string, TursoLocaleRow[]>();
  for (const row of locales.rows) {
    const shop = String(row.shop ?? "").trim();
    if (!shop) continue;
    const mapped = mapLocaleRow(row as Record<string, unknown>);
    if (!mapped) continue;
    const list = localeByShop.get(shop) ?? [];
    list.push(mapped);
    localeByShop.set(shop, list);
  }

  return accounts.rows
    .map((row) => String(row.shop ?? "").trim())
    .filter(Boolean)
    .map((shop) => ({
      shop,
      locales: localeByShop.get(shop) ?? [],
    }));
}

function buildShopRow(base: TursoShopBase): ShopLanguageCoverage {
  const sorted = [...base.locales]
    .map(
      (loc): LocaleCoverage => ({
        locale: loc.locale,
        translated: loc.translated,
        total: loc.total,
        percent: loc.percent,
        updatedAt: loc.updatedAt,
        cacheMissing: loc.cacheMissing,
        autoTranslate: loc.autoTranslate,
      }),
    )
    .sort((a, b) => a.locale.localeCompare(b.locale, "en"));

  const withCache = sorted.filter((row) => !row.cacheMissing);
  const translated = withCache.reduce((sum, row) => sum + row.translated, 0);
  const total = withCache.reduce((sum, row) => sum + row.total, 0);
  let updatedAt: string | null = null;
  let lowestLocale: { locale: string; percent: number } | null = null;
  const autoTranslateLocaleCount = sorted.filter((r) => r.autoTranslate).length;

  for (const row of sorted) {
    if (row.updatedAt && (!updatedAt || row.updatedAt > updatedAt)) {
      updatedAt = row.updatedAt;
    }
    if (row.cacheMissing || row.percent == null) continue;
    if (!lowestLocale || row.percent < lowestLocale.percent) {
      lowestLocale = { locale: row.locale, percent: row.percent };
    }
  }

  return {
    shop: base.shop,
    autoTranslate: autoTranslateLocaleCount > 0,
    autoTranslateLocaleCount,
    cacheMissing: sorted.length === 0 || withCache.length === 0,
    localeCount: sorted.length,
    translated,
    total,
    overallPercent:
      withCache.length === 0 ? null : ratioPercent(translated, total),
    lowestLocale,
    updatedAt,
    locales: sorted,
  };
}

async function loadSnapshot(force = false): Promise<Snapshot> {
  if (
    !force &&
    snapshotCache &&
    Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS
  ) {
    return snapshotCache;
  }
  if (snapshotInflight) return snapshotInflight;

  snapshotInflight = (async () => {
    const tursoShops = await listTursoShopsWithLocales();
    const shops = tursoShops.map((base) => buildShopRow(base));

    shops.sort((a, b) => {
      if (a.autoTranslate !== b.autoTranslate) {
        return a.autoTranslate ? -1 : 1;
      }
      const ap = a.overallPercent;
      const bp = b.overallPercent;
      if (ap == null && bp == null) return a.shop.localeCompare(b.shop);
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (bp !== ap) return bp - ap;
      return a.shop.localeCompare(b.shop);
    });

    const tursoLocaleCount = tursoShops.reduce(
      (sum, s) => sum + s.locales.length,
      0,
    );
    const localesWithCoverage = tursoShops.reduce(
      (sum, s) => sum + s.locales.filter((l) => !l.cacheMissing).length,
      0,
    );

    const next: Snapshot = {
      at: Date.now(),
      shops,
      redisKeyCount: localesWithCoverage,
      tursoShopCount: tursoShops.length,
      tursoLocaleCount,
    };
    snapshotCache = next;
    return next;
  })();

  try {
    return await snapshotInflight;
  } finally {
    snapshotInflight = null;
  }
}

function matchesBucket(
  shop: ShopLanguageCoverage,
  bucket: CoverageBucket,
): boolean {
  switch (bucket) {
    case "all":
      return true;
    case "missing":
      return shop.cacheMissing || shop.localeCount === 0;
    case "low":
      return shop.overallPercent != null && shop.overallPercent < 50;
    case "mid":
      return (
        shop.overallPercent != null &&
        shop.overallPercent >= 50 &&
        shop.overallPercent < 90
      );
    case "high":
      return shop.overallPercent != null && shop.overallPercent >= 90;
    default: {
      const _exhaustive: never = bucket;
      return _exhaustive;
    }
  }
}

function formatRelativeUpdatedAt(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const delta = Math.max(0, now - ts);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Owner：入队 TSF shop scan（trigger=admin），Worker 只跑 coverage 并写 Turso。
 * 效果对齐 App 语言页 / v4「刷新统计」（现算 Shopify → ShopTargetLocale.coverage*）。
 */
tsfLanguageCoverageRouter.post("/refresh", requireOwner, async (req, res) => {
  try {
    const shop = normalizeShop(String(req.body?.shop ?? ""));
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      res.status(400).json({ error: "商店域名格式无效" });
      return;
    }
    if (!isTsfDbConfigured()) {
      res.status(503).json({ error: "TSF Turso 未配置" });
      return;
    }
    if (!isCosmosConfigured()) {
      res.status(503).json({ error: "Cosmos 未配置，无法入队扫描" });
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
      res.status(409).json({
        error: "该商店没有可用的 TSF offline Session，无法现算 Shopify 覆盖率",
      });
      return;
    }

    const localeCountResult = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM ShopTargetLocale WHERE shop = ?`,
      args: [shop],
    });
    const localeCount = Number(localeCountResult.rows[0]?.c ?? 0) || 0;
    if (localeCount === 0) {
      res.status(409).json({
        error: "Turso 无 ShopTargetLocale 行；请先在 App 语言页添加目标语言",
      });
      return;
    }

    const container = getShopScanJobsContainer();
    const { resources: activeScans } = await container.items
      .query<{ id: string; status: string; trigger: string; createdAt: string }>(
        {
          query: `SELECT TOP 1 c.id, c.status, c.trigger, c.createdAt
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
        error: `该商店已有进行中的扫描（${activeScans[0].status} / ${activeScans[0].trigger}）`,
        activeScan: activeScans[0],
      });
      return;
    }

    const scanId = buildScanId(shop);
    const now = new Date().toISOString();
    await container.items.upsert({
      id: scanId,
      shopName: shop,
      trigger: "admin",
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
        await redis.lpush(
          SHOP_SCAN_HINT_KEY,
          JSON.stringify({ scanId, shopName: shop }),
        );
        hintPushed = true;
      } catch (error) {
        console.warn(
          `[tsf/language-coverage/refresh] Redis hint failed scan=${scanId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    clearSnapshotCache();

    res.status(202).json({
      enqueued: true,
      scanId,
      shop,
      status: "CREATED",
      trigger: "admin",
      hintPushed,
      note: hintPushed
        ? "已入队：Worker 将现算覆盖率并写入 Turso（trigger=admin，仅 coverage）。"
        : "已写入 Cosmos；Redis hint 未发送，Worker 将轮询领取。",
    });
  } catch (err) {
    console.error("[tsf/language-coverage/refresh]", err);
    res.status(500).json({ error: String(err) });
  }
});

/** 查询单个商店的语言覆盖率数据（按 shop 精确查找）。 */
tsfLanguageCoverageRouter.get("/shop", async (req, res) => {
  try {
    const shop = String(req.query.shop ?? "").trim();
    if (!shop) {
      res.status(400).json({ error: "shop is required" });
      return;
    }
    if (!isTsfDbConfigured()) {
      res.status(503).json({ error: "TSF Turso not configured" });
      return;
    }
    const db = getTsfDb();
    const localesResult = await db.execute({
      sql: `SELECT locale, autoTranslate,
                   coverageTranslated, coverageTotal, coveragePercent, coverageUpdatedAt
            FROM ShopTargetLocale WHERE shop = ? ORDER BY locale ASC`,
      args: [shop],
    });

    const localeRows: LocaleCoverage[] = [];
    for (const row of localesResult.rows) {
      const mapped = mapLocaleRow(row as Record<string, unknown>);
      if (!mapped) continue;
      localeRows.push({
        locale: mapped.locale,
        translated: mapped.translated,
        total: mapped.total,
        percent: mapped.percent,
        updatedAt: mapped.updatedAt,
        cacheMissing: mapped.cacheMissing,
        autoTranslate: mapped.autoTranslate,
      });
    }

    res.json({ shop, locales: localeRows });
  } catch (err) {
    console.error("[tsf/language-coverage/shop]", err);
    res.status(500).json({ error: String(err) });
  }
});

tsfLanguageCoverageRouter.get("/", async (req, res) => {
  try {
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const bucketRaw = String(req.query.bucket ?? "all").trim().toLowerCase();
    const bucket: CoverageBucket = (
      ["all", "low", "mid", "high", "missing"] as const
    ).includes(bucketRaw as CoverageBucket)
      ? (bucketRaw as CoverageBucket)
      : "all";
    const autoRaw = String(req.query.autoTranslate ?? "all")
      .trim()
      .toLowerCase();
    const autoTranslate: AutoTranslateFilter =
      autoRaw === "on" || autoRaw === "off" ? autoRaw : "all";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 20),
    );
    const force = String(req.query.refresh ?? "") === "1";

    const snapshot = await loadSnapshot(force);
    const filtered = snapshot.shops.filter((shop) => {
      if (search && !shop.shop.toLowerCase().includes(search)) return false;
      if (autoTranslate === "on" && !shop.autoTranslate) return false;
      if (autoTranslate === "off" && shop.autoTranslate) return false;
      return matchesBucket(shop, bucket);
    });

    const withCache = snapshot.shops.filter((s) => !s.cacheMissing);
    const withoutCache = snapshot.shops.filter((s) => s.cacheMissing);
    const autoTranslateShops = snapshot.shops.filter((s) => s.autoTranslate)
      .length;
    const lowCoverageShops = withCache.filter(
      (s) => s.overallPercent != null && s.overallPercent < 50,
    ).length;
    const avgOverallPercent =
      withCache.length === 0
        ? null
        : Math.round(
            withCache.reduce((sum, s) => sum + (s.overallPercent ?? 0), 0) /
              withCache.length,
          );

    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize).map((shop) => ({
      ...shop,
      updatedAtLabel: formatRelativeUpdatedAt(shop.updatedAt),
    }));

    res.json({
      stats: {
        tursoShopCount: snapshot.tursoShopCount,
        shopsWithCache: withCache.length,
        shopsWithoutCache: withoutCache.length,
        autoTranslateShops,
        avgOverallPercent,
        lowCoverageShops,
        redisKeyCount: snapshot.redisKeyCount,
        tursoLocaleCount: snapshot.tursoLocaleCount,
        snapshotAt: new Date(snapshot.at).toISOString(),
      },
      shops: pageRows,
      total: filtered.length,
      page,
      pageSize,
      note:
        "商店列表以 Turso Account（在装）为准；自动翻译与覆盖率均来自 ShopTargetLocale（coverage*）。快照约 60s。",
    });
  } catch (err) {
    console.error("[tsf/language-coverage]", err);
    res.status(500).json({ error: String(err) });
  }
});
