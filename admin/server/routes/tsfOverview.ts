import { Router } from "express";
import { getTsfDb } from "../lib/tsfDb.js";

export const tsfOverviewRouter = Router();

/**
 * TSF 新用户统计概览。
 * 新用户 = Account（TSF 账本主键）；在装 = Account.deletedAt IS NULL。
 * TSF 已废弃 ShopBillingBinding；额度用 Credits，最近事件用 Account 注册 + BillingLog。
 */
tsfOverviewRouter.get("/", async (_req, res) => {
  try {
    const db = getTsfDb();

    const [
      newUsersResult,
      installedResult,
      activeSubsResult,
      creditSumResult,
      recentResult,
    ] = await Promise.all([
      db.execute("SELECT COUNT(*) as total FROM Account"),
      db.execute(
        "SELECT COUNT(*) as total FROM Account WHERE deletedAt IS NULL",
      ),
      db.execute(
        "SELECT COUNT(*) as total FROM AppSubscription WHERE status = 'ACTIVE'",
      ),
      db.execute(
        `SELECT SUM(usedCredits) as totalUsed,
                SUM(subscriptionCredits) as totalSub,
                SUM(purchasedCredits) as totalPurchased,
                SUM(trialCredits) as totalTrial
         FROM Account`,
      ),
      db.execute(
        `SELECT shop, deletedAt, createdAt
         FROM Account
         ORDER BY createdAt DESC
         LIMIT 30`,
      ),
    ]);

    const totalNewUsers = Number(newUsersResult.rows[0]?.total ?? 0);
    const installedNewUsers = Number(installedResult.rows[0]?.total ?? 0);
    const activeSubs = Number(activeSubsResult.rows[0]?.total ?? 0);
    const creditSum = creditSumResult.rows[0] ?? {};

    res.json({
      totalNewUsers,
      installedNewUsers,
      churnedNewUsers: Math.max(0, totalNewUsers - installedNewUsers),
      activeSubs,
      totalUsedCredits: Number(creditSum.totalUsed ?? 0),
      totalSubscriptionCredits: Number(creditSum.totalSub ?? 0),
      totalPurchasedCredits: Number(creditSum.totalPurchased ?? 0),
      totalTrialCredits: Number(creditSum.totalTrial ?? 0),
      recentRegistrations: recentResult.rows.map((r) => ({
        shop: r.shop,
        installed: r.deletedAt == null,
        deletedAt: r.deletedAt ?? null,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("[tsf/overview]", err);
    res.status(500).json({ error: String(err) });
  }
});
