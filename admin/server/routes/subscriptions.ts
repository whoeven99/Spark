import { Router } from "express";
import { getDb } from "../lib/db.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";
    const statusFilter = (req.query.status as string | undefined)?.trim() ?? "";
    const planFilter = (req.query.plan as string | undefined)?.trim() ?? "";
    const intervalFilter = (req.query.interval as string | undefined)?.trim() ?? "";

    const [statusStatsResult, intervalStatsResult, planStatsResult, expiringSoonResult] =
      await Promise.all([
        db.execute("SELECT status, COUNT(*) as count FROM AppSubscription GROUP BY status"),
        db.execute(
          "SELECT billingInterval, COUNT(*) as count FROM AppSubscription WHERE status = 'ACTIVE' GROUP BY billingInterval",
        ),
        db.execute(
          `SELECT planKey, COUNT(*) as total,
            SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeCount
          FROM AppSubscription
          GROUP BY planKey
          ORDER BY total DESC`,
        ),
        db.execute(
          `SELECT COUNT(*) as count FROM AppSubscription
          WHERE status = 'ACTIVE'
            AND currentPeriodEnd IS NOT NULL
            AND currentPeriodEnd <= datetime('now', '+30 days')`,
        ),
      ]);

    const conditions: string[] = [];
    const args: string[] = [];
    if (search) { conditions.push("s.shop LIKE ?"); args.push(`%${search}%`); }
    if (statusFilter) { conditions.push("s.status = ?"); args.push(statusFilter); }
    if (planFilter) { conditions.push("s.planKey = ?"); args.push(planFilter); }
    if (intervalFilter) { conditions.push("s.billingInterval = ?"); args.push(intervalFilter); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const listSql = `
      SELECT s.shop, s.appName, s.planKey, s.status, s.billingInterval, s.currentPeriodEnd,
             a.subscriptionTokens, a.purchasedTokens, a.trialTokens, a.usedTokens,
             a.createdAt as accountCreatedAt
      FROM AppSubscription s
      LEFT JOIN Account a ON s.shop = a.shop AND s.appName = a.appName
      ${where}
      ORDER BY
        CASE s.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'FROZEN' THEN 2
                      WHEN 'EXPIRED' THEN 3 WHEN 'CANCELLED' THEN 4 ELSE 5 END,
        s.currentPeriodEnd ASC
      LIMIT 500
    `;

    const listResult = args.length
      ? await db.execute({ sql: listSql, args })
      : await db.execute(listSql);

    const byStatus: Record<string, number> = {};
    for (const row of statusStatsResult.rows) {
      byStatus[row.status as string] = Number(row.count ?? 0);
    }

    const byInterval: Record<string, number> = {};
    for (const row of intervalStatsResult.rows) {
      byInterval[(row.billingInterval as string) ?? "UNKNOWN"] = Number(row.count ?? 0);
    }

    const byPlan = planStatsResult.rows.map((r) => ({
      planKey: (r.planKey as string | null) ?? null,
      total: Number(r.total ?? 0),
      activeCount: Number(r.activeCount ?? 0),
    }));

    const expiringSoon = Number(expiringSoonResult.rows[0]?.count ?? 0);
    const total = Object.values(byStatus).reduce((s, v) => s + v, 0);

    const subscriptions = listResult.rows.map((r) => ({
      shop: r.shop as string,
      appName: r.appName as string,
      planKey: (r.planKey as string | null) ?? null,
      status: r.status as string,
      billingInterval: (r.billingInterval as string | null) ?? null,
      currentPeriodEnd: (r.currentPeriodEnd as string | null) ?? null,
      subscriptionTokens: Number(r.subscriptionTokens ?? 0),
      purchasedTokens: Number(r.purchasedTokens ?? 0),
      trialTokens: Number(r.trialTokens ?? 0),
      usedTokens: Number(r.usedTokens ?? 0),
      accountCreatedAt: (r.accountCreatedAt as string | null) ?? null,
    }));

    res.json({
      stats: { total, byStatus, byInterval, byPlan, expiringSoon },
      subscriptions,
    });
  } catch (err) {
    console.error("[subscriptions]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/subscriptions/billing/trend
subscriptionsRouter.get("/billing/trend", async (req, res) => {
  try {
    const db = getDb();
    const period = req.query.period === "monthly" ? "monthly" : "daily";
    const startDate = (req.query.startDate as string | undefined)?.trim() ?? "";
    const endDate = (req.query.endDate as string | undefined)?.trim() ?? "";
    const eventType = (req.query.eventType as string | undefined)?.trim() ?? "";

    const fmt = period === "monthly" ? "%Y-%m" : "%Y-%m-%d";
    const conditions: string[] = [];
    const args: string[] = [];

    if (startDate) { conditions.push("createdAt >= ?"); args.push(startDate); }
    if (endDate) { conditions.push("createdAt <= ?"); args.push(`${endDate}T23:59:59`); }
    if (eventType) { conditions.push("eventType = ?"); args.push(eventType); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const trendSql = `
      SELECT
        strftime('${fmt}', createdAt) as period,
        COUNT(*) as count,
        SUM(CASE WHEN tokensDelta > 0 THEN tokensDelta ELSE 0 END) as creditTokens,
        SUM(CASE WHEN tokensDelta < 0 THEN ABS(tokensDelta) ELSE 0 END) as debitTokens,
        COUNT(DISTINCT shop) as shopCount
      FROM BillingLog
      ${where}
      GROUP BY period
      ORDER BY period ASC
    `;

    const [trendResult, eventTypesResult] = await Promise.all([
      args.length ? db.execute({ sql: trendSql, args }) : db.execute(trendSql),
      db.execute("SELECT DISTINCT eventType FROM BillingLog ORDER BY eventType"),
    ]);

    res.json({
      trend: trendResult.rows.map((r) => ({
        period: r.period as string,
        count: Number(r.count ?? 0),
        creditTokens: Number(r.creditTokens ?? 0),
        debitTokens: Number(r.debitTokens ?? 0),
        shopCount: Number(r.shopCount ?? 0),
      })),
      eventTypes: eventTypesResult.rows.map((r) => r.eventType as string),
    });
  } catch (err) {
    console.error("[subscriptions/billing/trend]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/subscriptions/billing/events
subscriptionsRouter.get("/billing/events", async (req, res) => {
  try {
    const db = getDb();
    const shop = (req.query.shop as string | undefined)?.trim() ?? "";
    const eventType = (req.query.eventType as string | undefined)?.trim() ?? "";
    const startDate = (req.query.startDate as string | undefined)?.trim() ?? "";
    const endDate = (req.query.endDate as string | undefined)?.trim() ?? "";
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const args: (string | number)[] = [];
    if (shop) { conditions.push("shop LIKE ?"); args.push(`%${shop}%`); }
    if (eventType) { conditions.push("eventType = ?"); args.push(eventType); }
    if (startDate) { conditions.push("createdAt >= ?"); args.push(startDate); }
    if (endDate) { conditions.push("createdAt <= ?"); args.push(`${endDate}T23:59:59`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countResult, eventsResult] = await Promise.all([
      args.length
        ? db.execute({ sql: `SELECT COUNT(*) as total FROM BillingLog ${where}`, args })
        : db.execute(`SELECT COUNT(*) as total FROM BillingLog ${where}`),
      args.length
        ? db.execute({
            sql: `SELECT shop, appName, eventType, planKey, tokensDelta, usedTokens, createdAt
                  FROM BillingLog ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
            args: [...args, pageSize, offset],
          })
        : db.execute(
            `SELECT shop, appName, eventType, planKey, tokensDelta, usedTokens, createdAt
             FROM BillingLog ${where} ORDER BY createdAt DESC LIMIT ${pageSize} OFFSET ${offset}`,
          ),
    ]);

    res.json({
      total: Number(countResult.rows[0]?.total ?? 0),
      events: eventsResult.rows.map((r) => ({
        shop: r.shop as string,
        appName: r.appName as string,
        eventType: r.eventType as string,
        planKey: (r.planKey as string | null) ?? null,
        tokensDelta: Number(r.tokensDelta ?? 0),
        usedTokens: Number(r.usedTokens ?? 0),
        createdAt: r.createdAt as string,
      })),
    });
  } catch (err) {
    console.error("[subscriptions/billing/events]", err);
    res.status(500).json({ error: String(err) });
  }
});

subscriptionsRouter.get("/:shop/billing", async (req, res) => {
  try {
    const db = getDb();
    const shop = req.params.shop;

    const result = await db.execute({
      sql: `SELECT shop, appName, eventType, planKey, tokensDelta, usedTokens, createdAt
            FROM BillingLog WHERE shop = ? ORDER BY createdAt DESC LIMIT 50`,
      args: [shop],
    });

    const billingLogs = result.rows.map((r) => ({
      shop: r.shop as string,
      appName: r.appName as string,
      eventType: r.eventType as string,
      planKey: (r.planKey as string | null) ?? null,
      tokensDelta: Number(r.tokensDelta ?? 0),
      usedTokens: Number(r.usedTokens ?? 0),
      createdAt: r.createdAt as string,
    }));

    res.json({ billingLogs });
  } catch (err) {
    console.error("[subscriptions/billing]", err);
    res.status(500).json({ error: String(err) });
  }
});
