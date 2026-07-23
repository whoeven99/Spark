import { Router } from "express";
import { batchHgetall, getRedis } from "../lib/redis.js";
import { getTsfDb, isTsfDbConfigured } from "../lib/tsfDb.js";

export const tsfLanguageCoverageRouter = Router();

const ITEMS_COUNT_PREFIX = "tsf:items_count:";
const SNAPSHOT_TTL_MS = 60_000;

/** 与 TSF COVERAGE_COUNT_LABELS 对应的 module（不含 SHOP_POLICY）。 */
const COVERAGE_MODULES = new Set([
  "PRODUCT",
  "COLLECTION",
  "ARTICLE",
  "BLOG",
  "PAGE",
  "FILTER",
  "METAOBJECT",
  "METAFIELD",
  "DELIVERY_METHOD_DEFINITION",
  "SHOP",
  "MENU",
  "LINK",
  "EMAIL_TEMPLATE",
  "PACKING_SLIP_TEMPLATE",
  "ONLINE_STORE_THEME_JSON_TEMPLATE",
  "ONLINE_STORE_THEME_SECTION_GROUP",
  "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
  "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
  "ONLINE_STORE_THEME_LOCALE_CONTENT",
]);

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

type TursoShopBase = {
  shop: string;
  locales: Array<{ locale: string; autoTranslate: boolean }>;
};

type Snapshot = {
  at: number;
  shops: ShopLanguageCoverage[];
  redisKeyCount: number;
  tursoShopCount: number;
};

let snapshotCache: Snapshot | null = null;
let snapshotInflight: Promise<Snapshot> | null = null;

function ratioPercent(translated: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((translated / total) * 100));
}

function itemsCountKey(shop: string, locale: string): string {
  return `${ITEMS_COUNT_PREFIX}${shop}:${locale}`;
}

function aggregateModuleHash(hash: Record<string, string>): {
  translated: number;
  total: number;
  updatedAt: string | null;
  empty: boolean;
} {
  let translated = 0;
  let total = 0;
  let updatedAt: string | null = null;
  let sawCoverageModule = false;
  const entries = Object.entries(hash);
  if (entries.length === 0) {
    return { translated: 0, total: 0, updatedAt: null, empty: true };
  }

  for (const [module, raw] of entries) {
    if (!COVERAGE_MODULES.has(module)) continue;
    sawCoverageModule = true;
    try {
      const value = JSON.parse(raw) as {
        total?: unknown;
        translated?: unknown;
        updatedAt?: unknown;
      };
      if (typeof value.total === "number") total += value.total;
      if (typeof value.translated === "number") translated += value.translated;
      if (
        typeof value.updatedAt === "string" &&
        value.updatedAt &&
        (!updatedAt || value.updatedAt > updatedAt)
      ) {
        updatedAt = value.updatedAt;
      }
    } catch {
      // ignore malformed field
    }
  }

  if (!sawCoverageModule) {
    for (const [, raw] of entries) {
      try {
        const value = JSON.parse(raw) as {
          total?: unknown;
          translated?: unknown;
          updatedAt?: unknown;
        };
        if (typeof value.total === "number") total += value.total;
        if (typeof value.translated === "number") translated += value.translated;
        if (
          typeof value.updatedAt === "string" &&
          value.updatedAt &&
          (!updatedAt || value.updatedAt > updatedAt)
        ) {
          updatedAt = value.updatedAt;
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    translated,
    total,
    updatedAt,
    empty: total <= 0 && translated <= 0 && !updatedAt,
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
      `SELECT shop, locale, autoTranslate
       FROM ShopTargetLocale
       ORDER BY shop ASC, locale ASC`,
    ),
  ]);

  const localeByShop = new Map<
    string,
    Array<{ locale: string; autoTranslate: boolean }>
  >();
  for (const row of locales.rows) {
    const shop = String(row.shop ?? "").trim();
    const locale = String(row.locale ?? "").trim();
    if (!shop || !locale) continue;
    const autoRaw = row.autoTranslate;
    const autoTranslate =
      autoRaw === 1 ||
      autoRaw === "1" ||
      String(autoRaw).toLowerCase() === "true";
    const list = localeByShop.get(shop) ?? [];
    list.push({ locale, autoTranslate });
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

function buildShopRow(
  base: TursoShopBase,
  localeRows: LocaleCoverage[],
): ShopLanguageCoverage {
  const sorted = [...localeRows].sort((a, b) =>
    a.locale.localeCompare(b.locale, "en"),
  );
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
    const redis = getRedis();
    if (!redis) {
      throw new Error("Redis not configured (REDIS_URL)");
    }

    const keySpecs: Array<{ shop: string; locale: string; key: string }> = [];
    for (const shop of tursoShops) {
      for (const loc of shop.locales) {
        keySpecs.push({
          shop: shop.shop,
          locale: loc.locale,
          key: itemsCountKey(shop.shop, loc.locale),
        });
      }
    }

    const hashes =
      keySpecs.length > 0
        ? await batchHgetall(
            redis,
            keySpecs.map((spec) => spec.key),
          )
        : [];

    const coverageByShopLocale = new Map<
      string,
      {
        translated: number;
        total: number;
        percent: number | null;
        updatedAt: string | null;
        cacheMissing: boolean;
      }
    >();

    for (let i = 0; i < keySpecs.length; i++) {
      const spec = keySpecs[i]!;
      const agg = aggregateModuleHash(hashes[i] ?? {});
      const cacheMissing = agg.empty;
      coverageByShopLocale.set(`${spec.shop}\0${spec.locale}`, {
        translated: agg.translated,
        total: agg.total,
        percent: cacheMissing
          ? null
          : ratioPercent(agg.translated, agg.total),
        updatedAt: agg.updatedAt,
        cacheMissing,
      });
    }

    const shops = tursoShops.map((base) => {
      const localeRows: LocaleCoverage[] = base.locales.map((loc) => {
        const hit = coverageByShopLocale.get(`${base.shop}\0${loc.locale}`);
        return {
          locale: loc.locale,
          translated: hit?.translated ?? 0,
          total: hit?.total ?? 0,
          percent: hit?.percent ?? null,
          updatedAt: hit?.updatedAt ?? null,
          cacheMissing: hit?.cacheMissing ?? true,
          autoTranslate: loc.autoTranslate,
        };
      });
      return buildShopRow(base, localeRows);
    });

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

    const next: Snapshot = {
      at: Date.now(),
      shops,
      redisKeyCount: keySpecs.length,
      tursoShopCount: tursoShops.length,
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
        snapshotAt: new Date(snapshot.at).toISOString(),
      },
      shops: pageRows,
      total: filtered.length,
      page,
      pageSize,
      note:
        "商店列表以 Turso Account（在装）为准；目标语言/自动翻译来自 ShopTargetLocale；覆盖率按需查 Redis tsf:items_count:{shop}:{locale}。快照约 60s。",
    });
  } catch (err) {
    console.error("[tsf/language-coverage]", err);
    res.status(500).json({ error: String(err) });
  }
});
