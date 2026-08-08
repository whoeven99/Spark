import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfRevenueRouter = Router();

/**
 * Shopify 收费日口径：
 * - 续费：metadata.previousPeriodEnd（周期滚动/扣款日）
 * - 首购/加量包：createdAt
 */
const SHOPIFY_CHARGE_AT = `CASE
  WHEN bl.eventType = 'SUBSCRIPTION_RENEWED'
    THEN COALESCE(json_extract(bl.metadata, '$.previousPeriodEnd'), bl.createdAt)
  ELSE bl.createdAt
END`;

/**
 * Spring→Turso 计费迁移会写入 SUBSCRIPTION_ACTIVATED，
 * metadata.source=legacy_migration，createdAt=迁移日（非真实扣款日）。
 * 每日/明细收入必须排除，否则会出现 7/8–7/9 假尖峰。
 */
const EXCLUDE_LEGACY_MIGRATION =
  "COALESCE(json_extract(bl.metadata, '$.source'), '') <> 'legacy_migration'";

/**
 * 同店 24h 内连改套餐会写多条 SUBSCRIPTION_ACTIVATED（每次新 Shopify GID）。
 * 收入只计突发链中的最后一次，避免按套餐原价叠加虚增。
 * 续费 / 加量包不受影响。
 */
const EXCLUDE_SUPERSEDED_PLAN_CHANGE = `(
  bl.eventType <> 'SUBSCRIPTION_ACTIVATED'
  OR NOT EXISTS (
    SELECT 1 FROM BillingLog later
    WHERE later.shop = bl.shop
      AND later.eventType = 'SUBSCRIPTION_ACTIVATED'
      AND later.createdAt > bl.createdAt
      AND later.createdAt <= datetime(bl.createdAt, '+24 hours')
      AND COALESCE(json_extract(later.metadata, '$.source'), '') <> 'legacy_migration'
  )
)`;

// GET /api/tsf/revenue/summary — MRR/ARR from active TSF subscriptions
tsfRevenueRouter.get("/summary", async (_req, res) => {
  try {
    const db = getTsfDb();

    const [mrrResult, planBreakdownResult, topShopsResult] = await Promise.all([
      db.execute(`
        SELECT
          SUM(
            CASE
              WHEN pc.billingInterval = 'MONTHLY' THEN CAST(pc.priceAmount AS REAL)
              WHEN pc.billingInterval = 'ANNUAL'  THEN CAST(pc.priceAmount AS REAL) / 12.0
              ELSE 0
            END
          ) as mrr,
          COUNT(DISTINCT sub.shop) as payingCustomers
        FROM AppSubscription sub
        INNER JOIN PlanCatalog pc ON sub.planKey = pc.planKey
        WHERE sub.status = 'ACTIVE'
          AND pc.kind = 'SUBSCRIPTION'
          AND CAST(pc.priceAmount AS REAL) > 0
      `),

      db.execute(`
        SELECT
          sub.planKey,
          pc.priceAmount,
          pc.billingInterval,
          pc.kind,
          COUNT(DISTINCT sub.shop) as activeCount,
          SUM(
            CASE
              WHEN pc.billingInterval = 'MONTHLY' THEN CAST(pc.priceAmount AS REAL)
              WHEN pc.billingInterval = 'ANNUAL'  THEN CAST(pc.priceAmount AS REAL) / 12.0
              ELSE 0
            END
          ) as planMrr
        FROM AppSubscription sub
        INNER JOIN PlanCatalog pc ON sub.planKey = pc.planKey
        WHERE sub.status = 'ACTIVE'
          AND pc.kind = 'SUBSCRIPTION'
          AND CAST(pc.priceAmount AS REAL) > 0
        GROUP BY sub.planKey
        ORDER BY planMrr DESC
      `),

      db.execute(`
        SELECT
          sub.shop,
          sub.planKey,
          pc.priceAmount,
          pc.billingInterval,
          CASE
            WHEN pc.billingInterval = 'MONTHLY' THEN CAST(pc.priceAmount AS REAL)
            WHEN pc.billingInterval = 'ANNUAL'  THEN CAST(pc.priceAmount AS REAL) / 12.0
            ELSE 0
          END as shopMrr
        FROM AppSubscription sub
        INNER JOIN PlanCatalog pc ON sub.planKey = pc.planKey
        WHERE sub.status = 'ACTIVE'
          AND pc.kind = 'SUBSCRIPTION'
          AND CAST(pc.priceAmount AS REAL) > 0
        ORDER BY shopMrr DESC
        LIMIT 10
      `),
    ]);

    const mrr = Number(mrrResult.rows[0]?.mrr ?? 0);
    const payingCustomers = Number(mrrResult.rows[0]?.payingCustomers ?? 0);

    res.json({
      mrr,
      arr: mrr * 12,
      payingCustomers,
      arpu: payingCustomers > 0 ? mrr / payingCustomers : 0,
      planBreakdown: planBreakdownResult.rows.map((r) => ({
        planKey: r.planKey as string,
        priceAmount: Number(r.priceAmount ?? 0),
        billingInterval: (r.billingInterval as string | null) ?? null,
        kind: r.kind as string,
        activeCount: Number(r.activeCount ?? 0),
        planMrr: Number(r.planMrr ?? 0),
      })),
      topShops: topShopsResult.rows.map((r) => ({
        shop: r.shop as string,
        planKey: r.planKey as string,
        priceAmount: Number(r.priceAmount ?? 0),
        billingInterval: (r.billingInterval as string | null) ?? null,
        shopMrr: Number(r.shopMrr ?? 0),
      })),
    });
  } catch (err) {
    console.error("[tsf/revenue/summary]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tsf/revenue/trend
tsfRevenueRouter.get("/trend", async (req, res) => {
  try {
    const db = getTsfDb();
    const period = req.query.period === "monthly" ? "monthly" : "daily";
    const startDate = (req.query.startDate as string | undefined)?.trim() ?? "";
    const endDate = (req.query.endDate as string | undefined)?.trim() ?? "";
    const kind = (req.query.kind as string | undefined)?.trim() ?? "";

    const fmt = period === "monthly" ? "%Y-%m" : "%Y-%m-%d";
    const conditions: string[] = [
      "CAST(pc.priceAmount AS REAL) > 0",
      "pc.priceAmount IS NOT NULL",
      "bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'TOKEN_PACK_PURCHASED')",
      EXCLUDE_LEGACY_MIGRATION,
      EXCLUDE_SUPERSEDED_PLAN_CHANGE,
    ];
    const args: string[] = [];

    if (startDate) { conditions.push(`${SHOPIFY_CHARGE_AT} >= ?`); args.push(startDate); }
    if (endDate) { conditions.push(`${SHOPIFY_CHARGE_AT} <= ?`); args.push(`${endDate}T23:59:59`); }
    if (kind) { conditions.push("pc.kind = ?"); args.push(kind); }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
      SELECT
        strftime('${fmt}', ${SHOPIFY_CHARGE_AT}) as period,
        COUNT(*)                         as chargeCount,
        COUNT(DISTINCT bl.shop)          as shopCount,
        ROUND(SUM(CAST(pc.priceAmount AS REAL)), 2) as totalRevenue,
        ROUND(SUM(CASE WHEN pc.kind = 'SUBSCRIPTION'  THEN CAST(pc.priceAmount AS REAL) ELSE 0 END), 2) as subscriptionRevenue,
        ROUND(SUM(CASE WHEN pc.kind = 'ONE_TIME_PACK' THEN CAST(pc.priceAmount AS REAL) ELSE 0 END), 2) as packRevenue
      FROM BillingLog bl
      INNER JOIN PlanCatalog pc ON bl.planKey = pc.planKey
      ${where}
      GROUP BY period
      ORDER BY period ASC
    `;

    const result = args.length
      ? await db.execute({ sql, args })
      : await db.execute(sql);

    res.json({
      trend: result.rows.map((r) => ({
        period: r.period as string,
        chargeCount: Number(r.chargeCount ?? 0),
        shopCount: Number(r.shopCount ?? 0),
        totalRevenue: Number(r.totalRevenue ?? 0),
        subscriptionRevenue: Number(r.subscriptionRevenue ?? 0),
        packRevenue: Number(r.packRevenue ?? 0),
      })),
    });
  } catch (err) {
    console.error("[tsf/revenue/trend]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tsf/revenue/charges
tsfRevenueRouter.get("/charges", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = (req.query.shop as string | undefined)?.trim() ?? "";
    const startDate = (req.query.startDate as string | undefined)?.trim() ?? "";
    const endDate = (req.query.endDate as string | undefined)?.trim() ?? "";
    const kind = (req.query.kind as string | undefined)?.trim() ?? "";
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [
      "CAST(pc.priceAmount AS REAL) > 0",
      "pc.priceAmount IS NOT NULL",
      "bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'TOKEN_PACK_PURCHASED')",
      EXCLUDE_LEGACY_MIGRATION,
      EXCLUDE_SUPERSEDED_PLAN_CHANGE,
    ];
    const args: (string | number)[] = [];

    if (shop) { conditions.push("bl.shop LIKE ?"); args.push(`%${shop}%`); }
    if (startDate) { conditions.push(`${SHOPIFY_CHARGE_AT} >= ?`); args.push(startDate); }
    if (endDate) { conditions.push(`${SHOPIFY_CHARGE_AT} <= ?`); args.push(`${endDate}T23:59:59`); }
    if (kind) { conditions.push("pc.kind = ?"); args.push(kind); }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const fromClause = `
      FROM BillingLog bl
      INNER JOIN PlanCatalog pc ON bl.planKey = pc.planKey
      ${where}
    `;

    const [countResult, chargesResult] = await Promise.all([
      args.length
        ? db.execute({ sql: `SELECT COUNT(*) as total ${fromClause}`, args })
        : db.execute(`SELECT COUNT(*) as total ${fromClause}`),
      args.length
        ? db.execute({
            sql: `SELECT bl.shop, bl.eventType, bl.planKey,
                         pc.priceAmount, pc.billingInterval, pc.kind, bl.createdAt,
                         ${SHOPIFY_CHARGE_AT} as shopifyChargedAt
                  ${fromClause}
                  ORDER BY ${SHOPIFY_CHARGE_AT} DESC, bl.createdAt DESC
                  LIMIT ? OFFSET ?`,
            args: [...args, pageSize, offset],
          })
        : db.execute(
            `SELECT bl.shop, bl.eventType, bl.planKey,
                    pc.priceAmount, pc.billingInterval, pc.kind, bl.createdAt,
                    ${SHOPIFY_CHARGE_AT} as shopifyChargedAt
             ${fromClause}
             ORDER BY ${SHOPIFY_CHARGE_AT} DESC, bl.createdAt DESC
             LIMIT ${pageSize} OFFSET ${offset}`,
          ),
    ]);

    res.json({
      total: Number(countResult.rows[0]?.total ?? 0),
      charges: chargesResult.rows.map((r) => ({
        shop: r.shop as string,
        eventType: r.eventType as string,
        planKey: r.planKey as string,
        priceAmount: Number(r.priceAmount ?? 0),
        billingInterval: (r.billingInterval as string | null) ?? null,
        kind: r.kind as string,
        createdAt: r.createdAt as string,
        shopifyChargedAt: (r.shopifyChargedAt as string) ?? (r.createdAt as string),
      })),
    });
  } catch (err) {
    console.error("[tsf/revenue/charges]", err);
    res.status(500).json({ error: String(err) });
  }
});
