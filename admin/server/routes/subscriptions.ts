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
