import { Router } from "express";
import { getDb } from "../lib/db.js";

export const overviewRouter = Router();

overviewRouter.get("/", async (_req, res) => {
  try {
    const db = getDb();

    const [shopsResult, activeSubsResult, tokenSumResult, recentEventsResult] =
      await Promise.all([
        db.execute(
          "SELECT COUNT(DISTINCT shop) as total FROM Session WHERE isOnline = 0",
        ),
        db.execute(
          "SELECT COUNT(*) as total FROM AppSubscription WHERE status = 'ACTIVE'",
        ),
        db.execute(
          "SELECT SUM(usedTokens) as totalUsed, SUM(subscriptionTokens) as totalSub, SUM(purchasedTokens) as totalPurchased FROM Account",
        ),
        db.execute(
          "SELECT shop, appName, eventType, topic, createdAt FROM CommonEventLog ORDER BY createdAt DESC LIMIT 30",
        ),
      ]);

    const totalShops = Number(shopsResult.rows[0]?.total ?? 0);
    const activeSubs = Number(activeSubsResult.rows[0]?.total ?? 0);
    const tokenSum = tokenSumResult.rows[0] ?? {};

    const recentEvents = recentEventsResult.rows.map((r) => ({
      shop: r.shop,
      appName: r.appName,
      eventType: r.eventType,
      topic: r.topic,
      createdAt: r.createdAt,
    }));

    res.json({
      totalShops,
      activeSubs,
      totalUsedTokens: Number(tokenSum.totalUsed ?? 0),
      totalSubTokens: Number(tokenSum.totalSub ?? 0),
      totalPurchasedTokens: Number(tokenSum.totalPurchased ?? 0),
      recentEvents,
    });
  } catch (err) {
    console.error("[overview]", err);
    res.status(500).json({ error: String(err) });
  }
});
