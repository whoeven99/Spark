import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfSubscriptionsRouter = Router();

tsfSubscriptionsRouter.get("/", async (req, res) => {
  try {
    const db = getTsfDb();
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
      SELECT s.shop, s.planKey, s.status, s.billingInterval, s.currentPeriodEnd,
             s.trialEndsAt,
             a.subscriptionCredits, a.purchasedCredits, a.trialCredits, a.usedCredits,
             a.createdAt as accountCreatedAt
      FROM AppSubscription s
      LEFT JOIN Account a ON s.shop = a.shop
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
      planKey: (r.planKey as string | null) ?? null,
      status: r.status as string,
      billingInterval: (r.billingInterval as string | null) ?? null,
      currentPeriodEnd: (r.currentPeriodEnd as string | null) ?? null,
      trialEndsAt: (r.trialEndsAt as string | null) ?? null,
      subscriptionCredits: Number(r.subscriptionCredits ?? 0),
      purchasedCredits: Number(r.purchasedCredits ?? 0),
      trialCredits: Number(r.trialCredits ?? 0),
      usedCredits: Number(r.usedCredits ?? 0),
      accountCreatedAt: (r.accountCreatedAt as string | null) ?? null,
    }));

    res.json({
      stats: { total, byStatus, byInterval, byPlan, expiringSoon },
      subscriptions,
    });
  } catch (err) {
    console.error("[tsf/subscriptions]", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Shopify 续费日口径：
 * 用 BillingLog.metadata.previousPeriodEnd（周期滚动/扣款日），
 * 不用 createdAt（入账日；对账补账会挤在同一天，与 Shopify 不一致）。
 */
const SHOPIFY_RENEWAL_AT = `COALESCE(json_extract(metadata, '$.previousPeriodEnd'), createdAt)`;
const SHOPIFY_RENEWAL_DAY = `date(${SHOPIFY_RENEWAL_AT})`;

// GET /api/tsf/subscriptions/renewals — 每日续费人数（对齐 Shopify 扣款/周期滚动日）
tsfSubscriptionsRouter.get("/renewals", async (req, res) => {
  try {
    const db = getTsfDb();
    const days = Math.min(90, Math.max(7, Number(req.query.days ?? 30) || 30));
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;
    const rangeStart = `date('now', '-${days - 1} days')`;

    const [summaryResult, dailyResult, countResult, eventsResult] = await Promise.all([
      db.execute(`
        SELECT
          COUNT(DISTINCT CASE WHEN ${SHOPIFY_RENEWAL_DAY} = date('now') THEN shop END) as todayShops,
          COUNT(CASE WHEN ${SHOPIFY_RENEWAL_DAY} = date('now') THEN 1 END) as todayEvents,
          COUNT(DISTINCT CASE WHEN ${SHOPIFY_RENEWAL_DAY} = date('now', '-1 day') THEN shop END) as yesterdayShops,
          COUNT(CASE WHEN ${SHOPIFY_RENEWAL_DAY} = date('now', '-1 day') THEN 1 END) as yesterdayEvents,
          COUNT(DISTINCT CASE WHEN ${SHOPIFY_RENEWAL_DAY} >= date('now', '-6 days') THEN shop END) as last7Shops,
          COUNT(CASE WHEN ${SHOPIFY_RENEWAL_DAY} >= date('now', '-6 days') THEN 1 END) as last7Events,
          COUNT(DISTINCT CASE WHEN ${SHOPIFY_RENEWAL_DAY} >= date('now', '-29 days') THEN shop END) as last30Shops,
          COUNT(CASE WHEN ${SHOPIFY_RENEWAL_DAY} >= date('now', '-29 days') THEN 1 END) as last30Events
        FROM BillingLog
        WHERE eventType = 'SUBSCRIPTION_RENEWED'
          AND ${SHOPIFY_RENEWAL_DAY} >= date('now', '-30 days')
      `),
      db.execute(`
        SELECT
          strftime('%Y-%m-%d', ${SHOPIFY_RENEWAL_AT}) as day,
          COUNT(*) as eventCount,
          COUNT(DISTINCT shop) as shopCount
        FROM BillingLog
        WHERE eventType = 'SUBSCRIPTION_RENEWED'
          AND ${SHOPIFY_RENEWAL_DAY} >= ${rangeStart}
        GROUP BY day
        ORDER BY day ASC
      `),
      db.execute(`
        SELECT COUNT(*) as total
        FROM BillingLog
        WHERE eventType = 'SUBSCRIPTION_RENEWED'
          AND ${SHOPIFY_RENEWAL_DAY} >= ${rangeStart}
      `),
      db.execute({
        sql: `
          SELECT
            shop,
            planKey,
            creditsDelta,
            usedCredits,
            createdAt,
            json_extract(metadata, '$.previousPeriodEnd') as previousPeriodEnd,
            json_extract(metadata, '$.nextPeriodEnd') as nextPeriodEnd
          FROM BillingLog
          WHERE eventType = 'SUBSCRIPTION_RENEWED'
            AND ${SHOPIFY_RENEWAL_DAY} >= ${rangeStart}
          ORDER BY ${SHOPIFY_RENEWAL_AT} DESC, createdAt DESC
          LIMIT ? OFFSET ?
        `,
        args: [pageSize, offset],
      }),
    ]);

    const summaryRow = summaryResult.rows[0] ?? {};
    const byDay = new Map(
      dailyResult.rows.map((r) => [
        r.day as string,
        {
          day: r.day as string,
          eventCount: Number(r.eventCount ?? 0),
          shopCount: Number(r.shopCount ?? 0),
        },
      ]),
    );

    const daily: { day: string; eventCount: number; shopCount: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.push(byDay.get(key) ?? { day: key, eventCount: 0, shopCount: 0 });
    }

    res.json({
      summary: {
        todayShops: Number(summaryRow.todayShops ?? 0),
        todayEvents: Number(summaryRow.todayEvents ?? 0),
        yesterdayShops: Number(summaryRow.yesterdayShops ?? 0),
        yesterdayEvents: Number(summaryRow.yesterdayEvents ?? 0),
        last7Shops: Number(summaryRow.last7Shops ?? 0),
        last7Events: Number(summaryRow.last7Events ?? 0),
        last30Shops: Number(summaryRow.last30Shops ?? 0),
        last30Events: Number(summaryRow.last30Events ?? 0),
      },
      daily,
      total: Number(countResult.rows[0]?.total ?? 0),
      events: eventsResult.rows.map((r) => ({
        shop: r.shop as string,
        planKey: (r.planKey as string | null) ?? null,
        creditsDelta: Number(r.creditsDelta ?? 0),
        usedCredits: Number(r.usedCredits ?? 0),
        createdAt: r.createdAt as string,
        previousPeriodEnd: (r.previousPeriodEnd as string | null) ?? null,
        nextPeriodEnd: (r.nextPeriodEnd as string | null) ?? null,
        shopifyRenewedAt:
          (r.previousPeriodEnd as string | null) ?? (r.createdAt as string),
      })),
    });
  } catch (err) {
    console.error("[tsf/subscriptions/renewals]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tsf/subscriptions/billing/trend
tsfSubscriptionsRouter.get("/billing/trend", async (req, res) => {
  try {
    const db = getTsfDb();
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
        SUM(CASE WHEN creditsDelta > 0 THEN creditsDelta ELSE 0 END) as creditGranted,
        SUM(CASE WHEN creditsDelta < 0 THEN ABS(creditsDelta) ELSE 0 END) as creditConsumed,
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
        creditGranted: Number(r.creditGranted ?? 0),
        creditConsumed: Number(r.creditConsumed ?? 0),
        shopCount: Number(r.shopCount ?? 0),
      })),
      eventTypes: eventTypesResult.rows.map((r) => r.eventType as string),
    });
  } catch (err) {
    console.error("[tsf/subscriptions/billing/trend]", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/tsf/subscriptions/billing/events
tsfSubscriptionsRouter.get("/billing/events", async (req, res) => {
  try {
    const db = getTsfDb();
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
            sql: `SELECT shop, eventType, planKey, creditsDelta, usedCredits, createdAt
                  FROM BillingLog ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
            args: [...args, pageSize, offset],
          })
        : db.execute(
            `SELECT shop, eventType, planKey, creditsDelta, usedCredits, createdAt
             FROM BillingLog ${where} ORDER BY createdAt DESC LIMIT ${pageSize} OFFSET ${offset}`,
          ),
    ]);

    res.json({
      total: Number(countResult.rows[0]?.total ?? 0),
      events: eventsResult.rows.map((r) => ({
        shop: r.shop as string,
        eventType: r.eventType as string,
        planKey: (r.planKey as string | null) ?? null,
        creditsDelta: Number(r.creditsDelta ?? 0),
        usedCredits: Number(r.usedCredits ?? 0),
        createdAt: r.createdAt as string,
      })),
    });
  } catch (err) {
    console.error("[tsf/subscriptions/billing/events]", err);
    res.status(500).json({ error: String(err) });
  }
});

tsfSubscriptionsRouter.get("/:shop/billing", async (req, res) => {
  try {
    const db = getTsfDb();
    const shop = req.params.shop;

    const result = await db.execute({
      sql: `SELECT shop, eventType, planKey, creditsDelta, usedCredits, createdAt
            FROM BillingLog WHERE shop = ? ORDER BY createdAt DESC LIMIT 50`,
      args: [shop],
    });

    res.json({
      billingLogs: result.rows.map((r) => ({
        shop: r.shop as string,
        eventType: r.eventType as string,
        planKey: (r.planKey as string | null) ?? null,
        creditsDelta: Number(r.creditsDelta ?? 0),
        usedCredits: Number(r.usedCredits ?? 0),
        createdAt: r.createdAt as string,
      })),
    });
  } catch (err) {
    console.error("[tsf/subscriptions/billing]", err);
    res.status(500).json({ error: String(err) });
  }
});
