import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfShopProfilesRouter = Router();

type DistributionRow = { value: string; count: number };
type IndustryPaymentLeaderRow = {
  value: string;
  totalShops: number;
  paidShops: number;
  activeSubscriptionCount: number;
  paymentRate: number;
};

const BILLING_AGGREGATE_SQL = `
  SELECT
    bl.shop,
    MIN(CASE
      WHEN bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'TOKEN_PACK_PURCHASED')
      THEN bl.createdAt
    END) AS firstPaidAt,
    MIN(CASE WHEN bl.eventType = 'SUBSCRIPTION_ACTIVATED' THEN bl.createdAt END) AS firstSubscriptionAt,
    MAX(CASE WHEN bl.eventType = 'SUBSCRIPTION_CANCELLED' THEN bl.createdAt END) AS cancelledAt,
    MAX(CASE
      WHEN bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'TOKEN_PACK_PURCHASED')
      THEN bl.createdAt
    END) AS lastPaidAt,
    MAX(bl.createdAt) AS lastBillingEventAt,
    SUM(CASE
      WHEN bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'TOKEN_PACK_PURCHASED')
      THEN 1 ELSE 0
    END) AS paidChargeCount,
    SUM(CASE WHEN bl.eventType = 'TOKEN_PACK_PURCHASED' THEN 1 ELSE 0 END) AS packPurchaseCount,
    ROUND(SUM(CASE
      WHEN bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'TOKEN_PACK_PURCHASED')
      THEN CAST(COALESCE(pc.priceAmount, 0) AS REAL) ELSE 0
    END), 2) AS totalRevenueUsd,
    MAX(CASE
      WHEN bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'TOKEN_PACK_PURCHASED') THEN 1 ELSE 0
    END) AS hasPaid,
    MAX(CASE WHEN bl.eventType = 'SUBSCRIPTION_ACTIVATED' THEN 1 ELSE 0 END) AS hasSubscriptionActivated,
    MAX(CASE WHEN bl.eventType = 'SUBSCRIPTION_CANCELLED' THEN 1 ELSE 0 END) AS hasCancelled
  FROM BillingLog bl
  LEFT JOIN PlanCatalog pc ON pc.planKey = bl.planKey
  GROUP BY bl.shop
`;

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseKeywords(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function normalizeGroupValue(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
  return value || "未填写";
}

async function loadDistribution(
  sql: string,
  args: Array<string | number>,
): Promise<DistributionRow[]> {
  const db = getTsfDb();
  const result = await db.execute({ sql, args });
  return result.rows.map((row) => ({
    value: normalizeGroupValue(row.value),
    count: Number(row.count ?? 0),
  }));
}

async function loadIndustryPaymentLeaders(
  whereClause: string,
  args: Array<string | number>,
): Promise<IndustryPaymentLeaderRow[]> {
  const db = getTsfDb();
  const result = await db.execute({
    sql: `
      WITH billingAgg AS (${BILLING_AGGREGATE_SQL})
      SELECT
        COALESCE(NULLIF(TRIM(p.industry), ''), '未填写') AS value,
        COUNT(*) AS totalShops,
        SUM(CASE WHEN COALESCE(ba.hasPaid, 0) = 1 THEN 1 ELSE 0 END) AS paidShops,
        SUM(CASE WHEN sub.status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeSubscriptionCount,
        ROUND(
          CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE 100.0 * SUM(CASE WHEN COALESCE(ba.hasPaid, 0) = 1 THEN 1 ELSE 0 END) / COUNT(*)
          END,
          1
        ) AS paymentRate
      FROM ShopProfile p
      LEFT JOIN billingAgg ba ON ba.shop = p.shop
      LEFT JOIN AppSubscription sub ON sub.shop = p.shop
      ${whereClause}
      GROUP BY 1
      ORDER BY paidShops DESC, totalShops DESC, value ASC
      LIMIT 8
    `,
    args,
  });
  return result.rows.map((row) => ({
    value: normalizeGroupValue(row.value),
    totalShops: Number(row.totalShops ?? 0),
    paidShops: Number(row.paidShops ?? 0),
    activeSubscriptionCount: Number(row.activeSubscriptionCount ?? 0),
    paymentRate: Number(row.paymentRate ?? 0),
  }));
}

/** TSF 店铺画像列表：读取 TSF Turso ShopProfile，并补充绑定/订阅信息方便后台筛选。 */
tsfShopProfilesRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 20), 100);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const args: Array<string | number> = [];

    if (search) {
      const keyword = `%${search}%`;
      conditions.push(
        `(p.shop LIKE ? OR COALESCE(p.shopName, '') LIKE ? OR COALESCE(p.industry, '') LIKE ? OR COALESCE(p.description, '') LIKE ?)`,
      );
      args.push(keyword, keyword, keyword, keyword);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countResult, summaryResult, localeDistribution, industryDistribution, brandToneDistribution, planDistribution, industryPaymentLeaders, listResult] = await Promise.all([
      db.execute({
        sql: `SELECT COUNT(*) AS total FROM ShopProfile p ${whereClause}`,
        args,
      }),
      db.execute({
        sql: `
          WITH billingAgg AS (${BILLING_AGGREGATE_SQL})
          SELECT
            COUNT(*) AS totalProfiles,
            SUM(CASE WHEN COALESCE(TRIM(p.description), '') <> '' THEN 1 ELSE 0 END) AS withDescriptionCount,
            SUM(CASE WHEN COALESCE(TRIM(CAST(p.keywords AS TEXT)), '') NOT IN ('', '[]') THEN 1 ELSE 0 END) AS withKeywordsCount,
            SUM(CASE WHEN COALESCE(TRIM(p.brandTone), '') <> '' THEN 1 ELSE 0 END) AS withBrandToneCount,
            SUM(CASE WHEN COALESCE(TRIM(p.industry), '') <> '' THEN 1 ELSE 0 END) AS withIndustryCount,
            SUM(CASE WHEN sub.status = 'ACTIVE' THEN 1 ELSE 0 END) AS activeSubscriptionCount,
            SUM(CASE WHEN sess.sessionCount > 0 THEN 1 ELSE 0 END) AS installedShopCount,
            SUM(CASE WHEN COALESCE(ba.hasPaid, 0) = 1 THEN 1 ELSE 0 END) AS paidShopCount,
            SUM(CASE WHEN COALESCE(ba.hasSubscriptionActivated, 0) = 1 THEN 1 ELSE 0 END) AS subscribedShopCount,
            SUM(CASE WHEN COALESCE(ba.hasCancelled, 0) = 1 THEN 1 ELSE 0 END) AS cancelledShopCount,
            ROUND(SUM(COALESCE(ba.totalRevenueUsd, 0)), 2) AS totalRevenueUsd,
            SUM(
              CASE
                WHEN datetime(COALESCE(a.updatedAt, ba.lastBillingEventAt, p.lastScannedAt, p.updatedAt, p.createdAt)) >= datetime('now', '-7 days')
                THEN 1 ELSE 0
              END
            ) AS activeSignal7Days,
            SUM(
              CASE
                WHEN datetime(COALESCE(a.updatedAt, ba.lastBillingEventAt, p.lastScannedAt, p.updatedAt, p.createdAt)) >= datetime('now', '-30 days')
                THEN 1 ELSE 0
              END
            ) AS activeSignal30Days,
            SUM(CASE WHEN datetime(p.lastScannedAt) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS scannedLast7Days,
            SUM(CASE WHEN datetime(p.lastScannedAt) >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS scannedLast30Days
          FROM ShopProfile p
          LEFT JOIN billingAgg ba ON ba.shop = p.shop
          LEFT JOIN Account a ON a.shop = p.shop
          LEFT JOIN (
            SELECT shop, COUNT(*) AS sessionCount
            FROM Session
            GROUP BY shop
          ) sess ON sess.shop = p.shop
          LEFT JOIN AppSubscription sub ON sub.shop = p.shop
          ${whereClause}
        `,
        args,
      }),
      loadDistribution(
        `
          SELECT COALESCE(NULLIF(TRIM(p.primaryLocale), ''), '未填写') AS value, COUNT(*) AS count
          FROM ShopProfile p
          ${whereClause}
          GROUP BY 1
          ORDER BY count DESC, value ASC
          LIMIT 8
        `,
        args,
      ),
      loadDistribution(
        `
          SELECT COALESCE(NULLIF(TRIM(p.industry), ''), '未填写') AS value, COUNT(*) AS count
          FROM ShopProfile p
          ${whereClause}
          GROUP BY 1
          ORDER BY count DESC, value ASC
          LIMIT 8
        `,
        args,
      ),
      loadDistribution(
        `
          SELECT COALESCE(NULLIF(TRIM(p.brandTone), ''), '未填写') AS value, COUNT(*) AS count
          FROM ShopProfile p
          ${whereClause}
          GROUP BY 1
          ORDER BY count DESC, value ASC
          LIMIT 8
        `,
        args,
      ),
      loadDistribution(
        `
          WITH billingAgg AS (${BILLING_AGGREGATE_SQL})
          SELECT COALESCE(NULLIF(TRIM(sub.planKey), ''), '未订阅') AS value, COUNT(*) AS count
          FROM ShopProfile p
          LEFT JOIN billingAgg ba ON ba.shop = p.shop
          LEFT JOIN AppSubscription sub ON sub.shop = p.shop
          ${whereClause}
          GROUP BY 1
          ORDER BY count DESC, value ASC
          LIMIT 8
        `,
        args,
      ),
      loadIndustryPaymentLeaders(whereClause, args),
      db.execute({
        sql: `
          WITH billingAgg AS (${BILLING_AGGREGATE_SQL})
          SELECT
            p.shop,
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
            p.updatedAt,
            a.updatedAt AS accountUpdatedAt,
            COALESCE(sess.sessionCount, 0) AS sessionCount,
            b.billingSystem,
            b.boundReason,
            sub.planKey,
            sub.status AS subStatus,
            ba.firstPaidAt,
            ba.firstSubscriptionAt,
            ba.cancelledAt,
            ba.lastPaidAt,
            ba.lastBillingEventAt,
            ba.paidChargeCount,
            ba.packPurchaseCount,
            ba.totalRevenueUsd,
            ba.hasPaid,
            ba.hasSubscriptionActivated,
            ba.hasCancelled
          FROM ShopProfile p
          LEFT JOIN Account a ON a.shop = p.shop
          LEFT JOIN (
            SELECT shop, COUNT(*) AS sessionCount
            FROM Session
            GROUP BY shop
          ) sess ON sess.shop = p.shop
          LEFT JOIN ShopBillingBinding b ON b.shop = p.shop
          LEFT JOIN AppSubscription sub ON sub.shop = p.shop
          LEFT JOIN billingAgg ba ON ba.shop = p.shop
          ${whereClause}
          ORDER BY COALESCE(p.lastScannedAt, p.updatedAt, p.createdAt) DESC
          LIMIT ? OFFSET ?
        `,
        args: [...args, pageSize, offset],
      }),
    ]);

    const rows = listResult.rows.map((row) => ({
      shop: String(row.shop ?? ""),
      shopName: row.shopName ? String(row.shopName) : null,
      primaryLocale: row.primaryLocale ? String(row.primaryLocale) : null,
      industry: row.industry ? String(row.industry) : null,
      keywords: parseKeywords(row.keywords),
      description: row.description ? String(row.description) : null,
      brandTone: row.brandTone ? String(row.brandTone) : null,
      aiModel: row.aiModel ? String(row.aiModel) : null,
      lastScanId: row.lastScanId ? String(row.lastScanId) : null,
      lastScannedAt: row.lastScannedAt ? String(row.lastScannedAt) : null,
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
      accountUpdatedAt: row.accountUpdatedAt ? String(row.accountUpdatedAt) : null,
      sessionCount: Number(row.sessionCount ?? 0),
      installed: Number(row.sessionCount ?? 0) > 0,
      billingSystem: row.billingSystem ? String(row.billingSystem) : null,
      boundReason: row.boundReason ? String(row.boundReason) : null,
      planKey: row.planKey ? String(row.planKey) : null,
      subStatus: row.subStatus ? String(row.subStatus) : null,
      firstPaidAt: row.firstPaidAt ? String(row.firstPaidAt) : null,
      firstSubscriptionAt: row.firstSubscriptionAt ? String(row.firstSubscriptionAt) : null,
      cancelledAt: row.cancelledAt ? String(row.cancelledAt) : null,
      lastPaidAt: row.lastPaidAt ? String(row.lastPaidAt) : null,
      lastBillingEventAt: row.lastBillingEventAt ? String(row.lastBillingEventAt) : null,
      paidChargeCount: Number(row.paidChargeCount ?? 0),
      packPurchaseCount: Number(row.packPurchaseCount ?? 0),
      totalRevenueUsd: Number(row.totalRevenueUsd ?? 0),
      hasPaid: Number(row.hasPaid ?? 0) > 0,
      hasSubscriptionActivated: Number(row.hasSubscriptionActivated ?? 0) > 0,
      hasCancelled: Number(row.hasCancelled ?? 0) > 0,
    }));

    res.json({
      rows,
      total: Number(countResult.rows[0]?.total ?? 0),
      page,
      pageSize,
      summary: {
        totalProfiles: Number(summaryResult.rows[0]?.totalProfiles ?? 0),
        withDescriptionCount: Number(summaryResult.rows[0]?.withDescriptionCount ?? 0),
        withKeywordsCount: Number(summaryResult.rows[0]?.withKeywordsCount ?? 0),
        withBrandToneCount: Number(summaryResult.rows[0]?.withBrandToneCount ?? 0),
        withIndustryCount: Number(summaryResult.rows[0]?.withIndustryCount ?? 0),
        activeSubscriptionCount: Number(summaryResult.rows[0]?.activeSubscriptionCount ?? 0),
        installedShopCount: Number(summaryResult.rows[0]?.installedShopCount ?? 0),
        paidShopCount: Number(summaryResult.rows[0]?.paidShopCount ?? 0),
        subscribedShopCount: Number(summaryResult.rows[0]?.subscribedShopCount ?? 0),
        cancelledShopCount: Number(summaryResult.rows[0]?.cancelledShopCount ?? 0),
        totalRevenueUsd: Number(summaryResult.rows[0]?.totalRevenueUsd ?? 0),
        activeSignal7Days: Number(summaryResult.rows[0]?.activeSignal7Days ?? 0),
        activeSignal30Days: Number(summaryResult.rows[0]?.activeSignal30Days ?? 0),
        scannedLast7Days: Number(summaryResult.rows[0]?.scannedLast7Days ?? 0),
        scannedLast30Days: Number(summaryResult.rows[0]?.scannedLast30Days ?? 0),
        localeDistribution,
        industryDistribution,
        brandToneDistribution,
        planDistribution,
        industryPaymentLeaders,
      },
    });
  } catch (err) {
    console.error("[tsf/shop-profiles]", err);
    res.status(500).json({ error: String(err) });
  }
});
