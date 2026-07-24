import { Router } from "express";
import { getDb } from "../lib/db.js";

export const revenueRouter = Router();

// GET /api/revenue/summary
// MRR/ARR from active subscriptions + plan breakdown
revenueRouter.get("/summary", async (_req, res) => {
  try {
    const db = getDb();

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
          sub.appName,
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
        appName: r.appName as string,
        planKey: r.planKey as string,
        priceAmount: Number(r.priceAmount ?? 0),
        billingInterval: (r.billingInterval as string | null) ?? null,
        shopMrr: Number(r.shopMrr ?? 0),
      })),
    });
  } catch (err) {
    console.error("[revenue/summary]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/revenue/trend
// Revenue grouped by day or month (BillingLog × PlanCatalog)
revenueRouter.get("/trend", async (req, res) => {
  try {
    const db = getDb();
    const period = req.query.period === "monthly" ? "monthly" : "daily";
    const startDate = (req.query.startDate as string | undefined)?.trim() ?? "";
    const endDate = (req.query.endDate as string | undefined)?.trim() ?? "";
    const kind = (req.query.kind as string | undefined)?.trim() ?? "";

    const fmt = period === "monthly" ? "%Y-%m" : "%Y-%m-%d";
    const conditions: string[] = [
      "CAST(pc.priceAmount AS REAL) > 0",
      "pc.priceAmount IS NOT NULL",
      "bl.eventType IN ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED', 'TOKEN_PACK_PURCHASED')",
    ];
    const args: string[] = [];

    if (startDate) { conditions.push("bl.createdAt >= ?"); args.push(startDate); }
    if (endDate) { conditions.push("bl.createdAt <= ?"); args.push(`${endDate}T23:59:59`); }
    if (kind) { conditions.push("pc.kind = ?"); args.push(kind); }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
      SELECT
        strftime('${fmt}', bl.createdAt) as period,
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
    console.error("[revenue/trend]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/revenue/charges
// Paginated list of individual charge records
revenueRouter.get("/charges", async (req, res) => {
  try {
    const db = getDb();
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
    ];
    const args: (string | number)[] = [];

    if (shop) { conditions.push("bl.shop LIKE ?"); args.push(`%${shop}%`); }
    if (startDate) { conditions.push("bl.createdAt >= ?"); args.push(startDate); }
    if (endDate) { conditions.push("bl.createdAt <= ?"); args.push(`${endDate}T23:59:59`); }
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
            sql: `SELECT bl.shop, bl.appName, bl.eventType, bl.planKey,
                         pc.priceAmount, pc.billingInterval, pc.kind, bl.createdAt
                  ${fromClause}
                  ORDER BY bl.createdAt DESC
                  LIMIT ? OFFSET ?`,
            args: [...args, pageSize, offset],
          })
        : db.execute(
            `SELECT bl.shop, bl.appName, bl.eventType, bl.planKey,
                    pc.priceAmount, pc.billingInterval, pc.kind, bl.createdAt
             ${fromClause}
             ORDER BY bl.createdAt DESC
             LIMIT ${pageSize} OFFSET ${offset}`,
          ),
    ]);

    res.json({
      total: Number(countResult.rows[0]?.total ?? 0),
      charges: chargesResult.rows.map((r) => ({
        shop: r.shop as string,
        appName: r.appName as string,
        eventType: r.eventType as string,
        planKey: r.planKey as string,
        priceAmount: Number(r.priceAmount ?? 0),
        billingInterval: (r.billingInterval as string | null) ?? null,
        kind: r.kind as string,
        createdAt: r.createdAt as string,
      })),
    });
  } catch (err) {
    console.error("[revenue/charges]", err);
    res.status(500).json({ error: String(err) });
  }
});
