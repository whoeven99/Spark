import { Router } from "express";
import { getDb } from "../lib/db.js";

export const shopsRouter = Router();

shopsRouter.get("/", async (req, res) => {
  try {
    const db = getDb();
    const search = (req.query.search as string | undefined)?.trim() ?? "";

    const baseQuery = `
      SELECT
        a.shop,
        a.appName,
        a.subscriptionTokens,
        a.purchasedTokens,
        a.trialTokens,
        a.usedTokens,
        a.createdAt  AS accountCreatedAt,
        a.updatedAt  AS accountUpdatedAt,
        sub.planKey,
        sub.status   AS subStatus,
        sub.billingInterval,
        sub.currentPeriodEnd
      FROM Account a
      LEFT JOIN AppSubscription sub
        ON a.shop = sub.shop AND a.appName = sub.appName
      ${search ? "WHERE a.shop LIKE ?" : ""}
      ORDER BY a.updatedAt DESC
      LIMIT 200
    `;

    const result = search
      ? await db.execute({ sql: baseQuery, args: [`%${search}%`] })
      : await db.execute(baseQuery);

    const rows = result.rows.map((r) => ({
      shop: r.shop,
      appName: r.appName,
      subscriptionTokens: Number(r.subscriptionTokens ?? 0),
      purchasedTokens: Number(r.purchasedTokens ?? 0),
      trialTokens: Number(r.trialTokens ?? 0),
      usedTokens: Number(r.usedTokens ?? 0),
      accountCreatedAt: r.accountCreatedAt,
      accountUpdatedAt: r.accountUpdatedAt,
      planKey: r.planKey ?? null,
      subStatus: r.subStatus ?? null,
      billingInterval: r.billingInterval ?? null,
      currentPeriodEnd: r.currentPeriodEnd ?? null,
    }));

    res.json({ shops: rows });
  } catch (err) {
    console.error("[shops]", err);
    res.status(500).json({ error: String(err) });
  }
});

shopsRouter.get("/:shop/events", async (req, res) => {
  try {
    const db = getDb();
    const shop = req.params.shop;

    const [eventsResult, billingResult] = await Promise.all([
      db.execute({
        sql: "SELECT shop, appName, eventType, topic, createdAt FROM CommonEventLog WHERE shop = ? ORDER BY createdAt DESC LIMIT 50",
        args: [shop],
      }),
      db.execute({
        sql: "SELECT shop, appName, eventType, planKey, tokensDelta, usedTokens, createdAt FROM BillingLog WHERE shop = ? ORDER BY createdAt DESC LIMIT 30",
        args: [shop],
      }),
    ]);

    res.json({
      events: eventsResult.rows,
      billingLogs: billingResult.rows,
    });
  } catch (err) {
    console.error("[shops/events]", err);
    res.status(500).json({ error: String(err) });
  }
});
